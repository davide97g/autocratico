import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import type { ImapSetup } from "@autocratico/core"
import { describe, expect, it } from "vitest"

import { Account } from "../src/account.ts"
import { createApp } from "../src/app.ts"
import { loadConfig } from "../src/config.ts"
import { Imap, ImapError } from "../src/imap.ts"
import { services } from "../src/services.ts"
import { LOCAL, owner, post, setup } from "./helpers.ts"

const PASSWORD = "abcd efgh ijkl mnop"
const YAHOO = { name: "yahoo", host: "imap.mail.yahoo.com", user: "maria@yahoo.com", password: PASSWORD }

/** A server on a copy of example/ whose IMAP sign-in check is fake, recording what it was sent. */
function withImap(accept = true) {
  const checked: { host: string; port: number; user: string; password: string }[] = []
  const imap = (data: string) =>
    new Imap(data, async (conn) => {
      checked.push(conn)
      if (!accept) throw new ImapError(400, "imap.mail.yahoo.com: sign-in refused (AUTHENTICATE failed)")
      return { folders: ["INBOX", "Bulk", "Sent"] }
    })
  const { data } = setup()
  const config = loadConfig({ data, jobs: false, telegramToken: null, claude: null })
  const app = createApp(services(config, { jobs: null, telegram: null, verifyAccess: null, account: new Account(config, ":memory:"), imap: imap(data) }))
  return { app, data, checked }
}

async function json<T>(r: Response | Promise<Response>): Promise<T> {
  return (await (await r).json()) as T
}

describe("IMAP setup", () => {
  it("needs the owner's session", async () => {
    const { app } = withImap()
    expect((await app.request("/api/imap", { headers: LOCAL })).status).toBe(401)
  })

  it("checks the sign-in, then keeps the password private and never sends it back", async () => {
    const { app, data, checked } = withImap()
    const h = await owner(app)
    const r = await post(app, "/api/imap/accounts", YAHOO, h)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ folders: ["INBOX", "Bulk", "Sent"] })
    expect(checked).toEqual([{ host: "imap.mail.yahoo.com", port: 993, user: "maria@yahoo.com", password: PASSWORD }])

    const secret = join(data, "secrets", "imap", "yahoo.json")
    expect(statSync(secret).mode & 0o777).toBe(0o600)
    expect(statSync(join(data, "secrets", "imap")).mode & 0o777).toBe(0o700)
    // imap.toml names no host: an edit there cannot send the password elsewhere.
    const toml = readFileSync(join(data, "imap.toml"), "utf8")
    expect(toml).not.toContain(PASSWORD)
    expect(toml).not.toContain("yahoo.com")

    const s = await json<ImapSetup>(app.request("/api/imap", { headers: h }))
    expect(s.accounts).toEqual([{ name: "yahoo", host: "imap.mail.yahoo.com", port: 993, user: "maria@yahoo.com", folders: ["INBOX"], days: 365, state: "connected" }])
    expect(JSON.stringify(s)).not.toContain(PASSWORD)
  })

  it("saves nothing when the sign-in fails", async () => {
    const { app, data } = withImap(false)
    const h = await owner(app)
    const r = await post(app, "/api/imap/accounts", YAHOO, h)
    expect(r.status).toBe(400)
    expect(((await r.json()) as { error: string }).error).toContain("sign-in refused")
    expect(existsSync(join(data, "secrets", "imap", "yahoo.json"))).toBe(false)
    expect(existsSync(join(data, "imap.toml"))).toBe(false)
  })

  it("rejects hosts that are not public names, and unknown folders", async () => {
    const { app, checked } = withImap()
    const h = await owner(app)
    for (const host of ["127.0.0.1", "localhost", "imap.example.com:25", "http://imap.example.com"]) {
      expect((await post(app, "/api/imap/accounts", { ...YAHOO, host }, h)).status).toBe(400)
    }
    expect(checked).toHaveLength(0)
    const r = await post(app, "/api/imap/accounts", { ...YAHOO, folders: ["INBOX", "Paperwork"] }, h)
    expect(r.status).toBe(400)
    expect(((await r.json()) as { error: string }).error).toContain("Paperwork")
  })

  it("keeps the saved password for the same host and user only", async () => {
    const { app, checked } = withImap()
    const h = await owner(app)
    await post(app, "/api/imap/accounts", YAHOO, h)
    const { password: _, ...rest } = YAHOO
    expect((await post(app, "/api/imap/accounts", { ...rest, folders: ["INBOX", "Bulk"] }, h)).status).toBe(200)
    expect(checked.at(-1)?.password).toBe(PASSWORD)
    // A new host never inherits it.
    expect((await post(app, "/api/imap/accounts", { ...rest, host: "imap.attacker.example" }, h)).status).toBe(400)
    expect(checked.map((c) => c.host)).not.toContain("imap.attacker.example")
  })

  it("removes the account and its password", async () => {
    const { app, data } = withImap()
    const h = await owner(app)
    await post(app, "/api/imap/accounts", YAHOO, h)
    expect((await app.request("/api/imap/accounts/yahoo", { method: "DELETE", headers: h })).status).toBe(200)
    expect(existsSync(join(data, "secrets", "imap", "yahoo.json"))).toBe(false)
    expect((await json<ImapSetup>(app.request("/api/imap", { headers: h }))).accounts).toEqual([])
    expect((await app.request("/api/imap/accounts/yahoo", { method: "DELETE", headers: h })).status).toBe(404)
  })
})

describe("scripts/imap.py", () => {
  const root = join(import.meta.dirname, "..", "..", "..")
  const run = (args: string[], input: string) => {
    try {
      return { out: execFileSync("python3", ["scripts/imap.py", ...args], { cwd: root, input, env: { ...process.env, AUTOCRATICO_DATA: setup().data }, stdio: "pipe" }).toString(), code: 0 }
    } catch (e) {
      const err = e as { stderr: Buffer; status: number }
      return { out: err.stderr.toString(), code: err.status }
    }
  }

  it("refuses local and malformed hosts before connecting", () => {
    for (const host of ["127.0.0.1", "localhost", "evil.example:25"]) {
      const r = run(["check", "--stdin"], JSON.stringify({ host, port: 993, user: "u", password: "p" }))
      expect(r.code).toBe(1)
      expect(r.out).toContain("invalid host")
    }
  })
})
