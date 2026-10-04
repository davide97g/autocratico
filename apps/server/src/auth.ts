/**
 * Who may talk to the API. Security-sensitive: do not loosen these checks without saying so.
 *
 * Every API request needs the owner's session (masterpass, account.ts) or an ingest token, in
 * both modes, except /api/health, /api/session, /api/setup and /api/login.
 *
 * dev   loopback only. Host must be local (blocks DNS rebinding), Origin missing or local (blocks
 *       cross-site requests).
 * prod  behind Cloudflare Tunnel. A valid Cloudflare Access JWT (Cf-Access-Jwt-Assertion) comes
 *       first, so nothing reaches the server around Access (CF_ACCESS=off skips it, for setups
 *       without Access: then the masterpass is the only lock).
 *
 * Browser writes must name their Origin, and it must be the app's own (PUBLIC_ORIGIN in prod,
 * loopback in dev): the session cookie is also SameSite=Strict, this is the second wall.
 * Ingest tokens (`Authorization: Bearer`, for shortcuts) are stored hashed in
 * data/secrets/devices.json and only reach /api/ingest.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { existsSync } from "node:fs"
import { join } from "node:path"

import type { Device, Scope } from "@autocratico/core"
import type { Context, MiddlewareHandler } from "hono"
import { createRemoteJWKSet, jwtVerify } from "jose"

import type { Account, User } from "./account.ts"
import type { Config } from "./config.ts"
import { locks, readJson, writeSecret } from "./files.ts"

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"])

type StoredDevice = Device & { hash: string }
type DeviceFile = { devices: StoredDevice[] }

/** The owner (session cookie), an ingest token (bearer), or nobody yet (open paths only). */
export type Caller = { user: User | null; session: string | null; device: Device | null; via: "session" | "bearer" | "none" }

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex")
}

function same(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

function hostname(value: string | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value.includes("//") ? value : `http://${value}`).hostname
  } catch {
    return null
  }
}

export function isLocal(value: string | undefined): boolean {
  const h = hostname(value)
  return h !== null && LOCAL_HOSTS.has(h)
}

export class Devices {
  readonly file: string

  constructor(data: string) {
    this.file = join(data, "secrets", "devices.json")
  }

  /** Only ingest tokens: devices paired as browsers before the masterpass are dropped. */
  #read(): DeviceFile {
    const f = readJson<DeviceFile>(this.file, { devices: [] })
    return { devices: f.devices.filter((d) => d.scope === "ingest") }
  }

  list(): Device[] {
    return this.#read().devices.map(({ hash: _, ...d }) => d)
  }

  /** Rewrite the file without browser devices and pairing codes from before the masterpass. */
  prune(): Promise<void> {
    return locks.run(this.file, () => {
      if (existsSync(this.file)) writeSecret(this.file, this.#read())
    })
  }

  /** Create a device and return its token (shown once). */
  create(name: string, scope: Scope): Promise<{ device: Device; token: string }> {
    return locks.run(this.file, () => {
      const f = this.#read()
      const id = randomBytes(6).toString("hex")
      const secret = randomBytes(32).toString("base64url")
      const device: Device = { id, name: name.slice(0, 60) || "device", scope, created: new Date().toISOString(), last_seen: null }
      f.devices.push({ ...device, hash: sha256(secret) })
      writeSecret(this.file, f)
      return { device, token: `${id}.${secret}` }
    })
  }

  revoke(id: string): Promise<boolean> {
    return locks.run(this.file, () => {
      const f = this.#read()
      const before = f.devices.length
      f.devices = f.devices.filter((d) => d.id !== id)
      writeSecret(this.file, f)
      return f.devices.length < before
    })
  }

  verify(token: string | undefined): Device | null {
    if (!token) return null
    const [id, secret] = token.split(".", 2)
    if (!id || !secret) return null
    const d = this.#read().devices.find((x) => x.id === id)
    if (!d || !same(d.hash, sha256(secret))) return null
    const { hash: _, ...device } = d
    // Record use at most once a minute, outside the request path.
    if (!d.last_seen || Date.now() - Date.parse(d.last_seen) > 60_000) {
      void locks.run(this.file, () => {
        const f = this.#read()
        const x = f.devices.find((y) => y.id === id)
        if (x) {
          x.last_seen = new Date().toISOString()
          writeSecret(this.file, f)
        }
      })
    }
    return device
  }
}

export function accessVerifier(config: Config) {
  if (!config.access) return null
  const issuer = `https://${config.access.team}.cloudflareaccess.com`
  const keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`))
  const audience = config.access.aud
  return async (token: string | undefined): Promise<boolean> => {
    if (!token) return false
    try {
      await jwtVerify(token, keys, { issuer, audience })
      return true
    } catch {
      return false
    }
  }
}

function deny(c: Context, status: 401 | 403, error: string) {
  return c.json({ error }, status)
}

/** Paths that answer without a session: the onboarding and login screens need them. */
const OPEN_API = new Set(["/api/health", "/api/session", "/api/setup", "/api/login"])
const INGEST_API = new Set(["/api/ingest"])

export function authMiddleware(
  config: Config,
  devices: Devices,
  account: Account,
  verifyAccess: ((t: string | undefined) => Promise<boolean>) | null = accessVerifier(config)
): MiddlewareHandler<{ Variables: { caller: Caller } }> {
  const ownOrigin = (o: string) => (config.auth === "dev" ? isLocal(o) : o === config.publicOrigin)
  return async (c, next) => {
    const path = c.req.path
    const write = !["GET", "HEAD", "OPTIONS"].includes(c.req.method)
    const origin = c.req.header("origin")

    if (config.auth === "dev") {
      if (!isLocal(c.req.header("host")) || (origin !== undefined && !isLocal(origin))) return deny(c, 403, "forbidden")
    } else {
      if (path === "/api/health") return next()
      if (verifyAccess && !(await verifyAccess(c.req.header("cf-access-jwt-assertion")))) {
        return deny(c, 401, "Cloudflare Access token missing or invalid")
      }
    }
    if (!path.startsWith("/api/")) return next() // static app shell: the login screen is part of it

    const bearer = c.req.header("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1]
    if (write && origin !== undefined && !ownOrigin(origin)) return deny(c, 403, "cross-origin request")
    // The cookie is sent by the browser on its own: writes with it must name their origin.
    if (write && !bearer && origin === undefined) return deny(c, 403, "missing Origin")

    if (bearer) {
      const device = devices.verify(bearer)
      if (!device) return deny(c, 401, "invalid token")
      if (!INGEST_API.has(path) && !OPEN_API.has(path)) return deny(c, 403, "token limited to /api/ingest")
      c.set("caller", { user: null, session: null, device, via: "bearer" })
      return next()
    }

    const found = await account.session(c.req.raw.headers)
    if (!found) {
      if (!OPEN_API.has(path)) return deny(c, 401, "not logged in")
      c.set("caller", { user: null, session: null, device: null, via: "none" })
      return next()
    }
    c.set("caller", { user: found.user, session: found.session.id, device: null, via: "session" })
    await next()
    // Better Auth renews the session cookie once a day.
    for (const cookie of found.headers.getSetCookie()) c.header("set-cookie", cookie, { append: true })
  }
}
