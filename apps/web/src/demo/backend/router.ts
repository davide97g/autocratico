// The pretend server: every /api route the web app calls (apps/server/src/app.ts), answered from the
// demo's register in memory. Same shapes, same status codes for the cases the web app handles.
import {
  type ArchiveEntry,
  type ChatSummary,
  FinanceExpenseInput,
  type FinanceSetup,
  InboxItem,
  isDocumentPath,
  ProfileInput,
  type SourceInfo,
  type Status,
  type Widget,
  WidgetInput,
} from "@autocratico/core"

import { track } from "../analytics"
import { answer, type ChatRequest, preview } from "./brain"
import { answerProposal, calendar, calendarAgenda, calendarSetup, CALENDAR_ACCOUNT } from "./calendar"
import { remember } from "./files"
import { JOBS, live, queueTriage, trigger } from "./jobs"
import { data, documents, lang, setDone } from "./register"
import {
  changed,
  commit,
  type DemoInbox,
  type DemoState,
  revert,
  state,
} from "./state"
import { hex, nowIso, slug, today } from "./util"

export type Req = {
  method: string
  url: URL
  body: unknown
  form: FormData | null
  signal: AbortSignal
}
type Handler = (req: Req, params: string[]) => Response | Promise<Response>

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
const fail = (error: string, status: number) => json({ error }, status)
const ok = () => json({ ok: true })
const demoOnly = () =>
  fail(
    lang() === "it"
      ? "Nella demo questo collegamento è finto: niente esce dal tuo browser."
      : "In the demo this connection is pretend: nothing leaves your browser.",
    403
  )

const routes: [string, RegExp, Handler][] = []
const on = (method: string, path: string, h: Handler) =>
  routes.push([
    method,
    new RegExp(`^${path.replace(/:[a-z]+/g, "([^/]+)")}$`),
    h,
  ])

/** Called when the visitor logs out: the demo starts over (boot.tsx sets it). */
export const hooks = { restart: () => undefined as void }

// ---------- account ----------

on("GET", "/api/health", () => ok())
on("GET", "/api/session", () =>
  json({
    auth: "prod",
    owner: true,
    authenticated: true,
    user: { name: state().name, onboarded: true },
    needsCode: false,
    registers: [],
  })
)
on("POST", "/api/setup", () => fail("already set up", 409))
on("POST", "/api/login", () => ok())
on("POST", "/api/logout", () => {
  window.setTimeout(() => hooks.restart(), 50)
  return ok()
})
on("POST", "/api/account/password", (r) => {
  const b = r.body as { current?: string; next?: string }
  if (!b?.current) return fail("wrong password", 401)
  if (!b.next || b.next.length < 8)
    return fail("the masterpass needs at least 8 characters", 400)
  return ok()
})
on("POST", "/api/account/name", (r) => {
  const name = String((r.body as { name?: string })?.name ?? "")
    .trim()
    .slice(0, 60)
  if (!name) return fail("empty name", 400)
  const s = state()
  commit("Profile: name", () => {
    s.name = name
    s.profile = {
      ...s.profile,
      person: { ...(s.profile.person as object), name },
    }
  })
  return ok()
})
on("POST", "/api/account/onboarded", () => ok())
on("GET", "/api/account/sessions", () => json(state().sessions))
on("DELETE", "/api/account/sessions/:id", (_, [id]) => {
  const s = state()
  const target = s.sessions.find((x) => x.id === id)
  if (!target) return fail("not found", 404)
  if (target.current) return fail("this is the current session", 400)
  s.sessions = s.sessions.filter((x) => x.id !== id)
  return ok()
})
on("PUT", "/api/profile", (r) => {
  const p = ProfileInput.safeParse(r.body)
  if (!p.success) return fail("invalid profile", 400)
  const s = state()
  commit("Profile: edited in the web app", () => {
    const clean = (row: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(row).filter(([, v]) => v !== "" && v !== null)
      ) as Record<string, string | number | boolean>
    const next = { ...s.profile }
    if (p.data.person) next.person = { ...clean(p.data.person), name: s.name }
    if (p.data.work) next.work = clean(p.data.work)
    if (p.data.property) next.property = p.data.property.map(clean)
    if (p.data.vehicle) next.vehicle = p.data.vehicle.map(clean)
    s.profile = next
  })
  return ok()
})

// ---------- register ----------

on("GET", "/api/data", () => json(data()))
on("POST", "/api/done", (r) => {
  const b = r.body as { key?: string; done?: boolean }
  if (typeof b?.key !== "string" || typeof b.done !== "boolean")
    return fail("bad request", 400)
  const done_on = setDone(b.key, b.done)
  if (done_on === undefined) return fail("unknown occurrence", 404)
  changed("data")
  return json({ done_on })
})

// ---------- board ----------

const widgetId = (id: string) => /^[a-z0-9][a-z0-9-]{0,59}$/.test(id)

on("GET", "/api/board", () => json({ version: 1, widgets: state().board ?? [] }))
on("PUT", "/api/board/widgets/:id", (r, [id]) => {
  const body = WidgetInput.safeParse(r.body)
  if (!body.success) return fail(body.error.issues[0]?.message ?? "invalid widget", 400)
  const w = body.data
  if (w.id !== id) return fail("the id does not match", 400)
  const s = state()
  const before = (s.board ?? []).find((x) => x.id === id) ?? null
  const now = nowIso()
  const widget: Widget = { ...w, created: before?.created ?? now, updated: now }
  const c = commit(`Board: ${before ? "update" : "add"} ${id}`, () => {
    const board = [...(s.board ?? [])]
    const at = board.findIndex((x) => x.id === id)
    if (at >= 0) board[at] = widget
    else board.push(widget)
    s.board = board
  }, { body: w.title })
  track("widget_saved")
  return json({ widget, added: !before, hash: c?.hash ?? null })
})
on("DELETE", "/api/board/widgets/:id", (_, [id]) => {
  const s = state()
  if (!widgetId(id) || !(s.board ?? []).some((x) => x.id === id)) return fail(`no widget with id "${id}"`, 409)
  const c = commit(`Board: remove ${id}`, () => {
    s.board = (s.board ?? []).filter((x) => x.id !== id)
  })
  return json({ hash: c?.hash ?? null })
})
on("POST", "/api/board/widgets/:id/move", (r, [id]) => {
  const index = (r.body as { index?: unknown })?.index
  const s = state()
  const board = [...(s.board ?? [])]
  const from = board.findIndex((x) => x.id === id)
  if (from < 0 || typeof index !== "number" || !Number.isInteger(index) || index < 0) return fail("invalid request", 400)
  const [w] = board.splice(from, 1)
  board.splice(Math.min(index, board.length), 0, w)
  const c = commit(`Board: move ${id}`, () => {
    s.board = board
  })
  return json({ hash: c?.hash ?? null })
})

// ---------- chat ----------

on("GET", "/api/chats", (r) => {
  const channel = r.url.searchParams.get("channel")
  const list: ChatSummary[] = state()
    .chats.filter((c) => !channel || c.channel === channel)
    .flatMap((c) => {
      const first = c.messages.find((m) => m.role === "user")
      if (!first) return []
      const text = first.text.replace(/\s+/g, " ").trim()
      return [
        {
          id: c.id,
          channel: c.channel,
          updated: c.updated,
          title: text.length > 80 ? `${text.slice(0, 79).trimEnd()}…` : text,
          messages: c.messages.length,
        },
      ]
    })
    .sort((a, b) => b.updated.localeCompare(a.updated))
  return json(list)
})
on("GET", "/api/chats/:id", (_, [id]) => {
  const c = state().chats.find((x) => x.id === id)
  return c ? json(c) : fail("not found", 404)
})
on("DELETE", "/api/chats/:id", (_, [id]) => {
  const s = state()
  s.chats = s.chats.filter((c) => c.id !== id)
  changed("chats")
  return ok()
})
on("POST", "/api/chat", (r) => {
  const b = r.body as ChatRequest
  if (typeof b?.message !== "string" || (!b.message.trim() && !b.files?.length))
    return fail("empty message", 400)
  const encoder = new TextEncoder()
  const events = answer({ ...b, message: b.message.slice(0, 20_000) }, r.signal)
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await events.next()
        if (done) controller.close()
        else controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"))
      } catch (e) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "error", message: (e as Error).message }) +
              "\n"
          )
        )
        controller.close()
      }
    },
    cancel() {
      void events.return(undefined)
    },
  })
  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  })
})
on("GET", "/api/gmail/preview", (r) => {
  const p = preview(r.url.searchParams.get("link") ?? "")
  return p ? json(p) : fail("not a Gmail conversation link", 400)
})

// ---------- inbox, archive, sources, files ----------

/** The item as the server lists it: its text and the demo's own fields left out. */
const listed = (i: DemoInbox): InboxItem => InboxItem.parse(i)

on("GET", "/api/inbox", () =>
  json(
    state()
      .inbox.map(listed)
      .sort((a, b) => b.received.localeCompare(a.received))
  )
)
on("GET", "/api/inbox/:id", (_, [id]) => {
  const i = state().inbox.find((x) => x.id === id)
  return i ? json({ ...listed(i), content: i.content }) : fail("not found", 404)
})
on("POST", "/api/inbox/:id/status", (r, [id]) => {
  const st = (r.body as { status?: string })?.status
  const i = state().inbox.find((x) => x.id === id)
  if (!i) return fail("not found", 404)
  if (st !== "new" && st !== "ignored") return fail("bad status", 400)
  i.status = st
  changed("inbox")
  if (st === "new") queueTriage()
  return ok()
})
on("POST", "/api/inbox/:id/phishing", (r, [id]) => {
  const dismissed = (r.body as { dismissed?: unknown })?.dismissed
  const i = state().inbox.find((x) => x.id === id)
  if (!i?.phishing || typeof dismissed !== "boolean") return fail("invalid request", 400)
  i.phishing = { ...i.phishing, dismissed: dismissed ? nowIso() : "" }
  changed("inbox", "archive")
  return ok()
})

const MAX_FILE = 8 * 1024 * 1024
const KEEP_DATA = 600 * 1024

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

// Files attached in the chat: kept in the tab like uploads, drawn by files.ts when shown.
on("POST", "/api/chat/files", async (r) => {
  const files = (r.form?.getAll("file") ?? []).filter((f): f is File => f instanceof File)
  if (!files.length) return fail("empty", 400)
  if (files.length > 10) return fail("at most 10 files", 400)
  if (files.some((f) => f.size > MAX_FILE))
    return fail(lang() === "it" ? "Nella demo i file possono essere al massimo di 8 MB." : "In the demo files can be 8 MB at most.", 413)
  const s = state()
  const folder = `chats/files/${today()}-${hex(8)}`
  const saved = []
  for (const f of files) {
    const name = f.name.replace(/[^\w.\- ]+/g, "_").slice(0, 100) || "file"
    const path = `${folder}/${name}`
    s.docs[path] = { kind: "upload", name, mime: f.type, data: f.size <= KEEP_DATA ? await readAsDataUrl(f).catch(() => null) : null }
    remember(path, f)
    saved.push({ path, name, image: /\.(png|jpe?g|gif|webp)$/i.test(name), size: f.size })
  }
  changed()
  return json(saved)
})
on("GET", "/api/chat/files", () => fail("not found", 404))

on("POST", "/api/ingest", async (r) => {
  const form = r.form
  if (!form) return fail("expected multipart/form-data", 415)
  const files = form.getAll("file").filter((f): f is File => f instanceof File)
  const text = String(form.get("text") ?? "").slice(0, 20_000)
  if (!files.length && !text.trim()) return fail("empty", 400)
  if (files.some((f) => f.size > MAX_FILE))
    return fail(
      lang() === "it"
        ? "Nella demo i file possono essere al massimo di 8 MB."
        : "In the demo files can be 8 MB at most.",
      413
    )
  const s = state()
  const title =
    String(form.get("title") ?? "").trim() ||
    files[0]?.name.replace(/\.[^.]+$/, "") ||
    text.trim().split("\n")[0].slice(0, 60)
  const id = hex(12)
  const folder = `${today()}-upload-${slug(title) || "documento"}-${id.slice(0, 6)}`
  const paths: string[] = []
  for (const f of files) {
    const name = f.name.replace(/[^\w.\- ]+/g, "_").slice(0, 100) || "file"
    const path = `inbox/${folder}/${name}`
    s.docs[path] = {
      kind: "upload",
      name,
      mime: f.type,
      data:
        f.size <= KEEP_DATA ? await readAsDataUrl(f).catch(() => null) : null,
    }
    remember(path, f)
    paths.push(path)
  }
  const item: DemoInbox = {
    id,
    folder,
    source: "upload",
    status: "new",
    received: nowIso(),
    title,
    from: "",
    account: "web",
    files: paths,
    ref: "",
    outcome: "",
    important: false,
    marketing: false,
    phishing: null,
    content: text,
  }
  s.inbox.unshift(item)
  changed("inbox")
  queueTriage()
  track("app_demo_upload", { files: paths.length })
  return json(listed(item))
})

function archiveDate(s: DemoState, path: string): string {
  // When it was filed: the commit that added it, else the start of the register (the documents it began with).
  return s.commits.findLast((c) => c.files.includes(path))?.date ?? s.commits.at(-1)?.date ?? s.created
}

on("GET", "/api/archive", () => {
  const s = state()
  const out: ArchiveEntry[] = s.emails.map((e) => {
    const flagged = s.inbox.find((i) => i.ref === e.path && i.phishing)?.phishing
    return {
      path: e.path,
      kind: "email",
      title: e.title,
      from: e.from,
      date: e.date,
      account: e.account,
      files: e.files.length,
      phishing: flagged ? { risk: flagged.risk, dismissed: Boolean(flagged.dismissed) } : null,
    }
  })
  for (const path of Object.keys(s.docs)) {
    if (!path.startsWith("archive/") || path.startsWith("archive/email/"))
      continue
    out.push({
      path,
      kind: "file",
      title: path.split("/").at(-1)!,
      from: "",
      date: archiveDate(s, path),
      account: path.split("/").slice(1, -1).join(" / "),
      files: 0,
      phishing: null,
    })
  }
  return json(out.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")))
})

function gmailUrl(thread: string) {
  return `https://mail.google.com/mail/u/0/#all/${thread}`
}

function describe(s: DemoState, raw: string): SourceInfo | null {
  const path = raw.replace(/\/+$/, "")
  if (!isDocumentPath(path) && !path.endsWith("/message.md")) return null
  const mail = s.emails.find(
    (e) => path === e.path || path.startsWith(`${e.path}/`)
  )
  if (mail) {
    const isFile = path !== mail.path && !path.endsWith("/message.md")
    const flagged = s.inbox.find((i) => i.ref === mail.path && i.phishing)
    return {
      path,
      kind: "email",
      title: mail.title,
      from: mail.from,
      date: mail.date,
      account: mail.account,
      link: gmailUrl(mail.thread),
      text: mail.text,
      truncated: false,
      files: isFile
        ? [path, ...mail.files.filter((f) => f !== path)]
        : mail.files,
      phishing: flagged?.phishing ?? null,
      phishingItem: flagged?.id ?? null,
    }
  }
  const item = s.inbox.find(
    (i) => path === `inbox/${i.folder}` || path.startsWith(`inbox/${i.folder}/`)
  )
  if (item) {
    const ref = item.ref && s.emails.find((e) => e.path === item.ref)
    if (ref) return { ...describe(s, ref.path)!, path, kind: "email" }
    const isFile = path !== `inbox/${item.folder}`
    return {
      path,
      kind: "inbox",
      title: item.title,
      from: item.from,
      date: item.received,
      account: item.account,
      link: null,
      text: item.content,
      truncated: false,
      files: isFile
        ? [path, ...item.files.filter((f) => f !== path)]
        : item.files,
      phishing: null,
      phishingItem: null,
    }
  }
  if (s.docs[path])
    return {
      path,
      kind: "file",
      title: path.split("/").at(-1)!,
      from: "",
      date: null,
      account: "",
      link: null,
      text: "",
      truncated: false,
      files: [path],
      phishing: null,
      phishingItem: null,
    }
  const inside = documents(s, [path])
  if (inside.length)
    return {
      path,
      kind: "folder",
      title: path.split("/").at(-1)!,
      from: "",
      date: null,
      account: "",
      link: null,
      text: "",
      truncated: false,
      files: inside,
      phishing: null,
      phishingItem: null,
    }
  return null
}

on("GET", "/api/source", (r) => {
  const info = describe(state(), r.url.searchParams.get("path") ?? "")
  return info ? json(info) : fail("not found", 404)
})

// ---------- activity and jobs ----------

on("GET", "/api/activity", () => {
  const s = state()
  return json({
    runs: s.runs.slice(0, 30),
    commits: s.commits
      .slice(0, 30)
      .map(({ hash, date, subject, files }) => ({
        hash,
        date,
        subject,
        files,
      })),
  })
})
on("GET", "/api/activity/:hash", (_, [hash]) => {
  const c = state().commits.find((x) => x.hash === hash)
  return c ? json({ patch: c.patch }) : fail("not found", 404)
})
on("POST", "/api/activity/:hash/revert", (_, [hash]) => {
  const c = revert(hash)
  if (!c) return fail("nothing to revert", 409)
  return json({ hash: c.hash })
})
on("POST", "/api/jobs/:name", (_, [name]) => {
  const run = trigger(name)
  return run ? json(run) : fail("unknown job", 404)
})
on("GET", "/api/jobs/live", () => json(live()))

// ---------- settings ----------

function nextRun(job: string): string | null {
  const d = new Date()
  if (job === "gmail" || job === "imap" || job === "finance") {
    d.setMinutes(job === "gmail" ? 37 : job === "imap" ? 42 : 4, 0, 0)
    if (d.getTime() < Date.now()) d.setHours(d.getHours() + 1)
    return d.toISOString()
  }
  const at = (h: number, m = 0, days = 0) => {
    const x = new Date()
    x.setDate(x.getDate() + days)
    x.setHours(h, m, 0, 0)
    if (x.getTime() < Date.now()) x.setDate(x.getDate() + 1)
    return x.toISOString()
  }
  if (job === "reminders") return at(8, 30)
  if (job === "backup") return at(3)
  if (job === "digest") return at(8, 0, (8 - new Date().getDay()) % 7)
  return null
}

on("GET", "/api/status", () => {
  const s = state()
  const status: Status = {
    version: "demo",
    auth: "prod",
    claude: true,
    speech: true,
    telegram: { enabled: true, chats: s.telegram.length },
    ntfy: { enabled: false, host: null },
    gmail: s.gmail.accounts.map((a) => ({
      name: a.name,
      connected: a.state === "connected",
    })),
    calendar: calendarSetup().accounts.map((a) => ({ name: a.name, connected: a.state === "connected" })),
    finance: {
      connected: s.financeConnected,
      live: s.financeConnected,
      synced_at: s.financeConnected ? s.mirror.synced_at : null,
    },
    inbox: {
      new: s.inbox.filter((i) => i.status === "new").length,
      failed: s.inbox.filter((i) => i.status === "failed").length,
    },
    jobs: JOBS.filter((j) => j !== "triage").map((job) => ({
      job,
      last: s.runs.find((r) => r.job === job) ?? null,
      next: nextRun(job),
    })),
  }
  return json(status)
})
on("GET", "/api/devices", () => json(state().devices))
on("POST", "/api/devices", (r) => {
  const name = String((r.body as { name?: string })?.name ?? "")
    .trim()
    .slice(0, 60)
  if (!name) return fail("empty name", 400)
  state().devices.push({
    id: hex(8),
    name,
    scope: "ingest",
    created: nowIso(),
    last_seen: null,
  })
  changed()
  return json({ token: `aut_demo_${hex(32)}` })
})
on("DELETE", "/api/devices/:id", (_, [id]) => {
  const s = state()
  s.devices = s.devices.filter((d) => d.id !== id)
  changed()
  return ok()
})
on("GET", "/api/telegram/chats", () => json(state().telegram))
on("POST", "/api/telegram/pair", () =>
  json({
    code: String(100000 + Math.floor(Math.random() * 900000)),
    bot: "autocratico_demo_bot",
  })
)
on("DELETE", "/api/telegram/chats/:id", (_, [id]) => {
  const s = state()
  s.telegram = s.telegram.filter((c) => String(c.id) !== id)
  changed()
  return ok()
})
on("GET", "/api/reminders", () =>
  json(
    state()
      .reminders.filter((r) => !r.sent)
      .sort((a, b) => a.at.localeCompare(b.at))
  )
)
on("DELETE", "/api/reminders/:id", (_, [id]) => {
  const s = state()
  s.reminders = s.reminders.filter((r) => r.id !== id)
  changed("reminders")
  return ok()
})
on("GET", "/api/usage", () => json(state().usage))

// ---------- Gmail ----------

on("GET", "/api/gmail", () => json(state().gmail))
on("PUT", "/api/gmail/client", () => demoOnly())
on("POST", "/api/gmail/accounts", (r) => {
  const b = r.body as { name?: string; query?: string }
  const s = state()
  if (!b?.name || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(b.name))
    return fail("invalid name", 400)
  const existing = s.gmail.accounts.find((a) => a.name === b.name)
  if (existing) existing.query = b.query ?? existing.query
  else
    s.gmail.accounts.push({
      name: b.name,
      query: b.query ?? "",
      state: "disconnected",
      address: null,
    })
  changed()
  return ok()
})
on("DELETE", "/api/gmail/accounts/:name", (_, [name]) => {
  const s = state()
  s.gmail.accounts = s.gmail.accounts.filter(
    (a) => a.name !== decodeURIComponent(name)
  )
  changed()
  return ok()
})
on("POST", "/api/gmail/accounts/:name/authorize", () => demoOnly())
on("POST", "/api/gmail/complete", () => demoOnly())

// ---------- Google Calendar (a made-up account; signing another one in needs a real server) ----------

on("GET", "/api/calendar", (r) => json(calendarAgenda({ from: r.url.searchParams.get("from") ?? undefined, to: r.url.searchParams.get("to") ?? undefined })))
on("GET", "/api/calendar/setup", () => json(calendarSetup()))
on("POST", "/api/calendar/accounts", (r) => {
  const b = r.body as { name?: string; calendars?: string[]; default?: string }
  if (!b?.name || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(b.name)) return fail("invalid name", 400)
  const c = calendar()
  if (b.name === CALENDAR_ACCOUNT) {
    // Which calendars are copied and where new events go: as calendar.toml would say.
    const ids = b.calendars?.length ? b.calendars : c.calendars.filter((x) => x.primary).map((x) => x.id)
    const def = b.default ?? c.calendars.find((x) => x.default)?.id
    c.calendars = c.calendars.map((x) => ({ ...x, synced: ids.includes(x.id), default: x.id === def }))
  } else if (!c.others.includes(b.name)) c.others.push(b.name)
  changed("calendar")
  return ok()
})
on("DELETE", "/api/calendar/accounts/:name", (_, [name]) => {
  const c = calendar()
  if (name === CALENDAR_ACCOUNT) return demoOnly()
  c.others = c.others.filter((n) => n !== name)
  changed("calendar")
  return ok()
})
on("POST", "/api/calendar/accounts/:name/authorize", () => demoOnly())
on("POST", "/api/calendar/complete", () => demoOnly())
on("POST", "/api/calendar/sync", () => {
  const c = calendar()
  c.synced_at = nowIso()
  changed("calendar")
  return json({ accounts: 1, events: c.events.length, errors: [] })
})
on("POST", "/api/calendar/proposals/:id", (r, [id]) => {
  const answer = (r.body as { answer?: string })?.answer
  if (answer !== "add" && answer !== "dismiss") return fail("invalid request", 400)
  const done = answerProposal(id, answer)
  return done ? json(done) : fail("this proposal is no longer open", 409)
})

// ---------- IMAP (no mailbox in the demo: adding one needs a real server) ----------

on("GET", "/api/imap", () => json({ accounts: [] }))
on("POST", "/api/imap/accounts", () => demoOnly())
on("DELETE", "/api/imap/accounts/:name", () => demoOnly())

// ---------- Finance ----------

function financeSetup(s: DemoState): FinanceSetup {
  return {
    connector: s.financeConnected ? "http" : null,
    url: s.financeConnected ? "https://finance.example" : null,
    csv: null,
    connected: s.financeConnected,
    live: s.financeConnected,
    capabilities: s.financeConnected ? { write: true, live: true, recurring: true } : null,
    synced_at: s.financeConnected ? s.mirror.synced_at : null,
    error: null,
    counts: {
      transactions: s.mirror.transactions.length,
      categories: s.mirror.categories.length,
      recurring: s.mirror.recurring.length,
    },
  }
}

on("GET", "/api/finance", () => json(financeSetup(state())))
on("PUT", "/api/finance", () => {
  const s = state()
  s.financeConnected = true
  s.mirror.synced_at = nowIso()
  changed("finance")
  return json(financeSetup(s))
})
on("DELETE", "/api/finance", () => {
  state().financeConnected = false
  changed("finance")
  return ok()
})
on("GET", "/api/finance/data", () => {
  const s = state()
  return json({
    today: today(),
    live: s.financeConnected,
    write: s.financeConnected,
    mirror: s.financeConnected ? s.mirror : null,
    investments: s.investments,
    links: s.links,
    matched: {},
    deadlines: s.deadlines
      .filter((d) => d.finance_category || d.finance_recurring)
      .map((d) => ({
        id: d.id,
        finance_category: d.finance_category,
        finance_recurring: d.finance_recurring,
      })),
  })
})
// No payments to propose in the demo: its transactions are made up after the deadlines.
on("GET", "/api/finance/matches", () => json([]))
on("POST", "/api/finance/matches/:id", () => fail("this proposal is no longer open", 409))
on("POST", "/api/finance/sync", () => {
  const s = state()
  if (!s.financeConnected) return fail("not connected", 409)
  s.mirror.synced_at = nowIso()
  changed("finance")
  return json({ changed: false, transactions: s.mirror.transactions.length })
})
on("POST", "/api/finance/transactions", (r) => {
  const s = state()
  const e = FinanceExpenseInput.safeParse(r.body)
  if (!e.success) return fail("invalid expense", 400)
  if (!s.financeConnected) return fail("not connected", 409)
  const id = `tx-${hex(8)}`
  s.mirror.transactions.push({
    id,
    date: e.data.date,
    amount: e.data.amount,
    description: e.data.description,
    category: e.data.category,
    type: "expense",
    tag: null,
    recurringId: null,
  })
  s.links[e.data.key] = id
  s.mirror.synced_at = nowIso()
  changed("finance")
  return json({ id })
})
on("DELETE", "/api/finance/transactions/:key", (_, [key]) => {
  const s = state()
  const k = decodeURIComponent(key)
  const id = s.links[k]
  if (!id) return fail("not found", 404)
  s.mirror.transactions = s.mirror.transactions.filter((t) => t.id !== id)
  delete s.links[k]
  changed("finance")
  return ok()
})

// ---------- dispatch ----------

export async function handle(req: Req): Promise<Response> {
  for (const [method, re, h] of routes) {
    if (method !== req.method) continue
    const m = re.exec(req.url.pathname)
    if (m) {
      try {
        return await h(req, m.slice(1).map(decodeURIComponent))
      } catch (e) {
        console.error("demo", e)
        return fail((e as Error).message, 500)
      }
    }
  }
  return fail("not found", 404)
}
