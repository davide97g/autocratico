/** HTTP API and static web app. Routes are listed with their shapes in openapi.ts. */
import { existsSync, readFileSync, statSync } from "node:fs"
import { basename, extname, join, resolve, sep } from "node:path"

import { type ChatEvent, FinanceConnectInput, FinanceExpenseInput, GmailAccountInput, JobRun, ProfileInput, type Session, type Status, stripActions } from "@autocratico/core"
import { type Context, Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { secureHeaders } from "hono/secure-headers"
import { stream, streamSSE } from "hono/streaming"
import { z } from "zod"

import { type Account, AccountError, MAX_PASSWORD } from "./account.ts"
import { authMiddleware, type Caller, type Devices } from "./auth.ts"
import type { Changes } from "./changes.ts"
import { type Claude, friendlyError } from "./claude.ts"
import type { Config } from "./config.ts"
import { type Finance, FinanceError } from "./finance.ts"
import type { DataRepo } from "./git.ts"
import { Gmail, GmailError } from "./gmail.ts"
import { type GmailLinks, GmailLinkError } from "./gmail-links.ts"
import { IMAGE_TYPES, thumbnail } from "./images.ts"
import { documentFile, type Inbox, MAX_UPLOAD, type Upload } from "./inbox.ts"
import { JOB_NAMES, type JobName, type Jobs } from "./jobs.ts"
import { openapi } from "./openapi.ts"
import { describeSource, listArchive } from "./sources.ts"
import { setPersonName, writeProfile } from "./profile.ts"
import type { Store } from "./store.ts"
import { finishAnswer } from "./chat-actions.ts"
import type { PaymentMatches } from "./matches.ts"
import type { Pulse } from "./pulse.ts"
import type { Usage } from "./usage.ts"
import type { Reminders } from "./reminders.ts"
import type { Ntfy } from "./ntfy.ts"
import type { Telegram } from "./telegram.ts"
import type { Transcriber } from "./transcribe.ts"

export const VERSION = "0.1.0"

export type Services = {
  config: Config
  store: Store
  inbox: Inbox
  devices: Devices
  account: Account
  changes: Changes
  claude: Claude
  repo: DataRepo
  jobs: Jobs | null
  telegram: Telegram | null
  /** Push notifications through ntfy (NTFY_URL). */
  ntfy: Ntfy | null
  transcriber: Transcriber
  reminders: Reminders
  /** The finance source's mirror (tests pass one with a fake finance server). */
  finance: Finance
  /** Payments seen in the finance source, proposed for open occurrences. */
  matches: PaymentMatches
  /** What changed, for the open web apps (`/api/events`). */
  pulse: Pulse
  /** The Claude subscription's limits and the agent's runs, for the Settings card. */
  usage: Usage
  /** Gmail links in the chat: preview, and the conversation saved for the agent. */
  gmailLinks: GmailLinks
  /** Override for tests: Gmail setup with a fake Google. */
  gmail?: Gmail
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
  /** Occurrence key (`<id>@<date>`) the conversation is about, from "Ask Claude" on a deadline. */
  about: DoneBody.shape.key.max(200).optional(),
})
const MatchAnswer = z.object({ answer: z.enum(["paid", "dismiss"]) })
type Env = { Variables: { caller: Caller } }

const Name = z.string().trim().min(1).max(60)
const Password = z.string().max(MAX_PASSWORD)
const SetupBody = z.object({ name: Name, password: Password, code: z.string().max(20).optional() })
const LoginBody = z.object({ password: Password })
const PasswordBody = z.object({ current: Password, next: Password, revokeOthers: z.boolean().default(false) })
const DeviceBody = z.object({ name: Name })
const IngestJson = z.object({ text: z.string().max(200_000).optional(), title: z.string().max(200).optional() })

export function createApp(s: Services) {
  const { config, store, inbox, devices, account, claude, repo } = s
  const gmail = s.gmail ?? new Gmail(config.data)
  const app = new Hono<Env>()

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
  app.use("*", authMiddleware(config, devices, account, s.verifyAccess === undefined ? undefined : s.verifyAccess))
  app.use("/api/ingest", bodyLimit({ maxSize: MAX_UPLOAD + 1024 * 1024, onError: (c) => c.json({ error: "too large (25 MB max)" }, 413) }))
  app.use("/api/*", async (c, next) => {
    if (c.req.path === "/api/ingest") return next()
    return bodyLimit({ maxSize: 1024 * 1024, onError: (x) => x.json({ error: "too large" }, 413) })(c, next)
  })
  app.onError((e, c) => {
    if (e instanceof GmailError) return c.json({ error: e.message }, e.status)
    if (e instanceof GmailLinkError) return c.json({ error: e.message, code: e.code }, e.status)
    if (e instanceof FinanceError) return c.json({ error: e.message }, e.status)
    if (e instanceof AccountError) {
      if (e.retryAfter) c.header("Retry-After", String(e.retryAfter))
      return c.json({ error: e.message, ...(e.retryAfter ? { retryAfter: e.retryAfter } : {}) }, e.status)
    }
    console.error(`${c.req.method} ${c.req.path}: ${e.message}`)
    return c.json({ error: `${e.name}: ${e.message}` }, 500)
  })

  // ---------- session and account ----------

  app.get("/api/health", (c) => c.json({ ok: true }))
  app.get("/api/openapi.json", (c) => c.json(openapi(VERSION)))

  const sessionInfo = async (caller: Caller): Promise<Session> => {
    const owner = (await account.owner()) !== null
    return {
      auth: config.auth,
      owner,
      authenticated: caller.via !== "none",
      user: caller.user ? { name: caller.user.name, onboarded: caller.user.onboarded } : null,
      needsCode: !owner && config.auth === "prod",
      registers: caller.user ? config.registers : [],
    }
  }
  /** Better Auth's Set-Cookie headers, passed on to the browser. */
  const cookies = (c: Context<Env>, headers: Headers) => {
    for (const cookie of headers.getSetCookie()) c.header("set-cookie", cookie, { append: true })
  }
  const userOf = (c: Context<Env>) => {
    const user = c.get("caller").user
    if (!user) throw new AccountError(403, "only the owner can do this")
    return user
  }
  const commit = (message: string) => void repo.commit(message).catch((e: Error) => console.error(`git: ${e.message}`))

  app.get("/api/session", async (c) => c.json(await sessionInfo(c.get("caller"))))

  app.post("/api/setup", async (c) => {
    const body = SetupBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid request" }, 400)
    if (await account.owner()) return c.json({ error: "already set up" }, 409)
    // On a server reachable from outside, the first setup proves access to the server itself.
    if (config.auth === "prod" && !(await account.checkSetupCode(body.data.code ?? ""))) {
      return c.json({ error: "invalid or expired setup code" }, 403)
    }
    const headers = await account.setup(body.data.name, body.data.password, c.req.raw.headers)
    cookies(c, headers)
    await setPersonName(config.data, body.data.name)
    commit("Profile: name")
    return c.json({ ok: true })
  })

  app.post("/api/login", async (c) => {
    const body = LoginBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid request" }, 400)
    if (!(await account.owner())) return c.json({ error: "not set up yet" }, 409)
    cookies(c, await account.login(body.data.password, c.req.raw.headers))
    return c.json({ ok: true })
  })

  app.post("/api/logout", async (c) => {
    cookies(c, await account.logout(c.req.raw.headers))
    return c.json({ ok: true })
  })

  app.post("/api/account/password", async (c) => {
    userOf(c)
    const body = PasswordBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid request" }, 400)
    cookies(c, await account.changePassword(c.req.raw.headers, body.data.current, body.data.next, body.data.revokeOthers))
    return c.json({ ok: true })
  })

  app.post("/api/account/name", async (c) => {
    const user = userOf(c)
    const body = z.object({ name: Name }).safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid request" }, 400)
    await account.rename(user.id, body.data.name)
    await setPersonName(config.data, body.data.name)
    commit("Profile: name")
    return c.json({ ok: true })
  })

  app.post("/api/account/onboarded", async (c) => {
    const user = userOf(c)
    const body = z.object({ onboarded: z.boolean() }).safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid request" }, 400)
    await account.setOnboarded(user.id, body.data.onboarded)
    return c.json({ ok: true })
  })

  app.get("/api/account/sessions", async (c) => {
    const user = userOf(c)
    return c.json(await account.sessions(user.id, c.get("caller").session ?? ""))
  })
  app.delete("/api/account/sessions/:id", async (c) => {
    const user = userOf(c)
    return c.json({ ok: await account.revokeSession(user.id, c.req.param("id")) })
  })

  app.put("/api/profile", async (c) => {
    userOf(c)
    const body = ProfileInput.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid request" }, 400)
    await writeProfile(config.data, body.data)
    commit("Profile: edited in the web app")
    return c.json({ ok: true })
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
    return c.json(store.chatSummaries(channel === "web" || channel === "telegram" ? channel : undefined))
  })

  app.get("/api/chats/:id", (c) => {
    const chat = store.chat(c.req.param("id"))
    return chat ? c.json(chat) : c.json({ error: "not found" }, 404)
  })

  app.delete("/api/chats/:id", (c) => c.json({ ok: store.deleteChat(c.req.param("id")) }))

  app.post("/api/chat", async (c) => {
    if (c.req.header("content-type")?.split(";")[0] !== "application/json") return c.json({ error: "expected application/json" }, 415)
    const body = ChatBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "empty message" }, 400)
    const { message, view, locale, about } = body.data
    const caller = c.get("caller")
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
      const instructions = [view && `The user is looking at the «${view}» section of the web app.`, aboutDeadline(about)].filter(Boolean).join("\n") || undefined
      const lang = locale === "en" ? "en" : "it"
      try {
        // Gmail links: the conversations are saved in the archive first, and the agent told where.
        const prompt = await s.gmailLinks.prompt(message, async (step) => {
          answer.tools.push(step)
          if (!out.aborted) await send({ type: "tool", ...step })
        })
        if (signal.aborted) return
        for await (const e of claude.run({ prompt, profile: "read", session: chat.session, locale, instructions, signal, actions: true })) {
          if (e.type === "session") chat.session = e.id
          else if (e.type === "text") answer.text += e.text
          else if (e.type === "block" && answer.text) answer.text += "\n\n"
          else if (e.type === "tool") answer.tools.push({ name: e.name, detail: e.detail })
          else if (e.type === "error") {
            chat.session = null // nothing worth resuming after a failed run
            answer.error = friendlyError(e.message, lang)
          }
          if (e.type === "end") {
            // Act on the reminder/inbox blocks, then tell the user what was done (the web app hides the blocks).
            const raw = answer.text
            answer.text = await finishAnswer(raw, "web", caller.user?.name ?? "web", {
              reminders: s.reminders,
              inbox,
              jobs: s.jobs,
              notify: s.telegram !== null || s.ntfy !== null,
              locale: lang,
              changes: s.changes,
            })
            const extra = answer.text.slice(stripLength(raw))
            if (extra.trim() && !out.aborted) await send({ type: "text", text: extra })
          }
          if (!out.aborted) await send(e.type === "error" ? { type: "error", message: answer.error ?? e.message } : e)
        }
      } finally {
        chat.messages.push(answer)
        await store.saveChat(chat)
      }
    })
  })

  /** Points the agent at the deadline a chat was opened from; unknown keys add nothing. */
  function aboutDeadline(key: string | undefined) {
    const o = key ? store.data().agenda.find((x) => x.key === key) : undefined
    if (!o) return null
    const where = [o.source && `its source is \`${o.source}\``, o.case && `its case is \`cases/${o.case}/\``].filter(Boolean).join(", ")
    return `This conversation is about the deadline \`${o.id}\` in deadlines.toml, occurrence of ${o.date}${o.done_on ? ` (done on ${o.done_on})` : ""}${where ? `; ${where}` : ""}. Read ${where ? "it and those files" : "it"} before answering; "it" or "this" means that deadline.`
  }

  // ---------- inbox ----------

  app.post("/api/ingest", async (c) => {
    const type = c.req.header("content-type")?.split(";")[0]
    const caller = c.get("caller")
    const account = caller.device?.name ?? "web"
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
  // Original files (inbox/, archive/), for the case, deadline, inbox and activity views. Raster images
  // may be shown inline (exact image type, nosniff); everything else is a download.
  app.get("/api/file", async (c) => {
    const path = c.req.query("path") ?? ""
    const file = documentFile(config.data, path)
    if (!file) return c.json({ error: "not found" }, 404)
    const as = c.req.query("as")
    const type = IMAGE_TYPES[extname(file).toLowerCase()]
    c.header("X-Content-Type-Options", "nosniff")
    c.header("Cache-Control", "private, max-age=3600")
    if (type && (as === "view" || as === "thumb")) {
      const shown = (as === "thumb" && (await thumbnail(config.data, file))) || file
      c.header("Content-Type", shown === file ? type : "image/jpeg")
      c.header("Content-Disposition", "inline")
      return c.body(readFileSync(shown))
    }
    c.header("Content-Type", "application/octet-stream")
    c.header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(basename(file))}`)
    return c.body(readFileSync(file))
  })
  // What a deadline's source is: email (with its Gmail link), inbox item or file, as plain data.
  app.get("/api/source", (c) => {
    const info = describeSource(config.data, c.req.query("path") ?? "")
    return info ? c.json(info) : c.json({ error: "not found" }, 404)
  })
  app.get("/api/archive", (c) => c.json(listArchive(config.data)))
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

  app.get("/api/jobs/live", (c) => c.json(s.jobs?.live() ?? { current: null, waiting: [], triage: null }))
  app.post("/api/jobs/:name", async (c) => {
    const name = c.req.param("name") as JobName
    if (!s.jobs || !JOB_NAMES.includes(name)) return c.json({ error: "unknown job" }, 404)
    const run = await s.jobs.trigger(name, true)
    return c.json(JobRun.parse(run))
  })

  app.get("/api/usage", (c) => c.json(s.usage.view()))

  app.get("/api/status", (c) => {
    const items = inbox.list()
    const status: Status = {
      version: VERSION,
      auth: config.auth,
      claude: claude.available,
      speech: s.transcriber.available,
      telegram: { enabled: s.telegram !== null, chats: s.telegram?.chats().length ?? 0 },
      ntfy: { enabled: s.ntfy !== null, host: s.ntfy?.host ?? null },
      gmail: gmail.setup().accounts.map((a) => ({ name: a.name, connected: a.state === "connected" })),
      finance: { connected: s.finance.configured(), live: s.finance.live, synced_at: s.finance.setup().synced_at },
      inbox: { new: items.filter((i) => i.status === "new").length, failed: items.filter((i) => i.status === "failed").length },
      jobs: JOB_NAMES.map((job) => ({ job, last: s.jobs?.last(job) ?? null, next: s.jobs?.next(job) ?? null })),
    }
    return c.json(status)
  })

  // ---------- Gmail (OAuth client, accounts, sign-in; secrets stay on the server) ----------

  app.get("/api/gmail", (c) => c.json(gmail.setup()))
  app.put("/api/gmail/client", async (c) => {
    userOf(c)
    return c.json(gmail.saveClient(await c.req.json().catch(() => null)))
  })
  app.post("/api/gmail/accounts", async (c) => {
    userOf(c)
    const body = GmailAccountInput.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid request" }, 400)
    await gmail.saveAccount(body.data)
    commit(`Gmail: account ${body.data.name}`)
    return c.json({ ok: true })
  })
  app.delete("/api/gmail/accounts/:name", async (c) => {
    userOf(c)
    const removed = await gmail.removeAccount(c.req.param("name"))
    if (removed) commit(`Gmail: account ${c.req.param("name")} removed`)
    return removed ? c.json({ ok: true }) : c.json({ error: "not found" }, 404)
  })
  app.post("/api/gmail/accounts/:name/authorize", (c) => {
    userOf(c)
    // Browser writes carry an Origin the auth middleware already matched to the app's own.
    const origin = config.publicOrigin ?? c.req.header("origin")
    if (!origin) return c.json({ error: "missing Origin" }, 400)
    return c.json(gmail.authorize(c.req.param("name"), origin))
  })
  // What a Gmail link pasted in the chat points to; nothing is saved until the message is sent.
  app.get("/api/gmail/preview", async (c) => c.json(await s.gmailLinks.preview(c.req.query("link") ?? "")))
  app.post("/api/gmail/complete", async (c) => {
    userOf(c)
    const body = z.object({ url: z.string().min(1).max(4000) }).safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid request" }, 400)
    return c.json(await gmail.complete(body.data.url))
  })

  // ---------- ingest tokens and Telegram ----------

  // ---------- Finance source (mirror, change feed, paid occurrences recorded there; a token stays here) ----------

  app.get("/api/finance", (c) => c.json(s.finance.setup()))
  app.put("/api/finance", async (c) => {
    userOf(c)
    const raw = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    // Clients from before connectors send only { url, token }.
    const body = FinanceConnectInput.safeParse(raw && !("connector" in raw) ? { connector: "http", ...raw } : raw)
    if (!body.success) return c.json({ error: "invalid finance settings (address, token or CSV columns)" }, 400)
    const setup = await s.finance.connect(body.data)
    commit("Finance: connected")
    return c.json(setup)
  })
  app.delete("/api/finance", async (c) => {
    userOf(c)
    await s.finance.disconnect()
    commit("Finance: disconnected")
    return c.json({ ok: true })
  })
  app.get("/api/finance/data", (c) => c.json(s.finance.data()))
  app.post("/api/finance/sync", async (c) => c.json(await s.finance.sync("full")))
  app.post("/api/finance/transactions", async (c) => {
    userOf(c)
    const body = FinanceExpenseInput.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid request" }, 400)
    return c.json(await s.finance.addExpense(body.data))
  })
  app.delete("/api/finance/transactions/:key", async (c) => {
    userOf(c)
    return c.json({ ok: await s.finance.removeExpense(c.req.param("key")) })
  })
  app.get("/api/finance/matches", (c) => c.json(s.matches.open()))
  app.post("/api/finance/matches/:id", async (c) => {
    userOf(c)
    const body = MatchAnswer.safeParse(await c.req.json().catch(() => null))
    const id = c.req.param("id")
    if (!body.success || !/^[0-9a-f]{8}$/.test(id)) return c.json({ error: "invalid request" }, 400)
    const ok = body.data.answer === "paid" ? (await s.matches.accept(id)) !== null : await s.matches.dismiss(id)
    return ok ? c.json({ ok }) : c.json({ error: "this proposal is no longer open" }, 409)
  })

  /**
   * Server events for the open web app: `finance` with the mirror's revision when it changes, and one event
   * per topic of `pulse.ts` (data, inbox, archive, activity, jobs, chats, reminders, usage) when something there changed.
   */
  app.get("/api/events", (c) =>
    streamSSE(c, async (sse) => {
      let open = true
      const send = (event: string, data: unknown) =>
        sse.writeSSE({ event, data: JSON.stringify(data) }).catch(() => {
          open = false
        })
      const off = s.finance.onChange((rev) => void send("finance", { rev }))
      const offPulse = s.pulse.on((topic) => void send(topic, {}))
      sse.onAbort(() => {
        open = false
      })
      await send("ready", { finance: s.finance.rev })
      while (open) {
        await sse.sleep(25_000)
        if (open) await send("ping", Date.now())
      }
      off()
      offPulse()
    })
  )

  app.get("/api/devices", (c) => {
    userOf(c)
    return c.json(devices.list())
  })
  app.post("/api/devices", async (c) => {
    userOf(c)
    const body = DeviceBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: "invalid request" }, 400)
    const { token } = await devices.create(body.data.name, "ingest")
    return c.json({ token })
  })
  app.delete("/api/devices/:id", async (c) => {
    userOf(c)
    return c.json({ ok: await devices.revoke(c.req.param("id")) })
  })

  app.get("/api/reminders", (c) => c.json(s.reminders.pending()))
  app.delete("/api/reminders/:id", async (c) => c.json({ ok: (await s.reminders.cancel(c.req.param("id"))) !== null }))

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

/** Length of the answer once its action blocks are removed: what follows it is the server's confirmation. */
function stripLength(raw: string): number {
  return stripActions(raw).length
}

