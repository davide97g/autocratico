import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import type { GmailPreview, GmailSetup } from "@autocratico/core"
import { describe, expect, it } from "vitest"

import { Account } from "../src/account.ts"
import { createApp } from "../src/app.ts"
import { loadConfig } from "../src/config.ts"
import { Gmail, GMAIL_SCOPE } from "../src/gmail.ts"
import { services } from "../src/services.ts"
import { LOCAL, owner, post, setup } from "./helpers.ts"

const CLIENT = {
  web: {
    client_id: "123-abc.apps.googleusercontent.com",
    client_secret: "GOCSPX-not-a-real-secret",
    project_id: "autocratico",
    auth_uri: "https://evil.example/auth",
    token_uri: "https://evil.example/token",
    redirect_uris: ["http://127.0.0.1:8790/oauth/gmail"],
  },
}

/** Google's token, revoke and profile endpoints, recording what they were sent. */
function fakeGoogle(scope = GMAIL_SCOPE) {
  const calls: { url: string; body: URLSearchParams | null }[] = []
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, body: init?.body instanceof URLSearchParams ? init.body : null })
    if (url === "https://oauth2.googleapis.com/token") {
      return Response.json({ access_token: "ya29.access", refresh_token: "1//refresh", expires_in: 3599, scope, token_type: "Bearer" })
    }
    if (url === "https://oauth2.googleapis.com/revoke") return new Response("{}")
    if (url.endsWith("/users/me/profile")) return Response.json({ emailAddress: "maria@example.com", messagesTotal: 3 })
    return new Response("not found", { status: 404 })
  }) as typeof fetch
  return { fetcher, calls }
}

/** A server on a copy of example/ whose Gmail setup talks to the fake Google. */
function withGmail(scope?: string) {
  const google = fakeGoogle(scope)
  const { data } = setup()
  const config = loadConfig({ data, jobs: false, telegramToken: null, claude: null })
  const gmail = new Gmail(data, google.fetcher)
  const app = createApp(services(config, { jobs: null, telegram: null, verifyAccess: null, account: new Account(config, ":memory:"), gmail }))
  return { app, data, google }
}

async function json<T>(r: Response | Promise<Response>): Promise<T> {
  return (await (await r).json()) as T
}

describe("Gmail setup", () => {
  it("needs the owner's session", async () => {
    const { app } = withGmail()
    expect((await app.request("/api/gmail", { headers: LOCAL })).status).toBe(401)
  })

  it("stores the OAuth client privately, pinned to Google, without sending the secret back", async () => {
    const { app, data } = withGmail()
    const h = await owner(app)
    const r = await app.request("/api/gmail/client", { method: "PUT", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify(CLIENT) })
    expect(r.status).toBe(200)
    expect(JSON.stringify(await r.json())).not.toContain("GOCSPX")

    const file = join(data, "secrets", "credentials.json")
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(statSync(join(data, "secrets")).mode & 0o777).toBe(0o700)
    const saved = JSON.parse(readFileSync(file, "utf8")).web
    expect(saved.token_uri).toBe("https://oauth2.googleapis.com/token")
    expect(saved.auth_uri).toBe("https://accounts.google.com/o/oauth2/auth")

    const s = await json<GmailSetup>(app.request("/api/gmail", { headers: h }))
    expect(s.client).toEqual({ type: "web", clientId: CLIENT.web.client_id, project: "autocratico", redirects: CLIENT.web.redirect_uris })
    expect(JSON.stringify(s)).not.toContain("GOCSPX")
  })

  it("rejects files that are not an OAuth client", async () => {
    const { app } = withGmail()
    const h = await owner(app)
    for (const body of [{}, { web: { client_id: "x", client_secret: "y" } }, { service_account: true }]) {
      const r = await app.request("/api/gmail/client", { method: "PUT", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify(body) })
      expect(r.status).toBe(400)
    }
  })

  it("adds accounts to gmail.toml, keeping a single-account file working", async () => {
    const { app, data } = withGmail()
    const h = await owner(app)
    writeFileSync(join(data, "gmail.toml"), '# mine\nquery = "label:old"\n')
    expect((await post(app, "/api/gmail/accounts", { name: "work", query: "label:paperwork" }, h)).status).toBe(200)
    expect((await post(app, "/api/gmail/accounts", { name: "Bad Name", query: "x" }, h)).status).toBe(400)

    const text = readFileSync(join(data, "gmail.toml"), "utf8")
    expect(text.startsWith("# mine\n")).toBe(true)
    const s = await json<GmailSetup>(app.request("/api/gmail", { headers: h }))
    expect(s.accounts.map((a) => [a.name, a.query, a.state])).toEqual([
      ["default", "label:old", "disconnected"],
      ["work", "label:paperwork", "disconnected"],
    ])
  })

  it("signs an account in with PKCE and a single-use state, and saves a private token", async () => {
    const { app, data, google } = withGmail()
    const h = await owner(app)
    await app.request("/api/gmail/client", { method: "PUT", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify(CLIENT) })
    await post(app, "/api/gmail/accounts", { name: "work", query: "label:paperwork" }, h)

    const { url, type } = await json<{ url: string; type: string }>(post(app, "/api/gmail/accounts/work/authorize", {}, h))
    expect(type).toBe("web")
    const auth = new URL(url)
    expect(auth.origin).toBe("https://accounts.google.com")
    expect(auth.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:8790/oauth/gmail")
    expect(auth.searchParams.get("scope")).toBe(GMAIL_SCOPE)
    expect(auth.searchParams.get("code_challenge_method")).toBe("S256")
    const state = auth.searchParams.get("state")!

    expect((await post(app, "/api/gmail/complete", { url: `http://127.0.0.1:8790/oauth/gmail?state=forged&code=c` }, h)).status).toBe(400)
    const back = `http://127.0.0.1:8790/oauth/gmail?state=${state}&code=4/code&scope=${encodeURIComponent(GMAIL_SCOPE)}`
    const done = await post(app, "/api/gmail/complete", { url: back }, h)
    expect(await done.json()).toEqual({ name: "work", address: "maria@example.com" })
    // The state works once.
    expect((await post(app, "/api/gmail/complete", { url: back }, h)).status).toBe(400)

    const exchange = google.calls.find((c) => c.url.endsWith("/token"))!.body!
    expect(exchange.get("code")).toBe("4/code")
    expect(exchange.get("code_verifier")).toMatch(/^[\w-]{43,}$/)
    expect(exchange.get("redirect_uri")).toBe("http://127.0.0.1:8790/oauth/gmail")

    const token = join(data, "secrets", "gmail", "work.json")
    expect(statSync(token).mode & 0o777).toBe(0o600)
    const saved = JSON.parse(readFileSync(token, "utf8"))
    expect(saved.refresh_token).toBe("1//refresh")
    expect(saved.expires_at).toBeGreaterThan(Date.now() / 1000)
    expect(JSON.parse(readFileSync(join(data, "archive", "email", ".mailboxes.json"), "utf8")).work).toBe("maria@example.com")

    const s = await json<GmailSetup>(app.request("/api/gmail", { headers: h }))
    expect(s.accounts.find((a) => a.name === "work")).toMatchObject({ state: "connected", address: "maria@example.com" })
  })

  it("refuses a sign-in without read access to Gmail, and revokes it", async () => {
    const { app, data, google } = withGmail("openid")
    const h = await owner(app)
    await app.request("/api/gmail/client", { method: "PUT", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify(CLIENT) })
    await post(app, "/api/gmail/accounts", { name: "work", query: "in:inbox" }, h)
    const { url } = await json<{ url: string }>(post(app, "/api/gmail/accounts/work/authorize", {}, h))
    const state = new URL(url).searchParams.get("state")
    expect((await post(app, "/api/gmail/complete", { url: `?state=${state}&code=c` }, h)).status).toBe(400)
    expect(google.calls.some((c) => c.url.endsWith("/revoke"))).toBe(true)
    expect(existsSync(join(data, "secrets", "gmail", "work.json"))).toBe(false)
  })

  it("marks tokens from scripts/gmail.py as needing a new sign-in when the client is replaced", async () => {
    const { app, data } = withGmail()
    const h = await owner(app)
    const put = (c: unknown) => app.request("/api/gmail/client", { method: "PUT", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify(c) })
    await put({ installed: { ...CLIENT.web, client_id: "111-old.apps.googleusercontent.com" } })
    mkdirSync(join(data, "secrets", "gmail"), { recursive: true })
    writeFileSync(join(data, "secrets", "gmail", "personal.json"), JSON.stringify({ access_token: "a", refresh_token: "r" }))
    let s = await json<GmailSetup>(app.request("/api/gmail", { headers: h }))
    expect(s.accounts.find((a) => a.name === "personal")?.state).toBe("connected")

    await put(CLIENT)
    s = await json<GmailSetup>(app.request("/api/gmail", { headers: h }))
    expect(s.accounts.find((a) => a.name === "personal")?.state).toBe("reconnect")
    expect(statSync(join(data, "secrets", "gmail", "personal.json")).mode & 0o777).toBe(0o600)
  })

  it("asks to sign in again once the client is replaced, and removes accounts with their token", async () => {
    const { app, data, google } = withGmail()
    const h = await owner(app)
    const put = (c: unknown) => app.request("/api/gmail/client", { method: "PUT", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify(c) })
    await put(CLIENT)
    await post(app, "/api/gmail/accounts", { name: "work", query: "in:inbox" }, h)
    const { url } = await json<{ url: string }>(post(app, "/api/gmail/accounts/work/authorize", {}, h))
    await post(app, "/api/gmail/complete", { url: `?state=${new URL(url).searchParams.get("state")}&code=c` }, h)

    await put({ installed: { ...CLIENT.web, client_id: "456-def.apps.googleusercontent.com" } })
    let s = await json<GmailSetup>(app.request("/api/gmail", { headers: h }))
    expect(s.accounts.find((a) => a.name === "work")?.state).toBe("reconnect")
    const desktop = await json<{ url: string; type: string }>(post(app, "/api/gmail/accounts/work/authorize", {}, h))
    expect(desktop.type).toBe("installed")
    expect(new URL(desktop.url).searchParams.get("redirect_uri")).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)

    const r = await app.request("/api/gmail/accounts/work", { method: "DELETE", headers: h })
    expect(r.status).toBe(200)
    expect(google.calls.some((c) => c.url.endsWith("/revoke") && c.body?.get("token") === "1//refresh")).toBe(true)
    expect(existsSync(join(data, "secrets", "gmail", "work.json"))).toBe(false)
    s = await json<GmailSetup>(app.request("/api/gmail", { headers: h }))
    expect(s.accounts.map((a) => a.name)).toEqual(["personal"]) // from example/
  })
})

describe("Gmail links in the chat", () => {
  // A link from Gmail's web app: the letters stand for the thread 199e22cd1b5badb3.
  const LINK = "https://mail.google.com/mail/u/0/#inbox/FMfcgzQcqHbhCqwDnCNJKsrwkgKScRpp"
  const FOLDER = "archive/email/2025-10-14-avviso-tari-5badb3"

  /** A server on a copy of example/ whose archive already has that conversation (no network needed). */
  function withArchived() {
    const { app, s, data } = setup()
    mkdirSync(join(data, FOLDER), { recursive: true })
    writeFileSync(
      join(data, FOLDER, "message.md"),
      [
        "---",
        "id: 199e22cd1b5badb3",
        "account: personal",
        "mailbox: maria@example.com",
        "thread: 199e22cd1b5badb3",
        "date: 2025-10-14T12:03:32+02:00",
        'from: "Comune di Esempio <tributi@comune.example.it>"',
        'subject: "Avviso TARI 2025"',
        'attachments: ["avviso.pdf"]',
        "---",
        "",
        "Gentile contribuente,   in allegato l'avviso.",
        "",
      ].join("\n")
    )
    return { app, s, data }
  }

  it("previews a link from the archive, and says why others can't be", async () => {
    const { app } = withArchived()
    const h = await owner(app)
    const ask = (link: string) => app.request(`/api/gmail/preview?link=${encodeURIComponent(link)}`, { headers: h })
    const r = await ask(LINK)
    expect(r.status).toBe(200)
    const p = await json<GmailPreview>(r)
    expect(p).toMatchObject({ thread: "199e22cd1b5badb3", account: "personal", subject: "Avviso TARI 2025", messages: 1, attachments: ["avviso.pdf"], folders: [FOLDER] })
    expect(p.snippet).toBe("Gentile contribuente, in allegato l'avviso.")
    expect(p.link).toBe("https://mail.google.com/mail/u/?authuser=maria%40example.com#all/199e22cd1b5badb3")
    // The same conversation by its hex id, or as one message (permmsgid), in an older link.
    expect((await ask("https://mail.google.com/mail/u/0/#all/199e22cd1b5badb3")).status).toBe(200)
    expect((await ask("https://mail.google.com/mail/u/0/?view=om&permmsgid=msg-f:1845951161591115187")).status).toBe(200)

    // Not archived and no account connected (example/ has no tokens).
    const missing = await ask("https://mail.google.com/mail/u/0/#inbox/1a0fc52bf5615af5")
    expect(missing.status).toBe(409)
    expect((await json<{ code: string }>(missing)).code).toBe("no-account")
    expect((await ask("https://mail.google.com/mail/u/0/#inbox")).status).toBe(400)
    expect((await ask("--all")).status).toBe(400)
    expect((await app.request(`/api/gmail/preview?link=${encodeURIComponent(LINK)}`, { headers: LOCAL })).status).toBe(401)
  })

  it("saves the linked conversation before the agent answers and tells it where", async () => {
    const { app, s } = withArchived()
    const me = await owner(app)
    const prompts: string[] = []
    s.claude.run = async function* (o) {
      prompts.push(o.prompt)
      yield { type: "end", cost: null, duration_ms: 1 }
    }
    const out = await (await post(app, "/api/chat", { message: `Cos'è questa? ${LINK}` }, me)).text()
    // No account can be asked: the archive's copy is used.
    expect(prompts[0]).toContain(`Cos'è questa? ${LINK}\n\n[Server: The Gmail link is the conversation from the "personal" mailbox, saved in ${FOLDER}/`)
    expect(prompts[0]).toContain("this is the copy already in the archive")
    expect(out).toContain(`{"type":"tool","name":"Gmail","detail":"${FOLDER}"}`)

    await (await post(app, "/api/chat", { message: "https://mail.google.com/mail/u/0/#inbox/1a0fc52bf5615af5" }, me)).text()
    expect(prompts[1]).toContain("[Server: The Gmail link could not be opened: no Gmail account is connected")
    // Messages without links reach the agent as typed.
    await (await post(app, "/api/chat", { message: "Quanto pago a ottobre?" }, me)).text()
    expect(prompts[2]).toBe("Quanto pago a ottobre?")
  })
})
