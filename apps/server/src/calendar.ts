/**
 * Google Calendar, one or more Google accounts set up from Settings: a copy of their events in the
 * data folder, and the events the chat agent creates, changes and deletes for the user.
 *
 * - calendar.toml: the accounts, which calendars are copied and where new events go (versioned).
 * - secrets/calendar/<name>.json: each account's token (folder 0700, files 0600), never sent to the browser.
 * - calendar/<name>.json: the copy (core CalendarMirror), from 90 days ago to 400 days ahead, recurring
 *   events one occurrence at a time; calendar/agenda.md: the same for the agents, by day, with ids.
 * - calendar/proposals.json: appointments the background agent found in documents, waiting for a yes.
 * - calendar/alerts.json: which alerts of important events went out on Telegram/ntfy.
 * All of calendar/ is server-owned: the agents read it, only this class writes it.
 *
 * Security-sensitive: the OAuth client is the one uploaded for Gmail (secrets/credentials.json),
 * with Google's endpoints pinned; sign-in uses PKCE and a single-use state that expires; the
 * scopes are events and the calendar list only (no sharing, no deleting calendars). The agent
 * changes or deletes only events it can see in the copy, and only through ```calendar blocks.
 */
import { createHash, randomBytes, randomInt } from "node:crypto"
import { existsSync, readFileSync, unlinkSync } from "node:fs"
import { join } from "node:path"

import {
  addDays,
  CALENDAR_FUTURE_DAYS,
  CALENDAR_NAME,
  CALENDAR_PAST_DAYS,
  CALENDAR_REDIRECT_PATH,
  CALENDAR_SCOPES,
  type CalendarAccount,
  type CalendarAccountInput,
  type CalendarAgenda,
  type CalendarEvent,
  type CalendarInfo,
  type CalendarMirror,
  type CalendarOp,
  type CalendarProposal,
  type CalendarSetup,
  calendarMarkdown,
  createBody,
  type EventFields,
  eventsOn,
  fromGoogle,
  type GoogleEvent,
  localDateTime,
  overlapping,
  parseCalendarOp,
  parseToml,
  patchBody,
  addMinutes,
  today as todayIn,
} from "@autocratico/core"
import { stringify } from "smol-toml"

import { locks, readJson, writeAtomic, writeJson, writeSecret } from "./files.ts"
import { AUTH_URI, type Client, header, oauthClient, REVOKE_URI, TOKEN_URI } from "./gmail.ts"

const API = "https://www.googleapis.com/calendar/v3"
const [EVENTS_SCOPE, LIST_SCOPE] = CALENDAR_SCOPES
const SIGN_IN_TTL = 15 * 60_000
const MAX_PAGES = 20
const MAX_PROPOSALS = 200
/** An alert of an important event with no reminders of its own: an hour before. */
const DEFAULT_ALERT_MINUTES = 60
/** All-day important events: told the evening before. */
const ALL_DAY_ALERT = "18:00"

const HEADER = `# Google Calendar accounts copied into calendar/ and written by the chat agent. Managed from Settings in the web app.
# calendars: the calendar ids copied (empty: the primary one); default: where new events go. Tokens are in secrets/calendar/<name>.json.
`

type Token = { access_token: string; refresh_token?: string; scope?: string; expires_in?: number; expires_at?: number; client_id?: string }
type SignIn = { name: string; verifier: string; redirect: string; clientId: string; expires: number }
type Settings = { name: string; calendars: string[]; default: string | null }
type Fetch = typeof fetch

export type CalendarResult = {
  op: CalendarOp["op"]
  account: string
  event: CalendarEvent
  /** Busy events of the same account at the same time (create and move only). */
  overlaps: CalendarEvent[]
  series: boolean
}

export type CalendarAlert = { event: CalendarEvent; minutes: number }

export class CalendarError extends Error {
  readonly status: 400 | 404 | 409 | 502

  constructor(status: 400 | 404 | 409 | 502, message: string) {
    super(message)
    this.status = status
  }
}

export class Calendar {
  readonly #data: string
  readonly #timeZone: string
  readonly #fetch: Fetch
  readonly #signIns = new Map<string, SignIn>()

  constructor(data: string, timeZone: string, fetcher: Fetch = fetch) {
    this.#data = data
    this.#timeZone = timeZone
    this.#fetch = fetcher
  }

  get #config() {
    return join(this.#data, "calendar.toml")
  }
  get #dir() {
    return join(this.#data, "calendar")
  }
  #token(name: string) {
    return join(this.#data, "secrets", "calendar", `${name}.json`)
  }
  #mirrorFile(name: string) {
    return join(this.#dir, `${name}.json`)
  }
  get #proposals() {
    return join(this.#dir, "proposals.json")
  }
  get #alerts() {
    return join(this.#dir, "alerts.json")
  }

  // ---------- reading ----------

  #settings(): Settings[] {
    if (!existsSync(this.#config)) return []
    const config = parseToml(readFileSync(this.#config, "utf8"), "calendar.toml")
    const list = Array.isArray(config.account) ? (config.account as Record<string, unknown>[]) : []
    return list
      .filter((a) => typeof a?.name === "string" && CALENDAR_NAME.test(a.name))
      .map((a) => ({
        name: a.name as string,
        calendars: Array.isArray(a.calendars) ? a.calendars.filter((c): c is string => typeof c === "string" && c.length > 0) : [],
        default: typeof a.default === "string" && a.default ? a.default : null,
      }))
  }

  #safeSettings(): Settings[] {
    try {
      return this.#settings()
    } catch {
      return [] // malformed calendar.toml: shown as not configured, the sync reports the error
    }
  }

  #state(name: string, clientId: string | null): CalendarAccount["state"] {
    const token = readJson<Token | null>(this.#token(name), null)
    if (!token) return "disconnected"
    if (token.client_id && clientId && token.client_id !== clientId) return "reconnect"
    return (token.scope ?? EVENTS_SCOPE).split(" ").includes(EVENTS_SCOPE) ? "connected" : "reconnect"
  }

  mirror(name: string): CalendarMirror | null {
    return readJson<CalendarMirror | null>(this.#mirrorFile(name), null)
  }

  /** The copies of every account set up, connected or not. */
  mirrors(): CalendarMirror[] {
    return this.#safeSettings().flatMap((s) => this.mirror(s.name) ?? [])
  }

  /** Some account is signed in: the sync job has something to do. */
  configured(): boolean {
    const clientId = oauthClient(this.#data)?.client_id ?? null
    return this.#safeSettings().some((s) => this.#state(s.name, clientId) === "connected")
  }

  #accounts(): CalendarAccount[] {
    const clientId = oauthClient(this.#data)?.client_id ?? null
    return this.#safeSettings().map((s) => {
      const m = this.mirror(s.name)
      const state = this.#state(s.name, clientId)
      return {
        name: s.name,
        state,
        address: m?.address ?? null,
        synced_at: m?.synced_at ?? null,
        error: m?.error ?? null,
        calendars: m?.calendars ?? [],
        events: m?.events.length ?? 0,
      }
    })
  }

  setup(): CalendarSetup {
    const client = oauthClient(this.#data)
    return { client: client && { type: client.type, redirects: client.redirect_uris ?? [] }, accounts: this.#accounts() }
  }

  /** For the Agenda view: events between two days (default: a week ago to 120 days ahead), and the open proposals. */
  agenda(range: { from?: string; to?: string } = {}): CalendarAgenda {
    const today = todayIn(this.#timeZone)
    const from = range.from ?? addDays(today, -7)
    const to = range.to ?? addDays(today, 120)
    const events = this.mirrors()
      .flatMap((m) => m.events)
      .filter((e) => e.end.slice(0, 10) >= from && e.start.slice(0, 10) <= to)
      .sort((a, b) => a.start.localeCompare(b.start))
    return { accounts: this.#accounts(), events, proposals: this.#readProposals().filter((p) => p.status === "open") }
  }

  /** Every account's events of a day (the morning reminders). */
  on(day: string): CalendarEvent[] {
    return eventsOn(this.mirrors(), day)
  }

  // ---------- accounts ----------

  #write(change: (accounts: Map<string, Settings>) => void): Promise<void> {
    return locks.run(this.#config, () => {
      const text = existsSync(this.#config) ? readFileSync(this.#config, "utf8") : ""
      const config = text ? parseToml(text, "calendar.toml") : {}
      const accounts = new Map(this.#settings().map((s) => [s.name, s]))
      change(accounts)
      const { account: _, ...rest } = config
      const list = [...accounts.values()].map((a) => ({ name: a.name, ...(a.calendars.length ? { calendars: a.calendars } : {}), ...(a.default ? { default: a.default } : {}) }))
      writeAtomic(this.#config, `${header(text, HEADER)}\n${stringify({ ...rest, ...(list.length ? { account: list } : {}) })}\n`)
    })
  }

  /** Adds an account, or changes which calendars it copies and where new events go. */
  async saveAccount(input: CalendarAccountInput): Promise<void> {
    await this.#write((a) => {
      const before = a.get(input.name)
      a.set(input.name, {
        name: input.name,
        calendars: input.calendars ?? before?.calendars ?? [],
        default: input.default ?? before?.default ?? null,
      })
    })
    // Which calendars are copied shows at once; their events come with the next sync.
    const m = this.mirror(input.name)
    if (m) await this.#saveMirror(input.name, { ...m, calendars: this.#mark(m.calendars, this.#settings().find((s) => s.name === input.name)!) })
  }

  /** Revokes the token at Google (best effort), deletes it and the copy, and drops the account. */
  async removeAccount(name: string): Promise<boolean> {
    if (!this.#safeSettings().some((s) => s.name === name)) return false
    const token = readJson<Token | null>(this.#token(name), null)
    if (token) {
      await this.#revoke(token.refresh_token ?? token.access_token)
      unlinkSync(this.#token(name))
    }
    await this.#write((a) => void a.delete(name))
    await locks.run(`calendar:${name}`, () => {
      if (existsSync(this.#mirrorFile(name))) unlinkSync(this.#mirrorFile(name))
      this.#writeAgenda()
    })
    return true
  }

  // ---------- sign-in ----------

  /** Google's consent page for one account; see Gmail.authorize for the two kinds of client. */
  authorize(name: string, origin: string): { url: string; type: "web" | "installed" } {
    const client = oauthClient(this.#data)
    if (!client) throw new CalendarError(400, "upload the OAuth client first (Settings → Gmail)")
    if (!this.#settings().some((s) => s.name === name)) throw new CalendarError(404, "unknown account")
    const now = Date.now()
    for (const [k, v] of this.#signIns) if (v.expires < now) this.#signIns.delete(k)
    if (this.#signIns.size >= 20) throw new CalendarError(400, "too many sign-ins in progress: try again in a few minutes")

    const verifier = randomBytes(48).toString("base64url")
    const state = randomBytes(24).toString("base64url")
    const redirect = client.type === "web" ? `${origin}${CALENDAR_REDIRECT_PATH}` : `http://127.0.0.1:${randomInt(49152, 65535)}`
    this.#signIns.set(state, { name, verifier, redirect, clientId: client.client_id, expires: now + SIGN_IN_TTL })
    const query = new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: redirect,
      response_type: "code",
      scope: CALENDAR_SCOPES.join(" "),
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent select_account",
      state,
    })
    return { url: `${AUTH_URI}?${query}`, type: client.type }
  }

  /** The address Google sent the browser back to (or just its query): saves the token, then copies the calendar. */
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
    if (!signIn || signIn.expires < Date.now()) throw new CalendarError(400, "this sign-in has expired or was already used: start it again")
    const error = params.get("error")
    if (error) throw new CalendarError(400, `Google refused access (${/^[\w.-]{1,60}$/.test(error) ? error : "error"})`)
    const code = params.get("code")
    if (!code) throw new CalendarError(400, "no code in the address: paste the whole address from the browser bar")
    const client = oauthClient(this.#data)
    if (!client || client.client_id !== signIn.clientId) throw new CalendarError(400, "the OAuth client changed during sign-in: start it again")

    const token = await this.#post<Token>(TOKEN_URI, {
      code,
      client_id: client.client_id,
      client_secret: client.client_secret,
      redirect_uri: signIn.redirect,
      grant_type: "authorization_code",
      code_verifier: signIn.verifier,
    })
    if (!token.refresh_token) throw new CalendarError(502, "Google sent no refresh token: remove the app's access at myaccount.google.com/permissions and sign in again")
    if (!(token.scope ?? "").split(" ").includes(EVENTS_SCOPE)) {
      await this.#revoke(token.refresh_token)
      throw new CalendarError(400, "access to the calendar's events was not granted: sign in again and tick the Calendar boxes")
    }
    await locks.run(`token:${signIn.name}`, () => writeSecret(this.#token(signIn.name), this.#stamp(token, client)))
    // The first copy: a failure shows on the account in Settings, the sign-in still counts.
    await this.sync(signIn.name).catch(() => undefined)
    return { name: signIn.name, address: this.mirror(signIn.name)?.address ?? "" }
  }

  #stamp(token: Token, client: Client): Token {
    return { ...token, expires_at: Date.now() / 1000 + (token.expires_in ?? 3600) - 60, client_id: client.client_id }
  }

  // ---------- Google ----------

  async #post<T>(url: string, fields: Record<string, string>): Promise<T> {
    let r: Response
    try {
      r = await this.#fetch(url, { method: "POST", body: new URLSearchParams(fields), signal: AbortSignal.timeout(30_000), redirect: "error" })
    } catch (e) {
      throw new CalendarError(502, `Google unreachable: ${(e as Error).message}`)
    }
    const body = (await r.json().catch(() => ({}))) as Record<string, unknown>
    if (!r.ok) {
      const why = typeof body.error_description === "string" ? body.error_description : typeof body.error === "string" ? body.error : `HTTP ${r.status}`
      throw new CalendarError(r.status >= 500 ? 502 : 400, `Google: ${why.slice(0, 200)}`)
    }
    return body as T
  }

  async #revoke(token: string | undefined): Promise<void> {
    if (!token) return
    await this.#post(REVOKE_URI, { token }).catch(() => undefined) // already revoked or expired: deleted anyway
  }

  /** A valid access token, refreshed when it is about to expire. */
  #access(name: string, force = false): Promise<string> {
    return locks.run(`token:${name}`, async () => {
      const token = readJson<Token | null>(this.#token(name), null)
      if (!token) throw new CalendarError(409, `account ${name} is not signed in`)
      if (!force && token.access_token && (token.expires_at ?? 0) > Date.now() / 1000) return token.access_token
      const client = oauthClient(this.#data)
      if (!client || !token.refresh_token) throw new CalendarError(409, `account ${name}: sign in again from Settings`)
      if (token.client_id && token.client_id !== client.client_id) throw new CalendarError(409, `account ${name}: the OAuth client was replaced, sign in again from Settings`)
      let fresh: Token
      try {
        fresh = await this.#post<Token>(TOKEN_URI, {
          client_id: client.client_id,
          client_secret: client.client_secret,
          refresh_token: token.refresh_token,
          grant_type: "refresh_token",
        })
      } catch (e) {
        if (/invalid_grant|expired or revoked/i.test((e as Error).message)) throw new CalendarError(409, `account ${name}: access was revoked or expired, sign in again from Settings`)
        throw e
      }
      writeSecret(this.#token(name), { ...this.#stamp({ ...token, ...fresh }, client), refresh_token: fresh.refresh_token ?? token.refresh_token })
      return fresh.access_token
    })
  }

  /** One call to the Calendar API; a 401 refreshes the token once. 404/410 come back as null. */
  async #api<T>(name: string, method: string, path: string, body?: unknown, retried = false): Promise<T | null> {
    const access = await this.#access(name, retried)
    let r: Response
    try {
      r = await this.#fetch(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${access}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
        redirect: "error",
      })
    } catch (e) {
      throw new CalendarError(502, `Google Calendar unreachable: ${(e as Error).message}`)
    }
    if (r.status === 401 && !retried) return this.#api<T>(name, method, path, body, true)
    if (r.status === 404 || r.status === 410) return null
    if (r.status === 204) return {} as T
    const json = (await r.json().catch(() => ({}))) as { error?: { message?: string } }
    if (!r.ok) {
      const why = (typeof json.error?.message === "string" ? json.error.message : `HTTP ${r.status}`).slice(0, 200)
      throw new CalendarError(r.status >= 500 ? 502 : r.status === 403 ? 409 : 400, `Google Calendar: ${why}`)
    }
    return json as T
  }

  // ---------- the copy ----------

  /** Which calendars are copied and which one takes new events, from calendar.toml. */
  #mark(calendars: CalendarInfo[], s: Settings): CalendarInfo[] {
    const primary = calendars.find((c) => c.primary)?.id
    const ids = (s.calendars.length ? s.calendars : ["primary"]).map((id) => (id === "primary" ? primary : id))
    const writable = (c: CalendarInfo) => c.role === "owner" || c.role === "writer"
    const wanted = s.default === "primary" || !s.default ? primary : s.default
    const fallback = calendars.find((c) => c.id === wanted && writable(c)) ?? calendars.find((c) => c.primary)
    return calendars.map((c) => ({ ...c, synced: ids.includes(c.id), default: c.id === fallback?.id }))
  }

  async #calendars(name: string): Promise<CalendarInfo[]> {
    type Entry = { id: string; summary?: string; summaryOverride?: string; primary?: boolean; backgroundColor?: string; accessRole?: string }
    const token = readJson<Token | null>(this.#token(name), null)
    // The calendar list is optional at sign-in: without it, the primary calendar only.
    if (token?.scope && !token.scope.split(" ").includes(LIST_SCOPE)) {
      return [{ id: "primary", title: "primary", primary: true, color: null, role: "owner", synced: true, default: true }]
    }
    const found: CalendarInfo[] = []
    let page: string | undefined
    for (let i = 0; i < MAX_PAGES; i++) {
      const q = new URLSearchParams({ maxResults: "250", ...(page ? { pageToken: page } : {}) })
      const r = await this.#api<{ items?: Entry[]; nextPageToken?: string }>(name, "GET", `/users/me/calendarList?${q}`)
      for (const c of r?.items ?? []) {
        if (typeof c.id !== "string") continue
        found.push({
          id: c.id,
          title: (c.summaryOverride ?? c.summary ?? c.id).slice(0, 200),
          primary: c.primary === true,
          color: typeof c.backgroundColor === "string" && /^#[0-9a-f]{6}$/i.test(c.backgroundColor) ? c.backgroundColor : null,
          role: c.accessRole ?? "reader",
          synced: false,
          default: false,
        })
      }
      page = r?.nextPageToken
      if (!page) break
    }
    return found
  }

  async #events(name: string, calendar: string): Promise<CalendarEvent[]> {
    const today = todayIn(this.#timeZone)
    const out: CalendarEvent[] = []
    let page: string | undefined
    for (let i = 0; i < MAX_PAGES; i++) {
      const q = new URLSearchParams({
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "2500",
        timeMin: `${addDays(today, -CALENDAR_PAST_DAYS)}T00:00:00Z`,
        timeMax: `${addDays(today, CALENDAR_FUTURE_DAYS)}T00:00:00Z`,
        ...(page ? { pageToken: page } : {}),
      })
      const r = await this.#api<{ items?: GoogleEvent[]; nextPageToken?: string }>(name, "GET", `/calendars/${encodeURIComponent(calendar)}/events?${q}`)
      for (const g of r?.items ?? []) {
        const e = fromGoogle(g, name, calendar, this.#timeZone)
        if (e) out.push(e)
      }
      page = r?.nextPageToken
      if (!page) break
    }
    return out
  }

  #saveMirror(name: string, m: CalendarMirror): Promise<void> {
    return locks.run(`calendar:${name}`, () => {
      writeJson(this.#mirrorFile(name), m)
      this.#writeAgenda()
    })
  }

  #writeAgenda() {
    const mirrors = this.mirrors()
    const file = join(this.#dir, "agenda.md")
    if (!mirrors.length) {
      if (existsSync(file)) unlinkSync(file)
      return
    }
    writeAtomic(file, calendarMarkdown(mirrors, todayIn(this.#timeZone), this.#timeZone))
  }

  /** Copies every connected account (or one): the calendar list, then the events of the copied calendars. */
  async sync(only?: string): Promise<{ accounts: number; events: number; errors: string[] }> {
    const clientId = oauthClient(this.#data)?.client_id ?? null
    const settings = this.#settings().filter((s) => (!only || s.name === only) && this.#state(s.name, clientId) !== "disconnected")
    let events = 0
    const errors: string[] = []
    for (const s of settings) {
      const before = this.mirror(s.name)
      try {
        const calendars = this.#mark(await this.#calendars(s.name), s)
        const all: CalendarEvent[] = []
        for (const c of calendars.filter((c) => c.synced)) all.push(...(await this.#events(s.name, c.id)))
        const primary = calendars.find((c) => c.primary)
        const address = primary && primary.id.includes("@") ? primary.id : (before?.address ?? null)
        await this.#saveMirror(s.name, { account: s.name, address, synced_at: new Date().toISOString(), error: null, calendars, events: all })
        events += all.length
      } catch (e) {
        const why = (e as Error).message
        errors.push(`${s.name}: ${why}`)
        await this.#saveMirror(s.name, { account: s.name, address: null, synced_at: null, calendars: [], events: [], ...before, error: why })
      }
    }
    // Days move on: what agenda.md calls "today" too.
    if (!settings.length) await locks.run("calendar:agenda", () => this.#writeAgenda())
    return { accounts: settings.length, events, errors }
  }

  // ---------- what the agent asked for ----------

  #connected(): string[] {
    const clientId = oauthClient(this.#data)?.client_id ?? null
    return this.#safeSettings()
      .filter((s) => this.#state(s.name, clientId) === "connected")
      .map((s) => s.name)
  }

  #account(asked: string | null): string {
    const connected = this.#connected()
    if (asked) {
      if (!connected.includes(asked)) throw new CalendarError(404, `no connected calendar account "${asked}" (${connected.join(", ") || "none"})`)
      return asked
    }
    if (connected.length === 1) return connected[0]
    if (!connected.length) throw new CalendarError(409, "no Google Calendar connected: set it up in Settings")
    throw new CalendarError(400, `say which account: ${connected.join(", ")}`)
  }

  /** The event an update or delete names: it must be in the copy. */
  #find(id: string, account: string | null): { name: string; event: CalendarEvent; mirror: CalendarMirror } {
    const names = account ? [this.#account(account)] : this.#connected()
    for (const name of names) {
      const mirror = this.mirror(name)
      const event = mirror?.events.find((e) => e.id === id || e.recurring === id)
      if (mirror && event) return { name, event: event.id === id ? event : { ...event, id }, mirror }
    }
    throw new CalendarError(404, "this event is not in the copy of the calendar: read calendar/agenda.md again for its id")
  }

  #writable(mirror: CalendarMirror, calendar: string) {
    const c = mirror.calendars.find((x) => x.id === calendar)
    if (c && c.role !== "owner" && c.role !== "writer") throw new CalendarError(409, `the calendar «${c.title}» is read-only`)
  }

  /** Carries out one checked operation at Google and updates the copy at once. */
  async apply(op: CalendarOp): Promise<CalendarResult> {
    if (op.op === "create") {
      const name = this.#account(op.account)
      const mirror = this.mirror(name) ?? (await this.sync(name), this.mirror(name))
      if (!mirror) throw new CalendarError(502, "the calendar could not be read")
      const calendar = this.#pick(mirror, op.calendar)
      const overlaps = overlapping(mirror.events, op.event.start, op.event.end)
      const g = await this.#api<GoogleEvent>(name, "POST", `/calendars/${encodeURIComponent(calendar)}/events`, createBody(op.event, this.#timeZone))
      const event = g && fromGoogle(g, name, calendar, this.#timeZone)
      if (!event) throw new CalendarError(502, "Google Calendar did not return the event")
      // A series shows up one occurrence at a time: the sync expands it.
      if (op.event.repeat) await this.sync(name)
      else if (mirror.calendars.find((c) => c.id === calendar)?.synced) await this.#update(name, (events) => [...events, event])
      return { op: "create", account: name, event, overlaps, series: Boolean(op.event.repeat) }
    }

    const { name, event, mirror } = this.#find(op.id, op.account)
    this.#writable(mirror, event.calendar)
    const target = op.series && event.recurring ? event.recurring : event.id
    const series = Boolean(event.recurring) && target === event.recurring
    const path = `/calendars/${encodeURIComponent(event.calendar)}/events/${encodeURIComponent(target)}`
    if (op.op === "delete") {
      await this.#api(name, "DELETE", path)
      await this.#update(name, (events) => events.filter((e) => (target === event.recurring ? e.recurring !== target && e.id !== target : e.id !== target)))
      return { op: "delete", account: name, event, overlaps: [], series }
    }
    const moved = Boolean(op.set.start || op.set.end)
    if (series && (moved || "repeat" in op.set)) throw new CalendarError(400, "the dates of a whole series are changed in Google Calendar itself")
    const overlaps = moved ? overlapping(mirror.events, op.set.start ?? event.start, op.set.end, event.id) : []
    const g = await this.#api<GoogleEvent>(name, "PATCH", path, patchBody(op.set, event, this.#timeZone))
    if (!g) throw new CalendarError(404, "the event is no longer in Google Calendar")
    const changed = fromGoogle(g, name, event.calendar, this.#timeZone)
    if (series || "repeat" in op.set) await this.sync(name)
    else if (changed) await this.#update(name, (events) => events.map((e) => (e.id === changed.id ? changed : e)))
    return { op: "update", account: name, event: changed ?? event, overlaps, series }
  }

  /** The calendar a new event goes to: the one named (id or title), else the account's default. */
  #pick(mirror: CalendarMirror, asked: string | null): string {
    const writable = mirror.calendars.filter((c) => c.role === "owner" || c.role === "writer")
    if (asked) {
      const a = asked.toLowerCase()
      const c = writable.find((x) => x.id === asked || (a === "primary" && x.primary) || x.title.toLowerCase() === a)
      if (!c) throw new CalendarError(404, `no writable calendar "${asked}" in account ${mirror.account}`)
      return c.id
    }
    return (writable.find((c) => c.default) ?? writable.find((c) => c.primary) ?? writable[0])?.id ?? "primary"
  }

  #update(name: string, change: (events: CalendarEvent[]) => CalendarEvent[]): Promise<void> {
    return locks.run(`calendar:${name}`, () => {
      const m = this.mirror(name)
      if (!m) return
      writeJson(this.#mirrorFile(name), { ...m, events: change(m.events).sort((a, b) => a.start.localeCompare(b.start)) })
      this.#writeAgenda()
    })
  }

  // ---------- proposals from the background agent ----------

  #readProposals(): CalendarProposal[] {
    return readJson<CalendarProposal[]>(this.#proposals, [])
  }

  /**
   * Appointments found in a document, kept until the user says yes or no. Checked like the agent's
   * own blocks; one already proposed, or already in the calendar, is not proposed again.
   */
  propose(found: unknown[], item: string | null): Promise<CalendarProposal[]> {
    return locks.run(this.#proposals, () => {
      if (!this.#connected().length) return []
      const all = this.#readProposals()
      const events = this.mirrors().flatMap((m) => m.events)
      const added: CalendarProposal[] = []
      for (const raw of found.slice(0, 5)) {
        const parsed = parseCalendarOp({ ...(raw && typeof raw === "object" ? raw : {}), op: "create", account: null, calendar: null })
        if ("error" in parsed || parsed.op.op !== "create") continue
        const f = parsed.op.event
        const same = (title: string, start: string) => title.toLowerCase() === f.title.toLowerCase() && start === f.start
        if (all.some((p) => same(p.title, p.start)) || events.some((e) => same(e.title, e.start))) continue
        const allDay = !f.start.includes("T")
        const p: CalendarProposal = {
          id: randomBytes(4).toString("hex"),
          created: new Date().toISOString(),
          item,
          title: f.title,
          start: f.start,
          end: f.end ?? (allDay ? f.start : addMinutes(f.start, 60)),
          all_day: allDay,
          location: f.location ?? null,
          description: f.description ?? null,
          important: f.important === true,
          deadline: f.deadline ?? null,
          status: "open",
          event: null,
        }
        added.push(p)
      }
      if (added.length) writeJson(this.#proposals, [...all, ...added].slice(-MAX_PROPOSALS))
      return added
    })
  }

  proposal(id: string): CalendarProposal | null {
    return this.#readProposals().find((p) => p.id === id) ?? null
  }

  /** The user's answer: "add" creates the event in the default calendar of the first connected account. */
  async answer(id: string, answer: "add" | "dismiss"): Promise<{ proposal: CalendarProposal; result: CalendarResult | null } | null> {
    const p = this.proposal(id)
    if (!p || p.status !== "open") return null
    let result: CalendarResult | null = null
    if (answer === "add") {
      const fields: EventFields = {
        title: p.title,
        start: p.start,
        end: p.end,
        location: p.location,
        description: p.description,
        important: p.important,
        deadline: p.deadline,
      }
      const connected = this.#connected()
      result = await this.apply({ op: "create", account: connected[0] ?? null, calendar: null, event: fields })
    }
    const done: CalendarProposal = { ...p, status: answer === "add" ? "added" : "dismissed", event: result?.event.id ?? null }
    await locks.run(this.#proposals, () => writeJson(this.#proposals, this.#readProposals().map((x) => (x.id === id ? done : x))))
    return { proposal: done, result }
  }

  // ---------- alerts of important events ----------

  /**
   * Important events whose alert time has come: their popup reminders (an hour before when they have
   * none of their own), all-day ones the evening before. Each alert is returned once.
   */
  dueAlerts(now = new Date()): Promise<CalendarAlert[]> {
    return locks.run(this.#alerts, () => {
      const local = localDateTime(now.toISOString(), this.#timeZone)
      const sent = new Set(readJson<{ sent: string[] }>(this.#alerts, { sent: [] }).sent)
      const due: CalendarAlert[] = []
      for (const e of this.mirrors().flatMap((m) => m.events)) {
        if (!e.important) continue
        const start = e.all_day ? `${e.start}T00:00` : e.start
        if (start <= local) continue
        const times = e.all_day
          ? [{ minutes: 0, at: `${addDays(e.start, -1)}T${ALL_DAY_ALERT}` }]
          : (e.reminders?.filter((r) => r.method === "popup").map((r) => r.minutes) ?? [DEFAULT_ALERT_MINUTES]).map((minutes) => ({ minutes, at: addMinutes(e.start, -minutes) }))
        for (const t of times) {
          const key = `${e.id}@${e.start}@${t.minutes}`
          if (t.at <= local && !sent.has(key)) {
            sent.add(key)
            due.push({ event: e, minutes: t.minutes })
          }
        }
      }
      if (due.length) {
        // Keys of events long gone are dropped.
        const cutoff = addDays(local.slice(0, 10), -2)
        writeJson(this.#alerts, { sent: [...sent].filter((k) => (k.split("@").at(-2) ?? "") >= cutoff) })
      }
      return due
    })
  }
}

