// The public demo's pretend server (src/demo/backend): every answer has the shape the web app expects
// (the zod schemas in @autocratico/core), and its changes, undo and storage behave like the real ones.
import {
  Activity,
  ArchiveEntry,
  ChatEvent,
  Data,
  Device,
  FinanceData,
  FinanceSetup,
  GmailPreview,
  GmailSetup,
  InboxDetail,
  InboxItem,
  LiveJobs,
  parseDeadlines,
  Reminder,
  Session,
  SourceInfo,
  Status,
  Usage,
} from "@autocratico/core"
import { beforeEach, describe, expect, it } from "vitest"

// The demo runs in a browser tab: give it the few browser things it uses.
class MemoryStorage {
  #m = new Map<string, string>()
  getItem(k: string) {
    return this.#m.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.#m.set(k, String(v))
  }
  removeItem(k: string) {
    this.#m.delete(k)
  }
  clear() {
    this.#m.clear()
  }
}
const g = globalThis as Record<string, unknown>
g.window = globalThis
g.sessionStorage = new MemoryStorage()
g.localStorage = new MemoryStorage()
// Reduced motion: the pretend server and the chat skip their pauses.
g.matchMedia = () => ({ matches: true })

const { handle } = await import("../src/demo/backend/router")
const { seed } = await import("../src/demo/backend/seed")
const { load, reset, start, state } = await import("../src/demo/backend/state")
const { deadlineToml } = await import("../src/demo/backend/toml")

async function call(method: string, path: string, body?: unknown) {
  const r = await handle({ method, url: new URL(path, "https://demo.invalid"), body: body ?? null, form: null, signal: new AbortController().signal })
  return { status: r.status, body: r.headers.get("content-type")?.startsWith("application/json") ? await r.json() : await r.text() }
}
const get = async (path: string) => (await call("GET", path)).body

beforeEach(() => {
  reset()
  start(seed("Maria Rossi"))
})

describe("demo server", () => {
  it("answers every view with the real shapes", async () => {
    Session.parse(await get("/api/session"))
    const data = Data.parse(await get("/api/data"))
    expect(data.agenda.length).toBeGreaterThan(30)
    expect(data.cases.length).toBe(4)
    expect(data.incomplete.map((i) => i.id).sort()).toEqual(["passaporto", "tari"])
    const inbox = InboxItem.array().parse(await get("/api/inbox"))
    InboxDetail.parse(await get(`/api/inbox/${inbox[0].id}`))
    const archive = ArchiveEntry.array().parse(await get("/api/archive"))
    for (const a of archive) SourceInfo.parse(await get(`/api/source?path=${encodeURIComponent(a.path)}`))
    for (const c of data.cases) for (const doc of c.documents) SourceInfo.parse(await get(`/api/source?path=${encodeURIComponent(doc)}`))
    Activity.parse(await get("/api/activity"))
    LiveJobs.parse(await get("/api/jobs/live"))
    Status.parse(await get("/api/status"))
    Device.array().parse(await get("/api/devices"))
    Reminder.array().parse(await get("/api/reminders"))
    Usage.parse(await get("/api/usage"))
    GmailSetup.parse(await get("/api/gmail"))
    FinanceSetup.parse(await get("/api/finance"))
    const finance = FinanceData.parse(await get("/api/finance/data"))
    // The Finance view takes the first transaction as the oldest.
    const dates = finance.mirror!.transactions.map((t) => t.date)
    expect(dates).toEqual([...dates].sort())
    GmailPreview.parse(await get(`/api/gmail/preview?link=${encodeURIComponent("https://mail.google.com/mail/u/0/#inbox/FMfcgzQbdTnVcxKpWwBCDFGH")}`))
    expect((await call("GET", "/api/nothing")).status).toBe(404)
  })

  it("writes deadlines.toml blocks the real parser reads back", () => {
    const deadlines = state().deadlines
    expect(parseDeadlines(deadlines.map(deadlineToml).join("\n"))).toEqual(deadlines)
  })

  it("marks occurrences done and not done", async () => {
    const o = Data.parse(await get("/api/data")).agenda.find((x) => !x.done_on && x.days > 0)!
    expect((await call("POST", "/api/done", { key: o.key, done: true })).body.done_on).not.toBeNull()
    expect(Data.parse(await get("/api/data")).agenda.find((x) => x.key === o.key)!.done_on).not.toBeNull()
    await call("POST", "/api/done", { key: o.key, done: false })
    expect(Data.parse(await get("/api/data")).agenda.find((x) => x.key === o.key)!.done_on).toBeNull()
    expect((await call("POST", "/api/done", { key: "nope@2026-01-01", done: true })).status).toBe(404)
  })

  async function ask(message: string, chat: string | null) {
    const text = (await call("POST", "/api/chat", { message, chat, locale: "it", view: "Panoramica" })).body as string
    return text.trim().split("\n").map((l) => ChatEvent.parse(JSON.parse(l)))
  }

  it("asks before a change, applies it on yes, and Activity undoes it", async () => {
    const first = await ask("Segna pagata la rata del condominio", null)
    const chat = (first[0] as { id: string }).id
    expect(first.some((e) => e.type === "tool")).toBe(true)
    expect(first.at(-1)?.type).toBe("end")
    const key = Data.parse(await get("/api/data")).agenda.find((o) => o.id === "condominio" && !o.done_on && o.days >= 0)!.key

    const yes = await ask("Sì, confermo", chat)
    const said = yes.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("")
    expect(said).toMatch(/✏️ Registro aggiornato: .+ \(modifica [0-9a-f]{7}, annullabile da Attività\)/)
    expect(state().done[key]).toBeDefined()

    const { commits } = Activity.parse(await get("/api/activity"))
    expect(commits[0].subject).toMatch(/^Chat: /)
    expect(((await get(`/api/activity/${commits[0].hash}`)) as { patch: string }).patch).toContain(`+    "${key}"`)
    await call("POST", `/api/activity/${commits[0].hash}/revert`)
    expect(state().done[key]).toBeUndefined()
  })

  it("files the TARI notice from a Gmail link, with a reminder", async () => {
    const first = await ask("Questa? https://mail.google.com/mail/u/0/#inbox/FMfcgzQbdTnVcxKpWwBCDFGH", null)
    expect(first.some((e) => e.type === "tool" && e.name === "Gmail")).toBe(true)
    await ask("Sì", (first[0] as { id: string }).id)
    const data = Data.parse(await get("/api/data"))
    expect(data.agenda.filter((o) => /^tari-\d{4}-[12]$/.test(o.id))).toHaveLength(2)
    expect(data.incomplete.map((i) => i.id)).toEqual(["passaporto"])
    expect(Reminder.array().parse(await get("/api/reminders")).some((r) => r.text.startsWith("TARI"))).toBe(true)
  })

  it("keeps the register for the tab, and forgets it on reset", () => {
    expect(JSON.parse(sessionStorage.getItem("autocratico.demo")!).name).toBe(state().name)
    reset()
    expect(sessionStorage.getItem("autocratico.demo")).toBeNull()
    expect(load()).toBeNull()
  })
})
