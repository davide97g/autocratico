/**
 * Gmail accounts set up from the web app, in the layout scripts/gmail.py reads for the sync:
 * the OAuth client in secrets/credentials.json, the accounts and their queries in gmail.toml,
 * one read-only token per account in secrets/gmail/<name>.json.
 *
 * Security-sensitive: the client secret and the tokens stay in data/secrets (folder 0700,
 * files 0600) and are never sent to the browser. The client's endpoints are pinned to Google's,
 * whatever the uploaded file says. Sign-in uses PKCE and a single-use state that expires.
 */
import { createHash, randomBytes, randomInt } from "node:crypto"
import { existsSync, readFileSync, unlinkSync } from "node:fs"
import { join } from "node:path"

import { GMAIL_NAME, GMAIL_REDIRECT_PATH, type GmailAccount, type GmailAccountInput, type GmailSetup, parseToml } from "@autocratico/core"
import { stringify } from "smol-toml"

import { locks, readJson, writeAtomic, writeJson, writeSecret } from "./files.ts"

const AUTH_URI = "https://accounts.google.com/o/oauth2/auth"
const TOKEN_URI = "https://oauth2.googleapis.com/token"
const REVOKE_URI = "https://oauth2.googleapis.com/revoke"
const PROFILE_URI = "https://gmail.googleapis.com/gmail/v1/users/me/profile"
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
const SIGN_IN_TTL = 15 * 60_000

const HEADER = `# Gmail accounts synced by scripts/gmail.py (read-only). Managed from Settings in the web app.
# query uses Gmail search syntax; tokens are in secrets/gmail/<name>.json.
`

type Client = { type: "web" | "installed"; client_id: string; client_secret: string; project_id?: string; redirect_uris?: string[] }
type Token = { access_token: string; refresh_token?: string; scope?: string; expires_in?: number; client_id?: string }
type SignIn = { name: string; verifier: string; redirect: string; clientId: string; expires: number }
type Fetch = typeof fetch

export class GmailError extends Error {
  readonly status: 400 | 404 | 502

  constructor(status: 400 | 404 | 502, message: string) {
    super(message)
    this.status = status
  }
}

/** Comment lines at the top of the file, else the default header. */
function header(text: string): string {
  const lines = text.split("\n")
  const end = lines.findIndex((l) => l.trim() !== "" && !l.trimStart().startsWith("#"))
  const head = lines.slice(0, end < 0 ? lines.length : end).join("\n").trimEnd()
  return head ? `${head}\n` : HEADER
}

export class Gmail {
  readonly #data: string
  readonly #fetch: Fetch
  readonly #signIns = new Map<string, SignIn>()

  constructor(data: string, fetcher: Fetch = fetch) {
    this.#data = data
    this.#fetch = fetcher
  }

  get #secrets() {
    return join(this.#data, "secrets")
  }
  get #credentials() {
    return join(this.#secrets, "credentials.json")
  }
  get #config() {
    return join(this.#data, "gmail.toml")
  }
  get #mailboxes() {
    return join(this.#data, "archive", "email", ".mailboxes.json")
  }
  #token(name: string) {
    return join(this.#secrets, "gmail", `${name}.json`)
  }
  /** The single-account layout: scripts/gmail.py moves it to gmail/default.json on first use. */
  get #legacy() {
    return join(this.#secrets, "token.json")
  }

  // ---------- reading ----------

  #client(): Client | null {
    try {
      const file = JSON.parse(readFileSync(this.#credentials, "utf8")) as Record<string, Client | undefined>
      const type = file.web ? "web" : file.installed ? "installed" : null
      return type && { ...file[type]!, type }
    } catch {
      return null
    }
  }

  /** Account name -> query, as scripts/gmail.py reads them (a top-level query is "default"). */
  #accounts(): Map<string, string> {
    const found = new Map<string, string>()
    if (existsSync(this.#config)) {
      const config = parseToml(readFileSync(this.#config, "utf8"), "gmail.toml")
      if (typeof config.query === "string" && config.query.trim()) found.set("default", config.query.trim())
      for (const a of Array.isArray(config.account) ? (config.account as Record<string, unknown>[]) : []) {
        if (typeof a?.name === "string" && GMAIL_NAME.test(a.name)) found.set(a.name, typeof a.query === "string" ? a.query.trim() : "")
      }
    }
    if (existsSync(this.#legacy) && !found.has("default")) found.set("default", "")
    return found
  }

  #state(name: string, clientId: string | null): GmailAccount["state"] {
    const file = existsSync(this.#token(name)) ? this.#token(name) : name === "default" && existsSync(this.#legacy) ? this.#legacy : null
    if (!file) return "disconnected"
    const token = readJson<Token | null>(file, null)
    // Tokens saved by scripts/gmail.py don't name their client: assume the current one.
    return token?.client_id && clientId && token.client_id !== clientId ? "reconnect" : "connected"
  }

  setup(): GmailSetup {
    const client = this.#client()
    let accounts: Map<string, string>
    try {
      accounts = this.#accounts()
    } catch {
      accounts = new Map() // malformed gmail.toml: shown as not configured, the sync reports the error
    }
    const known = readJson<Record<string, string>>(this.#mailboxes, {})
    return {
      client: client && {
        type: client.type,
        clientId: client.client_id,
        project: client.project_id ?? null,
        redirects: client.redirect_uris ?? [],
      },
      accounts: [...accounts].map(([name, query]) => {
        const state = this.#state(name, client?.client_id ?? null)
        return { name, query, state, address: state === "disconnected" ? null : (known[name] ?? null) }
      }),
    }
  }

  // ---------- OAuth client ----------

  /** The JSON downloaded from Google Cloud ("Web application" or "Desktop app"). */
  saveClient(file: unknown): GmailSetup["client"] {
    const raw = file && typeof file === "object" ? (file as Record<string, unknown>) : {}
    const type = raw.web ? "web" : raw.installed ? "installed" : null
    const c = (type && raw[type]) as Record<string, unknown> | null
    if (!type || !c) throw new GmailError(400, 'not an OAuth client file: it should start with {"web": or {"installed":')
    const id = c.client_id
    if (typeof id !== "string" || !/^[\w-]+\.apps\.googleusercontent\.com$/.test(id)) throw new GmailError(400, "client_id missing or not a Google OAuth client")
    if (typeof c.client_secret !== "string" || !/^[\w-]{8,200}$/.test(c.client_secret)) throw new GmailError(400, "client_secret missing")
    const redirects = Array.isArray(c.redirect_uris) ? c.redirect_uris.filter((u): u is string => typeof u === "string").slice(0, 20) : []
    const client = {
      client_id: id,
      client_secret: c.client_secret,
      project_id: typeof c.project_id === "string" ? c.project_id.slice(0, 100) : undefined,
      // Pinned: the secret and the codes only ever go to Google.
      auth_uri: AUTH_URI,
      token_uri: TOKEN_URI,
      redirect_uris: redirects,
    }
    writeSecret(this.#credentials, { [type]: client })
    return { type, clientId: id, project: client.project_id ?? null, redirects }
  }

  // ---------- accounts ----------

  #write(change: (accounts: Map<string, string>) => void): Promise<void> {
    return locks.run(this.#config, () => {
      const text = existsSync(this.#config) ? readFileSync(this.#config, "utf8") : ""
      const config = text ? parseToml(text, "gmail.toml") : {}
      const accounts = this.#accounts()
      change(accounts)
      // A top-level query (single-account layout) becomes the [[account]] "default".
      const { query: _, account: __, ...rest } = config
      const list = [...accounts].map(([name, query]) => ({ name, query }))
      writeAtomic(this.#config, `${header(text)}\n${stringify({ ...rest, ...(list.length ? { account: list } : {}) })}\n`)
    })
  }

  saveAccount(input: GmailAccountInput): Promise<void> {
    return this.#write((a) => void a.set(input.name, input.query))
  }

  /** Revokes the token at Google (best effort), deletes it and drops the account from gmail.toml. */
  async removeAccount(name: string): Promise<boolean> {
    if (!this.#accounts().has(name)) return false
    for (const file of [this.#token(name), ...(name === "default" ? [this.#legacy] : [])]) {
      const token = readJson<Token | null>(file, null)
      if (!token) continue
      await this.#revoke(token.refresh_token ?? token.access_token)
      unlinkSync(file)
    }
    await this.#write((a) => void a.delete(name))
    return true
  }

  // ---------- sign-in ----------

  /**
   * Google's consent page for one account. A web client comes back to the app at
   * <origin>/oauth/gmail; a desktop client to 127.0.0.1, where nothing answers: the address
   * the browser shows then is pasted into the app.
   */
  authorize(name: string, origin: string): { url: string; type: "web" | "installed" } {
    const client = this.#client()
    if (!client) throw new GmailError(400, "upload the OAuth client first")
    if (!this.#accounts().has(name)) throw new GmailError(404, "unknown account")
    const now = Date.now()
    for (const [k, v] of this.#signIns) if (v.expires < now) this.#signIns.delete(k)
    if (this.#signIns.size >= 20) throw new GmailError(400, "too many sign-ins in progress: try again in a few minutes")

    const verifier = randomBytes(48).toString("base64url")
    const state = randomBytes(24).toString("base64url")
    const redirect = client.type === "web" ? `${origin}${GMAIL_REDIRECT_PATH}` : `http://127.0.0.1:${randomInt(49152, 65535)}`
    this.#signIns.set(state, { name, verifier, redirect, clientId: client.client_id, expires: now + SIGN_IN_TTL })
    const query = new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: redirect,
      response_type: "code",
      scope: GMAIL_SCOPE,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent select_account",
      state,
    })
    return { url: `${AUTH_URI}?${query}`, type: client.type }
  }

  /** The address Google sent the browser back to (or just its query): saves the account's token. */
  async complete(returned: string): Promise<{ name: string; address: string }> {
    const text = returned.trim()
    let params: URLSearchParams
    try {
      params = new URL(text).searchParams
    } catch {
      params = new URLSearchParams(text.slice(text.indexOf("?") + 1))
    }
    const state = params.get("state") ?? ""
    const signIn = this.#signIns.get(state)
    this.#signIns.delete(state)
    if (!signIn || signIn.expires < Date.now()) throw new GmailError(400, "this sign-in has expired or was already used: start it again")
    const error = params.get("error")
    if (error) throw new GmailError(400, `Google refused access (${/^[\w.-]{1,60}$/.test(error) ? error : "error"})`)
    const code = params.get("code")
    if (!code) throw new GmailError(400, "no code in the address: paste the whole address from the browser bar")
    const client = this.#client()
    if (!client || client.client_id !== signIn.clientId) throw new GmailError(400, "the OAuth client changed during sign-in: start it again")

    const token = await this.#post<Token>(TOKEN_URI, {
      code,
      client_id: client.client_id,
      client_secret: client.client_secret,
      redirect_uri: signIn.redirect,
      grant_type: "authorization_code",
      code_verifier: signIn.verifier,
    })
    if (!token.refresh_token) throw new GmailError(502, "Google sent no refresh token: remove the app's access at myaccount.google.com/permissions and sign in again")
    if (!(token.scope ?? "").split(" ").includes(GMAIL_SCOPE)) {
      await this.#revoke(token.refresh_token)
      throw new GmailError(400, "read access to Gmail was not granted: sign in again and tick the Gmail box")
    }
    const address = await this.#address(token.access_token)
    await locks.run(this.#config, () => {
      writeSecret(this.#token(signIn.name), {
        ...token,
        // Read by scripts/gmail.py (seconds), to refresh a minute early.
        expires_at: Date.now() / 1000 + (token.expires_in ?? 3600) - 60,
        client_id: client.client_id,
      })
      if (signIn.name === "default" && existsSync(this.#legacy)) unlinkSync(this.#legacy)
    })
    if (address) {
      await locks.run(this.#mailboxes, () => {
        writeJson(this.#mailboxes, { ...readJson<Record<string, string>>(this.#mailboxes, {}), [signIn.name]: address })
      })
    }
    return { name: signIn.name, address }
  }

  // ---------- Google ----------

  async #post<T>(url: string, fields: Record<string, string>): Promise<T> {
    let r: Response
    try {
      r = await this.#fetch(url, { method: "POST", body: new URLSearchParams(fields), signal: AbortSignal.timeout(30_000) })
    } catch (e) {
      throw new GmailError(502, `Google unreachable: ${(e as Error).message}`)
    }
    const body = (await r.json().catch(() => ({}))) as Record<string, unknown>
    if (!r.ok) {
      const why = typeof body.error_description === "string" ? body.error_description : typeof body.error === "string" ? body.error : `HTTP ${r.status}`
      throw new GmailError(r.status >= 500 ? 502 : 400, `Google: ${why.slice(0, 200)}`)
    }
    return body as T
  }

  async #revoke(token: string | undefined): Promise<void> {
    if (!token) return
    await this.#post(REVOKE_URI, { token }).catch(() => undefined) // already revoked or expired: deleted anyway
  }

  async #address(accessToken: string): Promise<string> {
    try {
      const r = await this.#fetch(PROFILE_URI, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30_000) })
      const body = (await r.json()) as { emailAddress?: unknown }
      return r.ok && typeof body.emailAddress === "string" ? body.emailAddress : ""
    } catch {
      return "" // the token works for the sync anyway; the address arrives with the first sync
    }
  }
}
