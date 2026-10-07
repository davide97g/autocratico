import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { addDays, type FinanceData, type FinanceSetup, type PaymentMatch, today } from "@autocratico/core"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Account } from "../src/account.ts"
import { createApp } from "../src/app.ts"
import { loadConfig } from "../src/config.ts"
import { Finance } from "../src/finance.ts"
import { services } from "../src/services.ts"
import { LOCAL, owner, setup } from "./helpers.ts"

const URL_ = "http://finance-api:3000"
const TOKEN = "fin_abcdefghijklmnopqrstuvwxyz0123456789ABCD"

type Row = Record<string, unknown>

/** A finance server speaking the http contract: REST over in-memory rows and a change feed the test pushes events into. */
function fakeFinance() {
  const db = {
    transactions: [
      { id: "t1", date: "2026-09-02", month: "September", year: "2026", amount: 42.5, description: "Groceries", category: "food", type: "expense" },
      { id: "t2", date: "2026-09-27", month: "September", year: "2026", amount: 2000, description: "Salary", category: "salary", type: "earning", tag: "job" },
    ] as Row[],
    categories: [
      { id: "food", name: "Food", type: "expense", color: "#f00", excludeFromBudget: false },
      { id: "salary", name: "Salary", type: "earning", excludeFromBudget: false },
    ] as Row[],
    tags: [{ id: "job", name: "Job" }] as Row[],
    recurring: [{ id: "rent", description: "Rent", amount: 700, category: "food", type: "expense", dayOfMonth: 5, active: true, lastPeriod: "2026-09", createdAt: 1 }] as Row[],
  }
  const calls: { method: string; path: string; body: unknown; auth: string | null }[] = []
  let feed: ReadableStreamDefaultController<string> | null = null
  const push = (event: string, data: unknown) => feed?.enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  let n = 0

  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? "GET"
    const auth = new Headers(init?.headers).get("authorization")
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null
    calls.push({ method, path: url.pathname + url.search, body, auth })
    if (!url.href.startsWith(URL_)) throw new TypeError("fetch failed")
    if (auth !== `Bearer ${TOKEN}`) return Response.json({ error: "unauthorized" }, { status: 401 })
    if (url.pathname === "/api/events") {
      const stream = new ReadableStream<string>({
        start(c) {
          feed = c
          c.enqueue("event: ready\ndata: {}\n\n")
        },
      })
      init?.signal?.addEventListener("abort", () => feed?.error(new Error("aborted")))
      return new Response(stream.pipeThrough(new TextEncoderStream()), { headers: { "content-type": "text/event-stream" } })
    }
    const [, , collection, id] = url.pathname.split("/")
    const rows = db[collection as keyof typeof db]
    if (!rows) return Response.json({ error: "not found" }, { status: 404 })
    if (method === "GET") {
      const from = url.searchParams.get("from")
      return Response.json(from ? rows.filter((r) => String(r.date) >= from) : rows)
    }
    if (method === "POST") {
      const row = { id: `new${++n}`, ...body }
      rows.push(row)
      return Response.json(row, { status: 201 })
    }
    if (method === "DELETE") {
      const i = rows.findIndex((r) => r.id === id)
      if (i < 0) return Response.json({ error: "not found" }, { status: 404 })
      rows.splice(i, 1)
      return Response.json({ ok: true })
    }
    return Response.json({ error: "no" }, { status: 405 })
  }) as typeof fetch
  return { fetcher, calls, db, push }
}

function withFinance() {
  const fake = fakeFinance()
  const { data } = setup()
  const config = loadConfig({ data, jobs: false, telegramToken: null, claude: null })
  const finance = new Finance(data, { fetcher: fake.fetcher, debounceMs: 10 })
  const s = services(config, { jobs: null, telegram: null, verifyAccess: null, account: new Account(config, ":memory:"), finance })
  return { app: createApp(s), s, data, fake, finance }
}

async function json<T>(r: Response | Promise<Response>): Promise<T> {
  return (await (await r).json()) as T
}

const put = (app: ReturnType<typeof createApp>, h: Record<string, string>, body: unknown) =>
  app.request("/api/finance", { method: "PUT", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify(body) })

let stop: (() => void) | null = null
afterEach(() => {
  stop?.()
  stop = null
})

describe("Finance: http connector", () => {
  it("needs the owner's session", async () => {
    const { app } = withFinance()
    expect((await app.request("/api/finance", { headers: LOCAL })).status).toBe(401)
  })

  it("checks the token, keeps it private and syncs everything", async () => {
    const { app, data, fake } = withFinance()
    const h = await owner(app)
    expect((await put(app, h, { url: URL_, token: "fin_wrongwrongwrongwrongwrong" })).status).toBe(400)
    expect((await put(app, h, { url: "ftp://x", token: TOKEN })).status).toBe(400)

    const r = await put(app, h, { connector: "http", url: `${URL_}/`, token: TOKEN })
    expect(r.status).toBe(200)
    const setupInfo = (await r.json()) as FinanceSetup
    expect(setupInfo).toMatchObject({
      connector: "http",
      url: URL_,
      connected: true,
      capabilities: { write: true, live: true, recurring: true },
      counts: { transactions: 2, categories: 2, recurring: 1 },
    })
    expect(JSON.stringify(setupInfo)).not.toContain(TOKEN)
    expect(JSON.stringify(await json(app.request("/api/status", { headers: h })))).not.toContain(TOKEN)

    const secret = join(data, "secrets", "finance.json")
    expect(statSync(secret).mode & 0o777).toBe(0o600)
    expect(readFileSync(join(data, "finance.toml"), "utf8")).not.toContain(TOKEN)
    expect(fake.calls.every((c) => !c.path.includes(TOKEN))).toBe(true)

    const d = await json<FinanceData>(app.request("/api/finance/data", { headers: h }))
    expect(d.mirror?.transactions[1]).toEqual({ id: "t2", date: "2026-09-27", amount: 2000, description: "Salary", category: "salary", type: "earning", tag: "job", recurringId: null })
    expect(d.mirror?.categories[1].color).toBeNull()
    expect(d.investments.length).toBeGreaterThan(0) // example/investments.toml
    const summary = readFileSync(join(data, "finance", "summary.md"), "utf8")
    expect(summary).toContain("||€ 42.50||")
    expect(summary).toContain("Rent")
  })

  it("follows the change feed and tells the open web app", async () => {
    const { app, fake, finance } = withFinance()
    const h = await owner(app)
    await put(app, h, { url: URL_, token: TOKEN })
    finance.listen()
    stop = () => finance.stop()
    await vi.waitFor(() => expect(finance.live).toBe(true))

    const events = await app.request("/api/events", { headers: h })
    expect(events.headers.get("content-type")).toContain("text/event-stream")
    const reader = events.body!.pipeThrough(new TextDecoderStream()).getReader()
    expect((await reader.read()).value).toContain("event: ready")

    fake.db.transactions.push({ id: "t3", date: "2026-10-01", month: "October", year: "2026", amount: 9.99, description: "Music", category: "food", type: "expense" })
    fake.push("change", { collection: "groceries", action: "create", at: 1 })
    fake.push("change", { collection: "transactions", action: "create", at: 2 })
    const next = await reader.read()
    expect(next.value).toContain("event: finance")
    await reader.cancel()

    expect(finance.mirror()?.transactions.map((t) => t.id)).toEqual(["t1", "t2", "t3"])
    // A change re-reads recent months only.
    expect(fake.calls.some((c) => /\/api\/transactions\?from=\d{4}-\d{2}-01$/.test(c.path))).toBe(true)
  })

  it("records a paid occurrence as an expense, once, and can delete it", async () => {
    const { app, fake } = withFinance()
    const h = await owner(app)
    await put(app, h, { url: URL_, token: TOKEN })
    const expense = { key: "car-tax@2026-11-30", date: "2026-11-28", amount: 210.4, category: "food", description: "Car tax" }
    const send = () => app.request("/api/finance/transactions", { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify(expense) })

    const r = await send()
    expect(r.status).toBe(200)
    const { id } = (await r.json()) as { id: string }
    const posted = fake.calls.find((c) => c.method === "POST")!
    expect(posted.body).toEqual({ date: "2026-11-28", month: "November", year: "2026", amount: 210.4, description: "Car tax", category: "food", type: "expense" })
    expect((await json<FinanceData>(app.request("/api/finance/data", { headers: h }))).links).toEqual({ [expense.key]: id })
    expect((await send()).status).toBe(409)

    const del = await app.request(`/api/finance/transactions/${encodeURIComponent(expense.key)}`, { method: "DELETE", headers: h })
    expect(await del.json()).toEqual({ ok: true })
    expect(fake.db.transactions.some((t) => t.id === id)).toBe(false)
    expect((await json<FinanceData>(app.request("/api/finance/data", { headers: h }))).links).toEqual({})
  })

  it("reads a finance.toml written before connectors (only `url`)", async () => {
    const { app, data } = withFinance()
    const h = await owner(app)
    writeFileSync(join(data, "finance.toml"), `url = "${URL_}"\n`)
    mkdirSync(join(data, "secrets"), { recursive: true })
    writeFileSync(join(data, "secrets", "finance.json"), JSON.stringify({ token: TOKEN }))
    expect(await json<FinanceSetup>(app.request("/api/finance", { headers: h }))).toMatchObject({ connector: "http", url: URL_, connected: true })
    expect(await json(app.request("/api/finance/sync", { method: "POST", headers: h }))).toEqual({ changed: true, transactions: 2 })
  })

  it("forgets the token and the mirror when disconnected", async () => {
    const { app, data } = withFinance()
    const h = await owner(app)
    await put(app, h, { url: URL_, token: TOKEN })
    expect((await app.request("/api/finance", { method: "DELETE", headers: h })).status).toBe(200)
    const s = await json<FinanceSetup>(app.request("/api/finance", { headers: h }))
    expect(s).toMatchObject({ connector: null, url: null, connected: false, synced_at: null })
    expect(() => statSync(join(data, "secrets", "finance.json"))).toThrow()
    expect((await app.request("/api/finance/sync", { method: "POST", headers: h })).status).toBe(400)
  })
})

describe("Payments found in the finance source", () => {
  it("proposes them, marks the occurrence paid on a yes and never proposes a dismissed pair again", async () => {
    const { app, s, data, fake } = withFinance()
    const h = await owner(app)
    const day = (n: number) => addDays(today("Europe/Rome"), n)
    const file = join(data, "deadlines.toml")
    writeFileSync(
      file,
      `${readFileSync(file, "utf8")}\n[[deadline]]\nid = "water-bill"\ntitle = "Water bill Acque"\narea = "home"\ndate = ${day(-3)}\namount = 55.20\n\n[[deadline]]\nid = "gym"\ntitle = "Gym membership"\narea = "health"\ndate = ${day(-1)}\namount = 30.00\n`
    )
    fake.db.transactions.push(
      { id: "w1", date: day(-2), amount: 55.2, description: "SEPA Acque Example", category: "food", type: "expense" },
      { id: "g1", date: day(-1), amount: 30, description: "Pizza", category: "food", type: "expense" }
    )
    await put(app, h, { url: URL_, token: TOKEN })
    const found = await s.matches.scan()
    expect(found.map((m) => [m.key, m.transaction.id])).toEqual([
      [`water-bill@${day(-3)}`, "w1"],
      [`gym@${day(-1)}`, "g1"], // same amount, same day: proposed, the user says no
    ])
    expect(await s.matches.scan()).toEqual([]) // already proposed
    const open = await json<PaymentMatch[]>(app.request("/api/finance/matches", { headers: h }))
    expect(open).toHaveLength(2)

    const answer = (id: string, a: string) => app.request(`/api/finance/matches/${id}`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ answer: a }) })
    expect((await answer(open[0].id, "paid")).status).toBe(200)
    expect((await answer(open[0].id, "paid")).status).toBe(409)
    expect((await answer(open[1].id, "dismiss")).status).toBe(200)
    expect((await answer("zz", "paid")).status).toBe(400)

    expect(JSON.parse(readFileSync(join(data, "state.json"), "utf8")).done[`water-bill@${day(-3)}`]).toBe(day(0))
    expect((await json<FinanceData>(app.request("/api/finance/data", { headers: h }))).matched).toEqual({ [`water-bill@${day(-3)}`]: "w1" })
    expect(await s.matches.scan()).toEqual([])
    expect(await json(app.request("/api/finance/matches", { headers: h }))).toEqual([])
  })
})
