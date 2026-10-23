// The public demo's pretend server (src/demo/backend): every answer has the shape the web app expects
// (the zod schemas in @autocratico/core), and its changes, undo and storage behave like the real ones.
import {
  Activity,
  answerWidgets,
  ArchiveEntry,
  Board,
  CalendarAgenda,
  CalendarSetup,
  ChatEvent,
  Data,
  Device,
  FinanceData,
  FinanceSetup,
  GmailPreview,
  GmailSetup,
  ImapSetup,
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
  it("shows why the fake refund is phishing, and lets the visitor say it is not", async () => {
    const inbox = InboxItem.array().parse(await get("/api/inbox"))
    const flagged = inbox.find((i) => i.phishing)!
    expect(flagged.phishing).toMatchObject({ risk: "high", dismissed: "" })
    const source = SourceInfo.parse(await get(`/api/source?path=${encodeURIComponent(flagged.ref)}`))
    expect(source.phishingItem).toBe(flagged.id)
    // The quotes are the email's own words, so the text can mark them.
    for (const s of source.phishing!.signals.filter((x) => x.source === "agent")) expect(`${source.from}\n${source.text}`).toContain(s.evidence)
    expect((await call("POST", `/api/inbox/${flagged.id}/phishing`, { dismissed: true })).status).toBe(200)
    const archive = ArchiveEntry.array().parse(await get("/api/archive"))
    expect(archive.find((a) => a.path === flagged.ref)?.phishing).toEqual({ risk: "high", dismissed: true })
    expect((await call("POST", `/api/inbox/${inbox.find((i) => !i.phishing)!.id}/phishing`, { dismissed: true })).status).toBe(400)
  })

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
    expect(Board.parse(await get("/api/board")).widgets.length).toBeGreaterThan(0)
    GmailSetup.parse(await get("/api/gmail"))
    expect(CalendarSetup.parse(await get("/api/calendar/setup")).accounts[0].state).toBe("connected")
    const agenda = CalendarAgenda.parse(await get("/api/calendar"))
    expect(agenda.events.length).toBeGreaterThan(5)
    expect(agenda.proposals.length).toBe(1)
    ImapSetup.parse(await get("/api/imap"))
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

  it("adds, moves and deletes Google Calendar events from the chat, and adds a proposed appointment", async () => {
    const said = (events: ChatEvent[]) => events.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("")
    const before = state().calendar!.events.length
    const added = said(await ask("Metti in calendario la visita dal dentista giovedì alle 15", null))
    expect(added).toMatch(/📅 Aggiunto a Google Calendar: Visita dal dentista — .+, 15:00–16:00/)
    const event = state().calendar!.events.find((e) => e.title === "Visita dal dentista")!
    expect(event).toMatchObject({ important: true, ours: true, reminders: [{ method: "popup", minutes: 1440 }, { method: "popup", minutes: 60 }] })
    expect(state().calendar!.events.length).toBe(before + 1)

    const first = await ask("Sposta la visita dal dentista a venerdì alle 17", null)
    const chat = (first[0] as { id: string }).id
    expect(said(first)).toContain("```confirm")
    expect(said(await ask("Sì", chat))).toMatch(/📅 Evento aggiornato: Visita dal dentista — .+, 17:00–18:00/)

    const del = await ask("Cancella la visita dal dentista", null)
    expect(said(await ask("Sì", (del[0] as { id: string }).id))).toMatch(/📅 Evento eliminato: Visita dal dentista/)
    expect(state().calendar!.events.some((e) => e.title === "Visita dal dentista")).toBe(false)

    const [p] = CalendarAgenda.parse(await get("/api/calendar")).proposals
    expect((await call("POST", `/api/calendar/proposals/${p.id}`, { answer: "add" })).status).toBe(200)
    expect(CalendarAgenda.parse(await get("/api/calendar")).proposals).toEqual([])
    expect(state().calendar!.events.some((e) => e.title === p.title && e.deadline === "passaporto")).toBe(true)
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

  it("proposes a widget in the chat, adds it to the Board as a commit, and Activity undoes it", async () => {
    const events = await ask("Fammi un widget con i pagamenti per area", null)
    const said = events.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("")
    const [proposed] = answerWidgets(said)
    expect(proposed.id).toBe("pagamenti-per-area")
    const before = Board.parse(await get("/api/board")).widgets.length
    const put = await call("PUT", `/api/board/widgets/${proposed.id}`, proposed)
    expect(put.status).toBe(200)
    expect(Board.parse(await get("/api/board")).widgets.map((w) => w.id)).toContain(proposed.id)
    expect((await call("PUT", "/api/board/widgets/x", { ...proposed, id: "x", spec: { root: "a", elements: { a: { type: "Html" } } } })).status).toBe(400)
    const { commits } = Activity.parse(await get("/api/activity"))
    expect(commits[0].subject).toBe(`Board: add ${proposed.id}`)
    expect(commits[0].files).toEqual(["board.json"])
    await call("POST", `/api/activity/${commits[0].hash}/revert`)
    expect(Board.parse(await get("/api/board")).widgets).toHaveLength(before)
  })

  it("asks before custom mode, then proposes sandboxed code that passes the checks", async () => {
    const first = await ask("Fammi una mappa di calore dei pagamenti", null)
    const chat = (first[0] as { id: string }).id
    const asked = first.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("")
    expect(answerWidgets(asked)).toEqual([])
    expect(asked).toContain("```confirm")
    const yes = await ask("Sì, confermo", chat)
    const [w] = answerWidgets(yes.flatMap((e) => (e.type === "text" ? [e.text] : [])).join(""))
    expect(w.kind).toBe("custom")
    expect((await call("PUT", `/api/board/widgets/${w.id}`, w)).status).toBe(200)
  })

  it("takes files attached in the chat and answers about them", async () => {
    const form = new FormData()
    form.append("file", new File([new Uint8Array([1, 2, 3])], "bolletta.png", { type: "image/png" }))
    const r = await handle({ method: "POST", url: new URL("/api/chat/files", "https://demo.invalid"), body: null, form, signal: new AbortController().signal })
    const [saved] = (await r.json()) as { path: string; image: boolean }[]
    expect(saved.path).toMatch(/^chats\/files\/.+\/bolletta\.png$/)
    expect(saved.image).toBe(true)
    const res = await call("POST", "/api/chat", { message: "", files: [saved.path], chat: null, locale: "it" })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const text = res.body as string
    const events = text.trim().split("\n").map((l) => ChatEvent.parse(JSON.parse(l)))
    expect(events.some((e) => e.type === "tool" && e.detail === saved.path)).toBe(true)
    expect(state().chats[0].messages[0]).toMatchObject({ text: "(allegati)", files: [saved.path] })
  })

  it("keeps the register for the tab, and forgets it on reset", () => {
    expect(JSON.parse(sessionStorage.getItem("autocratico.demo")!).name).toBe(state().name)
    reset()
    expect(sessionStorage.getItem("autocratico.demo")).toBeNull()
    expect(load()).toBeNull()
  })
})
