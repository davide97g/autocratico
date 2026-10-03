/** HTTP API and static web app. Routes are listed with their shapes in openapi.ts. */
import { existsSync, readFileSync, statSync } from "node:fs"
import { extname, join, resolve, sep } from "node:path"

import { type ChatEvent, JobRun, parseToml, type Status } from "@autocratico/core"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { setCookie } from "hono/cookie"
import { secureHeaders } from "hono/secure-headers"
import { stream } from "hono/streaming"
import { z } from "zod"

import { authMiddleware, type Caller, COOKIE, type Devices } from "./auth.ts"
import type { Claude } from "./claude.ts"
import type { Config } from "./config.ts"
import type { DataRepo } from "./git.ts"
import { type Inbox, MAX_UPLOAD, type Upload } from "./inbox.ts"
import { JOB_NAMES, type JobName, type Jobs } from "./jobs.ts"
import { openapi } from "./openapi.ts"
import type { Store } from "./store.ts"
import type { Telegram } from "./telegram.ts"

export const VERSION = "0.1.0"

export type Services = {
  config: Config
  store: Store
  inbox: Inbox
  devices: Devices
  claude: Claude
  repo: DataRepo
  jobs: Jobs | null
  telegram: Telegram | null
  /** Override for tests: verifies the Cloudflare Access JWT. */
  verifyAccess?: ((t: string | undefined) => Promise<boolean>) | null
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
}

const DoneBody = z.object({ key: z.string().regex(/^.+@\d{4}-\d{2}-\d{2}$/), done: z.boolean() })
const ChatBody = z.object({
  message: z.string().trim().min(1).max(20_000),
  chat: z.string().regex(/^[\w-]{1,64}$/).nullable().optional(),
  view: z.string().max(80).optional(),
  locale: z.string().max(8).optional(),
})
const PairBody = z.object({ code: z.string().max(20), name: z.string().max(60).optional(), token: z.boolean().optional() })
const DeviceBody = z.object({ name: z.string().trim().min(1).max(60), scope: z.enum(["full", "ingest"]) })
const IngestJson = z.object({ text: z.string().max(200_000).optional(), title: z.string().max(200).optional() })

export function createApp(s: Services) {
  const { config, store, inbox, devices, claude, repo } = s
  const app = new Hono<{ Variables: { caller: Caller } }>()

  app.use(
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
      crossOriginEmbedderPolicy: false,
    })
  )
  app.use("/api/*", async (c, next) => {
    await next()
    c.header("Cache-Control", "no-store")
  })
  app.use("*", authMiddleware(config, devices, s.verifyAccess === undefined ? undefined : s.verifyAccess))
  app.use("/api/ingest", bodyLimit({ maxSize: MAX_UPLOAD + 1024 * 1024, onError: (c) => c.json({ error: "too large (25 MB max)" }, 413) }))
  app.use("/api/*", async (c, next) => {
    if (c.req.path === "/api/ingest") return next()
    return bodyLimit({ maxSize: 1024 * 1024, onError: (x) => x.json({ error: "too large" }, 413) })(c, next)
  })
  app.onError((e, c) => {
    console.error(`${c.req.method} ${c.req.path}: ${e.message}`)
    return c.json({ error: `${e.name}: ${e.message}` }, 500)
  })

  // ---------- session and pairing ----------

  app.get("/api/health", (c) => c.json({ ok: true }))
  app.get("/api/openapi.json", (c) => c.json(openapi(VERSION)))

  app.get("/api/session", (c) => {
    const caller = c.get("caller")
    return c.json({ paired: config.auth === "dev" || caller.device !== null, auth: config.auth, device: caller.device })
  })

  app.post("/api/pair", async (c) => {
    if (config.auth === "dev") return c.json({ error: "no pairing needed in dev mode" }, 400)
    const body = PairBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid request" }, 400)
    const ua = c.req.header("user-agent") ?? ""
    const guess = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Macintosh/.test(ua) ? "Mac" : "browser"
    const paired = await devices.pair(body.data.code, body.data.name, guess)
    if (!paired) return c.json({ error: "invalid or expired code" }, 401)
    if (body.data.token) return c.json({ device: paired.device, token: paired.token })
    setCookie(c, COOKIE, paired.token, { httpOnly: true, secure: true, sameSite: "Strict", path: "/", maxAge: 400 * 86400 })
    return c.json({ device: paired.device })
  })

  // ---------- register ----------

  app.get("/api/data", (c) => {
    try {
      return c.json(store.data())
    } catch (e) {
      // malformed TOML file: show it in the page
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
    }
  })

  app.post("/api/done", async (c) => {
    const body = DoneBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "missing key" }, 400)
    const done_on = await store.setDone(body.data.key, body.data.done)
    return c.json({ key: body.data.key, done_on })
  })

  // ---------- chat ----------

  app.get("/api/chats", (c) => {
    const channel = c.req.query("channel")
    return c.json(store.chats(channel === "web" || channel === "telegram" ? channel : undefined))
  })

  app.delete("/api/chats/:id", (c) => c.json({ ok: store.deleteChat(c.req.param("id")) }))

  app.post("/api/chat", async (c) => {
    if (c.req.header("content-type")?.split(";")[0] !== "application/json") return c.json({ error: "expected application/json" }, 415)
    const body = ChatBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "empty message" }, 400)
    const { message, view, locale } = body.data
    const chat = (body.data.chat && store.chat(body.data.chat)) || store.newChat("web")
    chat.messages.push({ role: "user", text: message, tools: [] })
    await store.saveChat(chat)
    const signal = c.req.raw.signal

    c.header("Content-Type", "application/x-ndjson; charset=utf-8")
    c.header("X-Accel-Buffering", "no")
    return stream(c, async (out) => {
      const send = (e: ChatEvent) => out.write(JSON.stringify(e) + "\n")
      await send({ type: "chat", id: chat.id })
      const answer = { role: "assistant" as const, text: "", tools: [] as { name: string; detail: string }[], error: undefined as string | undefined }
      const instructions = view ? `The user is looking at the «${view}» section of the web app.` : undefined
      try {
        for await (const e of claude.run({ prompt: message, profile: "read", session: chat.session, locale, instructions, signal })) {
          if (e.type === "session") chat.session = e.id
          else if (e.type === "text") answer.text += e.text
          else if (e.type === "block" && answer.text) answer.text += "\n\n"
          else if (e.type === "tool") answer.tools.push({ name: e.name, detail: e.detail })
          else if (e.type === "error") answer.error = e.message
          if (!out.aborted) await send(e)
        }
      } finally {
        chat.messages.push(answer)
        await store.saveChat(chat)
      }
    })
  })

  // ---------- inbox ----------

  app.post("/api/ingest", async (c) => {
    const type = c.req.header("content-type")?.split(";")[0]
    const caller = c.get("caller")
    const account = caller.device?.name ?? "local"
    const source = caller.via === "bearer" ? "shortcut" : "upload"
    let item
    if (type === "application/json") {
      const body = IngestJson.safeParse(await c.req.json().catch(() => null))
      if (!body.success || !body.data.text?.trim()) return c.json({ error: "empty" }, 400)
      item = await inbox.add({ source, account, text: body.data.text, title: body.data.title })
    } else if (type === "multipart/form-data") {
      const form = await c.req.parseBody({ all: true })
      const files: Upload[] = []
      for (const [, value] of Object.entries(form)) {
        for (const v of Array.isArray(value) ? value : [value]) {
          if (v instanceof File && v.size > 0) files.push({ name: v.name || "file", data: new Uint8Array(await v.arrayBuffer()) })
        }
      }
      const text = typeof form.text === "string" ? form.text : undefined
      const title = typeof form.title === "string" ? form.title : undefined
      if (!files.length && !text?.trim()) return c.json({ error: "empty" }, 400)
      if (files.reduce((n, f) => n + f.data.length, 0) > MAX_UPLOAD) return c.json({ error: "too large (25 MB max)" }, 413)
      item = await inbox.add({ source, account, text, title, files })
    } else {
      return c.json({ error: "expected multipart/form-data or application/json" }, 415)
    }
    s.jobs?.queueTriage()
    return c.json(item)
  })

  app.get("/api/inbox", (c) => c.json(inbox.list()))
  app.get("/api/inbox/:id", (c) => {
    const item = inbox.get(c.req.param("id"))
    return item ? c.json(item) : c.json({ error: "not found" }, 404)
  })
  app.get("/api/inbox/:id/files/:name", (c) => {
    const file = inbox.file(c.req.param("id"), c.req.param("name"))
    if (!file || !existsSync(file)) return c.json({ error: "not found" }, 404)
    // Files come from strangers: never render them inline as a page of this origin.
    c.header("Content-Type", "application/octet-stream")
    c.header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(c.req.param("name"))}`)
    c.header("X-Content-Type-Options", "nosniff")
    return c.body(readFileSync(file))
  })
  app.post("/api/inbox/:id/status", async (c) => {
    const body = z.object({ status: z.enum(["new", "ignored"]) }).safeParse(await c.req.json().catch(() => null))
    if (!body.success || !inbox.get(c.req.param("id"))) return c.json({ error: "invalid request" }, 400)
    await inbox.setStatus([c.req.param("id")], body.data.status, body.data.status === "ignored" ? "ignored by hand" : "")
    if (body.data.status === "new") s.jobs?.queueTriage(2_000)
    return c.json({ ok: true })
  })

  // ---------- activity and jobs ----------

  app.get("/api/activity", async (c) => c.json({ runs: s.jobs?.runs(50) ?? [], commits: await repo.log(30) }))
  app.get("/api/activity/:hash", async (c) => {
    const patch = await repo.show(c.req.param("hash"))
    return patch === null ? c.json({ error: "not found" }, 404) : c.json({ patch })
  })
  app.post("/api/activity/:hash/revert", async (c) => {
    const hash = await repo.revert(c.req.param("hash"))
    return hash ? c.json({ hash }) : c.json({ error: "not found" }, 404)
  })

  app.post("/api/jobs/:name", async (c) => {
    const name = c.req.param("name") as JobName
    if (!s.jobs || !JOB_NAMES.includes(name)) return c.json({ error: "unknown job" }, 404)
    const run = await s.jobs.trigger(name)
    return c.json(JobRun.parse(run))
  })

  app.get("/api/status", (c) => {
    const items = inbox.list()
    const gmail = gmailAccounts(config.data)
    const status: Status = {
      version: VERSION,
      auth: config.auth,
      claude: claude.available,
      telegram: { enabled: s.telegram !== null, chats: s.telegram?.chats().length ?? 0 },
      gmail,
      inbox: { new: items.filter((i) => i.status === "new").length, failed: items.filter((i) => i.status === "failed").length },
      jobs: JOB_NAMES.map((job) => ({ job, last: s.jobs?.last(job) ?? null, next: s.jobs?.next(job) ?? null })),
    }
    return c.json(status)
  })

  // ---------- devices and Telegram ----------

  const fullOnly = (caller: Caller) => config.auth === "dev" || caller.device?.scope === "full"

  app.get("/api/devices", (c) => c.json(devices.list()))
  app.post("/api/devices", async (c) => {
    if (!fullOnly(c.get("caller"))) return c.json({ error: "forbidden" }, 403)
    const body = DeviceBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid request" }, 400)
    if (body.data.scope === "ingest") {
      const { token } = await devices.create(body.data.name, "ingest")
      return c.json({ token })
    }
    return c.json({ code: await devices.startPairing(body.data.name, "full") })
  })
  app.delete("/api/devices/:id", async (c) => {
    if (!fullOnly(c.get("caller"))) return c.json({ error: "forbidden" }, 403)
    return c.json({ ok: await devices.revoke(c.req.param("id")) })
  })

  app.get("/api/telegram/chats", (c) => c.json(s.telegram?.chats() ?? []))
  app.post("/api/telegram/pair", async (c) => {
    if (!s.telegram) return c.json({ error: "TELEGRAM_BOT_TOKEN not set" }, 400)
    const me = await s.telegram.bot.api.getMe().catch(() => null)
    return c.json({ code: await s.telegram.startPairing(), bot: me?.username ?? null })
  })
  app.delete("/api/telegram/chats/:id", async (c) => {
    await s.telegram?.unpair(Number(c.req.param("id")))
    return c.json({ ok: true })
  })

  app.all("/api/*", (c) => c.json({ error: "not found" }, 404))

  // ---------- web app ----------

  app.get("*", (c) => {
    if (!existsSync(config.web)) return c.text("UI not built: run `pnpm build`", 503)
    const root = resolve(config.web)
    let file = resolve(root, `.${decodeURIComponent(c.req.path)}`)
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) file = join(root, "index.html") // SPA fallback
    const hashed = file.includes(`${sep}assets${sep}`)
    c.header("Content-Type", TYPES[extname(file)] ?? "application/octet-stream")
    c.header("Cache-Control", hashed ? "public, max-age=31536000, immutable" : "no-cache")
    return c.body(readFileSync(file))
  })

  return app
}

/** Accounts from gmail.toml (same rules as scripts/gmail.py) and whether each has a token. */
function gmailAccounts(data: string): { name: string; connected: boolean }[] {
  const names = new Set<string>()
  const legacy = existsSync(join(data, "secrets", "token.json"))
  try {
    const config = parseToml(readFileSync(join(data, "gmail.toml"), "utf8"), "gmail.toml")
    if (typeof config.query === "string" && config.query.trim()) names.add("default")
    for (const a of Array.isArray(config.account) ? config.account : []) if (typeof a?.name === "string") names.add(a.name)
  } catch {
    // no or malformed gmail.toml: Gmail is simply not configured
  }
  if (legacy) names.add("default")
  return [...names].map((name) => ({
    name,
    connected: existsSync(join(data, "secrets", "gmail", `${name}.json`)) || (name === "default" && legacy),
  }))
}
