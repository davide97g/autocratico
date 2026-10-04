/**
 * The one user of this instance: a name and a masterpass (no username, no email), on Better Auth.
 * Security-sensitive, read with auth.ts.
 *
 * - Users, password hashes and sessions live in data/secrets/auth.db (node:sqlite); the folder is
 *   0700, outside the data folder's git history, and denied to the agents.
 * - Better Auth's HTTP handler is not mounted: the server calls `auth.api` from its own routes
 *   (app.ts), so no other auth endpoint exists. Its HTTP rate limiter does not run either, hence
 *   the login throttle below.
 * - Only one user: setup() refuses once the owner exists.
 * - In prod the first setup needs a one-time code, printed by the server at boot and by
 *   `cli.ts setup-code`, so an exposed fresh instance cannot be claimed by someone else.
 */
import { chmodSync, existsSync, mkdirSync } from "node:fs"
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"

import type { AccountSession } from "@autocratico/core"
import { betterAuth } from "better-auth"
import { APIError } from "better-auth/api"
import { getMigrations } from "better-auth/db/migration"

import type { Config } from "./config.ts"
import { locks, readJson, writeSecret } from "./files.ts"

/** Better Auth wants an email: this one is never shown and never receives anything. */
export const OWNER_EMAIL = "owner@autocratico.invalid"
export const MIN_PASSWORD = 8
export const MAX_PASSWORD = 128
const SESSION_DAYS = 90
const LOGIN_FAILURES = 5
const LOGIN_WINDOW_MS = 60_000
const LOCKOUT_MS = 15 * 60_000
const CODE_TTL_MS = 10 * 60_000
const CODE_ATTEMPTS = 5

export type User = { id: string; name: string; onboarded: boolean }
export type Found = { user: User; session: { id: string; token: string }; headers: Headers }

/** Refused requests, with the status the routes answer. */
export class AccountError extends Error {
  readonly status: 400 | 401 | 403 | 409 | 429
  readonly retryAfter: number

  constructor(status: AccountError["status"], message: string, retryAfter = 0) {
    super(message)
    this.status = status
    this.retryAfter = retryAfter
  }
}

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex")
}

function same(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** A short name for a session, from its User-Agent. */
export function deviceName(ua: string | null | undefined): string {
  const s = ua ?? ""
  if (/iPhone/.test(s)) return "iPhone"
  if (/iPad/.test(s)) return "iPad"
  if (/Android/.test(s)) return "Android"
  if (/Macintosh/.test(s)) return "Mac"
  if (/Windows/.test(s)) return "Windows"
  if (/Linux/.test(s)) return "Linux"
  return "browser"
}

function secret(config: Config): string {
  const fromEnv = process.env.BETTER_AUTH_SECRET?.trim()
  if (fromEnv) return fromEnv
  const file = join(config.data, "secrets", "auth.json")
  const stored = readJson<{ secret?: string }>(file, {}).secret
  if (stored) return stored
  const fresh = randomBytes(32).toString("base64url")
  writeSecret(file, { secret: fresh })
  return fresh
}

function authOptions(config: Config, database: DatabaseSync) {
  const local = [`http://127.0.0.1:${config.port}`, `http://localhost:${config.port}`]
  return {
    database,
    secret: secret(config),
    baseURL: config.publicOrigin ?? local[0],
    basePath: "/api/auth",
    trustedOrigins: config.publicOrigin ? [config.publicOrigin] : local,
    telemetry: { enabled: false },
    logger: { level: "error" as const },
    emailAndPassword: { enabled: true, minPasswordLength: MIN_PASSWORD, maxPasswordLength: MAX_PASSWORD },
    user: { additionalFields: { onboarded: { type: "boolean" as const, defaultValue: false, input: false } } },
    session: { expiresIn: SESSION_DAYS * 86400, updateAge: 86400 },
    advanced: {
      cookiePrefix: "autocratico",
      // __Secure- cookies over HTTPS in prod; plain http on loopback in dev.
      useSecureCookies: config.auth === "prod",
      defaultCookieAttributes: { httpOnly: true, sameSite: "strict" as const },
      ipAddress: { disableIpTracking: true },
    },
  }
}

function createAuth(options: ReturnType<typeof authOptions>) {
  return betterAuth(options)
}
type Auth = ReturnType<typeof createAuth>

type Throttle = { failures: number[]; lockedUntil: number }
type SetupCode = { hash: string; expires: number; attempts: number }

export class Account {
  readonly ready: Promise<void>
  #auth: Auth | null = null
  readonly #codeFile: string
  readonly #throttle: Throttle = { failures: [], lockedUntil: 0 }

  /** `file` defaults to data/secrets/auth.db; tests pass ":memory:". */
  constructor(config: Config, file?: string) {
    const dir = join(config.data, "secrets")
    const path = file ?? join(dir, "auth.db")
    if (path !== ":memory:") {
      mkdirSync(dir, { recursive: true, mode: 0o700 })
      chmodSync(dir, 0o700)
    }
    const db = new DatabaseSync(path)
    if (path !== ":memory:" && existsSync(path)) chmodSync(path, 0o600)
    const options = authOptions(config, db)
    this.#codeFile = join(dir, "setup.json")
    // Tables first: Better Auth checks the schema when it starts.
    this.ready = getMigrations(options)
      .then(({ runMigrations }) => runMigrations())
      .then(() => {
        this.#auth = createAuth(options)
      })
  }

  /** Better Auth, once the tables exist. */
  get auth(): Auth {
    if (!this.#auth) throw new Error("account: await ready first")
    return this.#auth
  }

  async #ctx() {
    await this.ready
    return this.auth.$context
  }

  async owner(): Promise<User | null> {
    const found = await (await this.#ctx()).internalAdapter.findUserByEmail(OWNER_EMAIL)
    return found ? toUser(found.user) : null
  }

  /** Create the owner and log this browser in. Returns the Set-Cookie headers. */
  setup(name: string, password: string, headers: Headers): Promise<Headers> {
    return locks.run("account", async () => {
      if (await this.owner()) throw new AccountError(409, "already set up")
      checkPassword(password)
      await this.ready
      const r = await this.auth.api.signUpEmail({ body: { email: OWNER_EMAIL, password, name }, headers, returnHeaders: true })
      await this.#clearCode()
      return r.headers
    })
  }

  async login(password: string, headers: Headers): Promise<Headers> {
    await this.ready
    this.#checkThrottle()
    try {
      const r = await this.auth.api.signInEmail({ body: { email: OWNER_EMAIL, password, rememberMe: true }, headers, returnHeaders: true })
      this.#throttle.failures = []
      return r.headers
    } catch (e) {
      throw this.#failed(e)
    }
  }

  async logout(headers: Headers): Promise<Headers> {
    await this.ready
    const r = await this.auth.api.signOut({ headers, returnHeaders: true })
    return r.headers
  }

  /** The session behind the request's cookie, with headers that refresh the cookie when needed. */
  async session(headers: Headers): Promise<Found | null> {
    await this.ready
    const r = await this.auth.api.getSession({ headers, returnHeaders: true }).catch(() => null)
    if (!r?.response) return null
    const { session, user } = r.response
    return { user: toUser(user), session: { id: session.id, token: session.token }, headers: r.headers }
  }

  async changePassword(headers: Headers, current: string, next: string, revokeOthers: boolean): Promise<Headers> {
    await this.ready
    this.#checkThrottle()
    checkPassword(next)
    try {
      const r = await this.auth.api.changePassword({
        body: { currentPassword: current, newPassword: next, revokeOtherSessions: revokeOthers },
        headers,
        returnHeaders: true,
      })
      this.#throttle.failures = []
      return r.headers
    } catch (e) {
      throw this.#failed(e)
    }
  }

  async rename(userId: string, name: string): Promise<void> {
    await (await this.#ctx()).internalAdapter.updateUser(userId, { name })
  }

  async setOnboarded(userId: string, onboarded: boolean): Promise<void> {
    await (await this.#ctx()).internalAdapter.updateUser(userId, { onboarded })
  }

  async sessions(userId: string, current: string): Promise<AccountSession[]> {
    const list = await (await this.#ctx()).internalAdapter.listSessions(userId, { onlyActiveSessions: true })
    return list
      .map((s) => ({
        id: s.id,
        name: deviceName(s.userAgent),
        created: new Date(s.createdAt).toISOString(),
        last_seen: new Date(s.updatedAt).toISOString(),
        current: s.id === current,
      }))
      .sort((a, b) => b.last_seen.localeCompare(a.last_seen))
  }

  async revokeSession(userId: string, id: string): Promise<boolean> {
    const ctx = await this.#ctx()
    const s = (await ctx.internalAdapter.listSessions(userId)).find((x) => x.id === id)
    if (!s) return false
    await ctx.internalAdapter.deleteSession(s.token)
    return true
  }

  /** From the server's command line, for a forgotten masterpass: logs every browser out. */
  async resetPassword(password: string): Promise<void> {
    checkPassword(password)
    const ctx = await this.#ctx()
    const owner = await this.owner()
    if (!owner) throw new AccountError(409, "no owner yet: open the web app to set it up")
    await ctx.internalAdapter.updatePassword(owner.id, await ctx.password.hash(password))
    await ctx.internalAdapter.deleteUserSessions(owner.id)
  }

  /** A one-time code (8 digits, 10 minutes) for the first setup in prod. Replaces any previous code. */
  startSetupCode(): Promise<string> {
    return locks.run(this.#codeFile, () => {
      const code = String(randomInt(0, 100_000_000)).padStart(8, "0")
      writeSecret(this.#codeFile, { hash: sha256(code), expires: Date.now() + CODE_TTL_MS, attempts: 0 } satisfies SetupCode)
      return code
    })
  }

  /** Wrong codes count; after 5 the code is void. A right code stays valid until setup succeeds. */
  checkSetupCode(code: string): Promise<boolean> {
    return locks.run(this.#codeFile, () => {
      const c = readJson<SetupCode | null>(this.#codeFile, null)
      if (!c || Date.now() > c.expires || c.attempts >= CODE_ATTEMPTS) return false
      if (same(c.hash, sha256(code.replace(/\D/g, "")))) return true
      c.attempts += 1
      writeSecret(this.#codeFile, c)
      return false
    })
  }

  #clearCode() {
    return locks.run(this.#codeFile, () => {
      if (existsSync(this.#codeFile)) writeSecret(this.#codeFile, null)
    })
  }

  #checkThrottle() {
    const now = Date.now()
    if (now < this.#throttle.lockedUntil) {
      throw new AccountError(429, "too many attempts", Math.ceil((this.#throttle.lockedUntil - now) / 1000))
    }
  }

  /** Count a wrong password; after 5 in a minute, lock logins for 15 minutes. */
  #failed(e: unknown): Error {
    if (!(e instanceof APIError)) return e as Error
    const code = (e.body as { code?: string } | undefined)?.code
    if (code !== "INVALID_EMAIL_OR_PASSWORD" && code !== "INVALID_PASSWORD") return new AccountError(400, e.message)
    const now = Date.now()
    const t = this.#throttle
    t.failures = [...t.failures.filter((x) => now - x < LOGIN_WINDOW_MS), now]
    if (t.failures.length >= LOGIN_FAILURES) {
      t.failures = []
      t.lockedUntil = now + LOCKOUT_MS
    }
    return new AccountError(401, "wrong password")
  }
}

function checkPassword(password: string) {
  if (password.length < MIN_PASSWORD) throw new AccountError(400, `the masterpass needs at least ${MIN_PASSWORD} characters`)
  if (password.length > MAX_PASSWORD) throw new AccountError(400, "the masterpass is too long")
}

function toUser(u: { id: string; name: string } & Record<string, unknown>): User {
  return { id: u.id, name: u.name, onboarded: u.onboarded === true }
}
