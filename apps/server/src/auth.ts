/**
 * Who may talk to the API. Security-sensitive: do not loosen these checks without saying so.
 *
 * dev   loopback only. Host must be local (blocks DNS rebinding), Origin missing or local (blocks
 *       cross-site requests).
 * prod  behind Cloudflare Tunnel. Every API request needs:
 *       1. a valid Cloudflare Access JWT (Cf-Access-Jwt-Assertion), so nothing reaches the API
 *          around Access (CF_ACCESS=off skips this, for setups without Access);
 *       2. a paired device: an HttpOnly cookie for the web app, or `Authorization: Bearer` for
 *          shortcuts and native apps. Tokens are stored hashed in data/secrets/devices.json.
 *       Writes from a browser must come from PUBLIC_ORIGIN (CSRF).
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto"
import { join } from "node:path"

import type { Device, Scope } from "@autocratico/core"
import type { Context, MiddlewareHandler } from "hono"
import { getCookie } from "hono/cookie"
import { createRemoteJWKSet, jwtVerify } from "jose"

import type { Config } from "./config.ts"
import { locks, readJson, writeSecret } from "./files.ts"

export const COOKIE = "autocratico_device"
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"])
const PAIRING_TTL_MS = 10 * 60_000
const PAIRING_ATTEMPTS = 5

type StoredDevice = Device & { hash: string }
type Pairing = { hash: string; name: string; scope: Scope; expires: number; attempts: number }
type DeviceFile = { devices: StoredDevice[]; pairing: Pairing | null }

export type Caller = { device: Device | null; via: "dev" | "cookie" | "bearer" }

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

  #read(): DeviceFile {
    return readJson<DeviceFile>(this.file, { devices: [], pairing: null })
  }

  list(): Device[] {
    return this.#read().devices.map(({ hash: _, ...d }) => d)
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

  /** A one-time code (8 digits, 10 minutes) to pair a browser. Replaces any previous code. */
  startPairing(name: string, scope: Scope = "full"): Promise<string> {
    return locks.run(this.file, () => {
      const code = String(randomInt(0, 100_000_000)).padStart(8, "0")
      const f = this.#read()
      f.pairing = { hash: sha256(code), name, scope, expires: Date.now() + PAIRING_TTL_MS, attempts: 0 }
      writeSecret(this.file, f)
      return code
    })
  }

  /** Exchange a pairing code for a device token. Wrong codes count; after 5 the code is void. */
  pair(code: string, name?: string, guess = "browser"): Promise<{ device: Device; token: string } | null> {
    return locks.run(this.file, async () => {
      const f = this.#read()
      const p = f.pairing
      if (!p || Date.now() > p.expires) return null
      if (!same(p.hash, sha256(code.replace(/\D/g, "")))) {
        p.attempts += 1
        if (p.attempts >= PAIRING_ATTEMPTS) f.pairing = null
        writeSecret(this.file, f)
        return null
      }
      f.pairing = null
      writeSecret(this.file, f)
      const id = randomBytes(6).toString("hex")
      const secret = randomBytes(32).toString("base64url")
      const device: Device = {
        id,
        // Name typed on the device, else the one given with the code, else a guess from the browser.
        name: (name || (p.name !== "browser" ? p.name : guess)).slice(0, 60),
        scope: p.scope,
        created: new Date().toISOString(),
        last_seen: null,
      }
      f.devices.push({ ...device, hash: sha256(secret) })
      writeSecret(this.file, f)
      return { device, token: `${id}.${secret}` }
    })
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

/** Paths that answer without a device (the pairing screen needs the app shell and /api/pair). */
const OPEN_API = new Set(["/api/health", "/api/pair", "/api/session"])
const INGEST_API = new Set(["/api/ingest"])

export function authMiddleware(
  config: Config,
  devices: Devices,
  verifyAccess: ((t: string | undefined) => Promise<boolean>) | null = accessVerifier(config)
): MiddlewareHandler<{ Variables: { caller: Caller } }> {
  return async (c, next) => {
    const path = c.req.path
    const write = !["GET", "HEAD", "OPTIONS"].includes(c.req.method)
    const origin = c.req.header("origin")

    if (config.auth === "dev") {
      if (!isLocal(c.req.header("host")) || (origin !== undefined && !isLocal(origin))) return deny(c, 403, "forbidden")
      c.set("caller", { device: null, via: "dev" })
      return next()
    }

    if (path === "/api/health") return next()
    if (verifyAccess && !(await verifyAccess(c.req.header("cf-access-jwt-assertion")))) {
      return deny(c, 401, "Cloudflare Access token missing or invalid")
    }
    if (!path.startsWith("/api/")) return next() // static app shell, already behind Access

    const bearer = c.req.header("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1]
    const cookie = getCookie(c, COOKIE)
    const device = devices.verify(bearer ?? cookie)
    if (write && origin !== undefined && origin !== config.publicOrigin) return deny(c, 403, "cross-origin request")
    // A cookie is sent by the browser on its own: writes with it must name their origin.
    if (write && !bearer && origin === undefined && !OPEN_API.has(path)) return deny(c, 403, "missing Origin")

    if (!device) {
      if (OPEN_API.has(path)) {
        c.set("caller", { device: null, via: "cookie" })
        return next()
      }
      return deny(c, 401, "device not paired")
    }
    if (device.scope === "ingest" && !INGEST_API.has(path) && !OPEN_API.has(path)) return deny(c, 403, "token limited to /api/ingest")
    c.set("caller", { device, via: bearer ? "bearer" : "cookie" })
    return next()
  }
}
