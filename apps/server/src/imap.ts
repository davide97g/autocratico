/**
 * IMAP mailboxes set up from the web app, in the layout scripts/imap.py reads for the sync:
 * the accounts with their folders in imap.toml, host, port, user and app password in
 * secrets/imap/<name>.json.
 *
 * Security-sensitive: the password stays in data/secrets (folder 0700, file 0600), is never sent
 * to the browser and only ever goes to the host saved with it (imap.toml holds no host, so an edit
 * there cannot redirect it). The sign-in is checked before anything is saved, over TLS only.
 */
import { spawn } from "node:child_process"
import { existsSync, readFileSync, unlinkSync } from "node:fs"
import { join } from "node:path"

import { GMAIL_NAME, type ImapAccount, type ImapAccountInput, type ImapSetup, parseToml } from "@autocratico/core"
import { stringify } from "smol-toml"

import type { Config } from "./config.ts"
import { locks, readJson, writeAtomic, writeSecret } from "./files.ts"

const HEADER = `# IMAP mailboxes synced by scripts/imap.py (read-only). Managed from Settings in the web app.
# folders: which ones to read (default INBOX); days: how far back the first sync goes.
# Host, user and app password are in secrets/imap/<name>.json.
`

type Connection = { host: string; port: number; user: string; password: string }
type Settings = { folders: string[]; days: number }
/** Signs in and lists the folders; throws ImapError with the reason when it cannot. */
export type Checker = (conn: Connection) => Promise<{ folders: string[] }>

export class ImapError extends Error {
  readonly status: 400 | 404 | 502

  constructor(status: 400 | 404 | 502, message: string) {
    super(message)
    this.status = status
  }
}

/** `scripts/imap.py check --stdin`: the password goes through stdin, never in arguments. */
export function imapChecker(config: Pick<Config, "python" | "root" | "data">): Checker {
  return (conn) =>
    new Promise((resolve, reject) => {
      const child = spawn(config.python, ["scripts/imap.py", "check", "--stdin"], {
        cwd: config.root,
        env: { ...process.env, AUTOCRATICO_DATA: config.data },
        timeout: 90_000,
      })
      let out = ""
      let err = ""
      child.stdout.on("data", (d) => (out += d))
      child.stderr.on("data", (d) => (err += d))
      child.on("error", (e) => reject(new ImapError(502, `cannot run scripts/imap.py: ${e.message}`)))
      child.on("close", (code) => {
        if (code !== 0) return reject(new ImapError(400, (err.trim().split("\n").at(-1) ?? "").replace(/^error: /, "").slice(0, 300) || "sign-in failed"))
        try {
          const r = JSON.parse(out) as { folders?: unknown }
          resolve({ folders: Array.isArray(r.folders) ? r.folders.filter((f): f is string => typeof f === "string") : [] })
        } catch {
          reject(new ImapError(502, "unexpected answer from scripts/imap.py"))
        }
      })
      child.stdin.end(JSON.stringify(conn))
    })
}

/** Comment lines at the top of the file, else the default header. */
function header(text: string): string {
  const lines = text.split("\n")
  const end = lines.findIndex((l) => l.trim() !== "" && !l.trimStart().startsWith("#"))
  const head = lines.slice(0, end < 0 ? lines.length : end).join("\n").trimEnd()
  return head ? `${head}\n` : HEADER
}

export class Imap {
  readonly #data: string
  readonly #check: Checker

  constructor(data: string, check: Checker) {
    this.#data = data
    this.#check = check
  }

  get #config() {
    return join(this.#data, "imap.toml")
  }
  #secret(name: string) {
    return join(this.#data, "secrets", "imap", `${name}.json`)
  }

  /** Account name -> folders and days, as scripts/imap.py reads them. */
  #accounts(): Map<string, Settings> {
    const found = new Map<string, Settings>()
    if (!existsSync(this.#config)) return found
    const config = parseToml(readFileSync(this.#config, "utf8"), "imap.toml")
    for (const a of Array.isArray(config.account) ? (config.account as Record<string, unknown>[]) : []) {
      if (typeof a?.name !== "string" || !GMAIL_NAME.test(a.name)) continue
      const folders = Array.isArray(a.folders) ? a.folders.filter((f): f is string => typeof f === "string" && f.trim() !== "") : []
      const days = typeof a.days === "number" && Number.isInteger(a.days) && a.days > 0 ? a.days : 365
      found.set(a.name, { folders: folders.length ? folders : ["INBOX"], days })
    }
    return found
  }

  /** Whether any account can sync: the job skips otherwise. */
  configured(): boolean {
    return this.setup().accounts.some((a) => a.state === "connected")
  }

  setup(): ImapSetup {
    let accounts: Map<string, Settings>
    try {
      accounts = this.#accounts()
    } catch {
      accounts = new Map() // malformed imap.toml: shown as not configured, the sync reports the error
    }
    return {
      accounts: [...accounts].map(([name, s]): ImapAccount => {
        const conn = readJson<Partial<Connection> | null>(this.#secret(name), null)
        return { name, ...s, host: conn?.host ?? null, port: conn?.port ?? null, user: conn?.user ?? null, state: conn?.password ? "connected" : "disconnected" }
      }),
    }
  }

  /** Checks the sign-in, then saves the connection (secret) and the account (imap.toml). */
  async saveAccount(input: ImapAccountInput): Promise<{ folders: string[] }> {
    const saved = readJson<Partial<Connection> | null>(this.#secret(input.name), null)
    // Keeping the saved password is only for the same host and user: it never follows a new host.
    const same = saved?.host === input.host && saved?.user === input.user && saved?.port === input.port
    const password = input.password ?? (same ? saved?.password : undefined)
    if (!password) throw new ImapError(400, "the app password is required")
    const conn: Connection = { host: input.host, port: input.port, user: input.user, password }
    const { folders } = await this.#check(conn)
    const missing = input.folders.filter((f) => folders.length && !folders.includes(f))
    if (missing.length) throw new ImapError(400, `folder not found: ${missing.join(", ")} (available: ${folders.slice(0, 15).join(", ")})`)
    await locks.run(this.#config, () => {
      writeSecret(this.#secret(input.name), conn)
      this.#write((a) => void a.set(input.name, { folders: input.folders, days: input.days }))
    })
    return { folders }
  }

  /** Deletes the saved password and drops the account from imap.toml (the archived mail stays). */
  async removeAccount(name: string): Promise<boolean> {
    if (!GMAIL_NAME.test(name) || !this.#accounts().has(name)) return false
    await locks.run(this.#config, () => {
      if (existsSync(this.#secret(name))) unlinkSync(this.#secret(name))
      this.#write((a) => void a.delete(name))
    })
    return true
  }

  #write(change: (accounts: Map<string, Settings>) => void): void {
    const text = existsSync(this.#config) ? readFileSync(this.#config, "utf8") : ""
    const { account: _, ...rest } = text ? parseToml(text, "imap.toml") : {}
    const accounts = this.#accounts()
    change(accounts)
    const list = [...accounts].map(([name, s]) => ({ name, folders: s.folders, days: s.days }))
    writeAtomic(this.#config, `${header(text)}\n${stringify({ ...rest, ...(list.length ? { account: list } : {}) })}\n`)
  }
}
