/** Shared by the server tests: a server on a copy of example/, and the owner's session. */
import { cpSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { expect } from "vitest"

import { Account } from "../src/account.ts"
import { createApp } from "../src/app.ts"
import { type Config, loadConfig } from "../src/config.ts"
import { services } from "../src/services.ts"

const ROOT = resolve(import.meta.dirname, "../../..")

export function setup(overrides: Partial<Config> = {}, access: ((t: string | undefined) => Promise<boolean>) | null = null) {
  const data = mkdtempSync(join(tmpdir(), "autocratico-"))
  cpSync(join(ROOT, "example"), data, { recursive: true })
  const config = loadConfig({ data, jobs: false, telegramToken: null, claude: null, ...overrides })
  const s = services(config, { jobs: null, telegram: null, verifyAccess: access, account: new Account(config, ":memory:") })
  return { app: createApp(s), s, data }
}

export type App = ReturnType<typeof createApp>
export const LOCAL = { host: "127.0.0.1:8790" }
export const LOCAL_WRITE = { ...LOCAL, origin: "http://127.0.0.1:8790" }
export const PASSWORD = "correct horse battery"

export function post(app: App, path: string, body: unknown, headers: Record<string, string> = LOCAL_WRITE) {
  return app.request(path, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) })
}

/** The session cookie from a response, ready for a Cookie header. */
export function cookieOf(r: Response): string {
  return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")
}

/** Create the owner from loopback and return headers with its session. */
export async function owner(app: App): Promise<Record<string, string>> {
  const r = await post(app, "/api/setup", { name: "Maria", password: PASSWORD })
  expect(r.status).toBe(200)
  return { ...LOCAL_WRITE, cookie: cookieOf(r) }
}

