/**
 * The finance app (expenses and earnings, its own server and database) mirrored into the data folder:
 * its address in finance.toml, an API token in secrets/finance.json, the synced data in
 * finance/mirror.json with a Markdown summary for the agents next to it.
 *
 * Kept in sync three ways: the finance app's change feed (SSE, edits show up within seconds), an
 * hourly full sync (the `finance` job) and a sync after every write from here. Paid occurrences can be
 * recorded there as expenses; finance/links.json remembers which transaction each one became.
 *
 * Security-sensitive: the token stays in data/secrets (0700/0600) and is never sent to the browser.
 * Responses from the finance app are data: parsed into fixed shapes, nothing else is kept.
 */
import { createHash } from "node:crypto"
import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"

import {
  addDays,
  addMonths,
  byCategory,
  type FinanceCategory,
  type FinanceConnectInput,
  type FinanceData,
  type FinanceExpenseInput,
  FinanceMirror,
  type FinanceRecurring,
  type FinanceSetup,
  type FinanceTag,
  type FinanceTransaction,
  parseInvestments,
  parseToml,
  today as todayIn,
  trend,
} from "@autocratico/core"
import { loadDeadlines } from "@autocratico/core/node"
import { stringify } from "smol-toml"

import { locks, readJson, writeAtomic, writeJson, writeSecret } from "./files.ts"

type Fetch = typeof fetch
type Raw = Record<string, unknown>
export type SyncResult = { changed: boolean; transactions: number }

const HEADER = `# Connection to the finance app (expenses and earnings). Managed from Settings in the web app.
# The API token is in secrets/finance.json.
`
/** Collections of the finance app's change feed that the mirror holds. */
const WATCHED = new Set(["transactions", "categories", "tags", "recurring"])
/** A change re-reads transactions from this many months back; the hourly sync re-reads them all. */
const RECENT_MONTHS = 3
const REQUEST_TIMEOUT_MS = 20_000
/** The finance app pings every 25 s: silence for longer means the stream is dead. */
const STREAM_SILENCE_MS = 75_000
const RETRY_MIN_MS = 5_000
const RETRY_MAX_MS = 5 * 60_000
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

export class FinanceError extends Error {
  readonly status: 400 | 404 | 409 | 502

  constructor(status: 400 | 404 | 409 | 502, message: string) {
    super(message)
    this.status = status
  }
}

const text = (v: unknown) => (typeof v === "string" ? v : "")
const optional = (v: unknown) => (typeof v === "string" && v ? v : null)
const amount = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0)
const kind = (v: unknown) => (v === "earning" ? "earning" : "expense")

function toTransaction(r: Raw): FinanceTransaction | null {
  if (typeof r?.id !== "string" || typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return null
  return { id: r.id, date: r.date, amount: amount(r.amount), description: text(r.description), category: text(r.category), type: kind(r.type), tag: optional(r.tag), recurringId: optional(r.recurringId) }
}
function toCategory(r: Raw): FinanceCategory | null {
  if (typeof r?.id !== "string") return null
  return { id: r.id, name: text(r.name), type: kind(r.type), color: optional(r.color), excludeFromBudget: r.excludeFromBudget === true }
}
function toTag(r: Raw): FinanceTag | null {
  return typeof r?.id === "string" ? { id: r.id, name: text(r.name), color: optional(r.color) } : null
}
function toRecurring(r: Raw): FinanceRecurring | null {
  if (typeof r?.id !== "string") return null
  return {
    id: r.id,
    description: text(r.description),
    amount: amount(r.amount),
    category: text(r.category),
    type: kind(r.type),
    tag: optional(r.tag),
    dayOfMonth: Math.trunc(amount(r.dayOfMonth)) || 1,
    active: r.active !== false,
    lastPeriod: text(r.lastPeriod),
  }
}
function rows<T>(value: unknown, map: (r: Raw) => T | null): T[] {
  if (!Array.isArray(value)) throw new FinanceError(502, "finance app: unexpected answer")
  return value.flatMap((r) => {
    const x = map(r as Raw)
    return x ? [x] : []
  })
}

/** Content without the sync time: a change of this means the data changed. */
function fingerprint(m: Omit<FinanceMirror, "synced_at">): string {
  const byId = <T extends { id: string }>(list: T[]) => [...list].sort((a, b) => (a.id < b.id ? -1 : 1))
  const sorted = { t: byId(m.transactions), c: byId(m.categories), g: byId(m.tags), r: byId(m.recurring) }
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex")
}

export class Finance {
  readonly #data: string
  readonly #fetch: Fetch
  readonly #timeZone: string
  readonly #debounceMs: number
  readonly #listeners = new Set<(rev: number) => void>()
  #rev = 0
  #live = false
  #error: string | null = null
  #listening = false
  #stream: AbortController | null = null
  #retryMs = RETRY_MIN_MS
  #retryTimer: NodeJS.Timeout | null = null
  #syncTimer: NodeJS.Timeout | null = null
  /** Scope of the sync waiting in #syncTimer: "full" wins over "recent". */
  #pending: "full" | "recent" | null = null

  constructor(data: string, options: { fetcher?: Fetch; timeZone?: string; debounceMs?: number } = {}) {
    this.#data = data
    this.#fetch = options.fetcher ?? fetch
    this.#timeZone = options.timeZone ?? "Europe/Rome"
    this.#debounceMs = options.debounceMs ?? 1_000
  }

  get #config() {
    return join(this.#data, "finance.toml")
  }
  get #secret() {
    return join(this.#data, "secrets", "finance.json")
  }
  get #dir() {
    return join(this.#data, "finance")
  }
  get #mirrorFile() {
    return join(this.#dir, "mirror.json")
  }
  get #linksFile() {
    return join(this.#dir, "links.json")
  }
  get #investments() {
    return join(this.#data, "investments.toml")
  }

  // ---------- reading ----------

  #url(): string | null {
    if (!existsSync(this.#config)) return null
    try {
      const url = parseToml(readFileSync(this.#config, "utf8"), "finance.toml").url
      return typeof url === "string" && /^https?:\/\//.test(url) ? url.replace(/\/+$/, "") : null
    } catch {
      return null
    }
  }

  #token(): string | null {
    const t = readJson<{ token?: unknown } | null>(this.#secret, null)?.token
    return typeof t === "string" ? t : null
  }

  configured(): boolean {
    return this.#url() !== null && this.#token() !== null
  }

  get live(): boolean {
    return this.#live
  }

  get rev(): number {
    return this.#rev
  }

  mirror(): FinanceMirror | null {
    if (!existsSync(this.#mirrorFile)) return null
    const parsed = FinanceMirror.safeParse(readJson<unknown>(this.#mirrorFile, null))
    return parsed.success ? parsed.data : null
  }

  links(): Record<string, string> {
    return readJson<Record<string, string>>(this.#linksFile, {})
  }

  setup(): FinanceSetup {
    const m = this.mirror()
    return {
      url: this.#url(),
      connected: this.configured(),
      live: this.#live,
      synced_at: m?.synced_at ?? null,
      error: this.#error,
      counts: { transactions: m?.transactions.length ?? 0, categories: m?.categories.length ?? 0, recurring: m?.recurring.length ?? 0 },
    }
  }

  /** Everything the Finance view needs. */
  data(): FinanceData {
    let investments: FinanceData["investments"] = []
    if (existsSync(this.#investments)) {
      try {
        investments = parseInvestments(readFileSync(this.#investments, "utf8")).snapshots
      } catch {
        investments = [] // malformed file: the agent's next edit fixes it, the view shows none meanwhile
      }
    }
    let deadlines: FinanceData["deadlines"] = []
    try {
      deadlines = loadDeadlines(this.#data)
        .filter((d) => d.finance_category || d.finance_recurring)
        .map((d) => ({ id: d.id, finance_category: d.finance_category, finance_recurring: d.finance_recurring }))
    } catch {
      deadlines = []
    }
    return { today: todayIn(this.#timeZone), live: this.#live, mirror: this.mirror(), investments, links: this.links(), deadlines }
  }

  /** Called with the new revision whenever the mirror changes. */
  onChange(listener: (rev: number) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  // ---------- connection ----------

  /** Checks the address and token against the finance app, saves them, syncs everything. */
  async connect(input: FinanceConnectInput): Promise<FinanceSetup> {
    const url = input.url.replace(/\/+$/, "")
    const token = input.token ?? this.#token()
    if (!token) throw new FinanceError(400, "paste the API token created in the finance app")
    await this.#get(url, token, "/api/categories")
    await locks.run(this.#config, () => writeAtomic(this.#config, `${HEADER}\n${stringify({ url })}\n`))
    writeSecret(this.#secret, { token })
    this.#error = null
    await this.sync("full")
    if (this.#listening) this.#reconnect(0)
    return this.setup()
  }

  /** Forgets the token and the synced data; investments.toml is the register's own and stays. */
  async disconnect(): Promise<void> {
    this.#closeStream()
    await locks.run(this.#config, () => {
      rmSync(this.#secret, { force: true })
      rmSync(this.#config, { force: true })
      rmSync(this.#mirrorFile, { force: true })
      rmSync(join(this.#dir, "summary.md"), { force: true })
    })
    this.#error = null
    this.#bump()
  }

  // ---------- sync ----------

  /** Re-reads the finance app: every transaction ("full") or the last few months ("recent"). */
  sync(scope: "full" | "recent" = "full"): Promise<SyncResult> {
    return locks.run("finance-sync", async () => {
      const url = this.#url()
      const token = this.#token()
      if (!url || !token) throw new FinanceError(400, "finance app not connected")
      const before = this.mirror()
      const from = scope === "recent" && before ? `${addMonths(todayIn(this.#timeZone), -RECENT_MONTHS).slice(0, 7)}-01` : null
      try {
        const [fresh, categories, tags, recurring] = await Promise.all([
          this.#get(url, token, from ? `/api/transactions?from=${from}` : "/api/transactions").then((v) => rows(v, toTransaction)),
          this.#get(url, token, "/api/categories").then((v) => rows(v, toCategory)),
          this.#get(url, token, "/api/tags").then((v) => rows(v, toTag)),
          this.#get(url, token, "/api/recurring").then((v) => rows(v, toRecurring)),
        ])
        const transactions = from ? [...before!.transactions.filter((t) => t.date < from), ...fresh] : fresh
        transactions.sort((a, b) => a.date.localeCompare(b.date) || (a.id < b.id ? -1 : 1))
        const next = { transactions, categories, tags, recurring }
        const changed = !before || fingerprint(before) !== fingerprint(next)
        const mirror: FinanceMirror = { synced_at: new Date().toISOString(), ...next }
        writeJson(this.#mirrorFile, mirror)
        writeAtomic(join(this.#dir, "summary.md"), summary(mirror, todayIn(this.#timeZone)))
        this.#error = null
        if (changed) this.#bump()
        return { changed, transactions: transactions.length }
      } catch (e) {
        this.#error = (e as Error).message
        throw e
      }
    })
  }

  /** Several changes in a row become one sync, a little later. */
  #scheduleSync(scope: "full" | "recent") {
    this.#pending = this.#pending === "full" || scope === "full" ? "full" : "recent"
    if (this.#syncTimer) clearTimeout(this.#syncTimer)
    this.#syncTimer = setTimeout(() => {
      const s = this.#pending ?? "recent"
      this.#pending = null
      this.#syncTimer = null
      this.sync(s).catch((e: Error) => console.error(`finance: ${e.message}`))
    }, this.#debounceMs)
  }

  #bump() {
    this.#rev += 1
    for (const l of this.#listeners) {
      try {
        l(this.#rev)
      } catch {
        // a closed browser stream must not stop the others
      }
    }
  }

  // ---------- writing ----------

  /** Records a paid occurrence as an expense in the finance app. */
  addExpense(input: FinanceExpenseInput): Promise<{ id: string }> {
    return locks.run(this.#linksFile, async () => {
      const url = this.#url()
      const token = this.#token()
      if (!url || !token) throw new FinanceError(400, "finance app not connected")
      if (this.links()[input.key]) throw new FinanceError(409, "already recorded in the finance app")
      const [year, month] = input.date.split("-")
      const created = (await this.#send(url, token, "POST", "/api/transactions", {
        date: input.date,
        month: MONTHS[Number(month) - 1],
        year,
        amount: input.amount,
        description: input.description,
        category: input.category,
        type: "expense",
      })) as Raw
      if (typeof created?.id !== "string") throw new FinanceError(502, "finance app: unexpected answer")
      writeJson(this.#linksFile, { ...this.links(), [input.key]: created.id })
      this.#scheduleSync("recent")
      return { id: created.id }
    })
  }

  /** Deletes the expense recorded for an occurrence (it was marked done by mistake). */
  removeExpense(key: string): Promise<boolean> {
    return locks.run(this.#linksFile, async () => {
      const links = this.links()
      const id = links[key]
      if (!id) return false
      const url = this.#url()
      const token = this.#token()
      if (!url || !token) throw new FinanceError(400, "finance app not connected")
      await this.#send(url, token, "DELETE", `/api/transactions/${encodeURIComponent(id)}`, undefined, true)
      delete links[key]
      writeJson(this.#linksFile, links)
      this.#scheduleSync("recent")
      return true
    })
  }

  // ---------- HTTP ----------

  async #get(url: string, token: string, path: string): Promise<unknown> {
    return this.#send(url, token, "GET", path)
  }

  async #send(url: string, token: string, method: string, path: string, body?: unknown, missingOk = false): Promise<unknown> {
    let r: Response
    try {
      r = await this.#fetch(`${url}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "X-Client-Id": "autocratico", ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: "error",
      })
    } catch (e) {
      throw new FinanceError(502, `finance app unreachable: ${(e as Error).message}`)
    }
    if (r.status === 404 && missingOk) return null
    if (r.status === 401) throw new FinanceError(400, "the finance app refused the token: create a new one")
    if (r.status === 403) throw new FinanceError(400, "the token may not do this: create one with --scope write")
    if (!r.ok) throw new FinanceError(502, `finance app: HTTP ${r.status}`)
    return r.json().catch(() => {
      throw new FinanceError(502, "finance app: unexpected answer")
    })
  }

  // ---------- change feed ----------

  /** Keeps the finance app's change feed open while the server runs (no-op until connected). */
  listen() {
    this.#listening = true
    this.#reconnect(0)
  }

  stop() {
    this.#listening = false
    this.#closeStream()
    if (this.#syncTimer) clearTimeout(this.#syncTimer)
    this.#syncTimer = null
  }

  #closeStream() {
    if (this.#retryTimer) clearTimeout(this.#retryTimer)
    this.#retryTimer = null
    this.#stream?.abort()
    this.#stream = null
    this.#live = false
  }

  #reconnect(delay: number) {
    this.#closeStream()
    if (!this.#listening) return
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null
      void this.#open()
    }, delay)
  }

  async #open() {
    const url = this.#url()
    const token = this.#token()
    if (!url || !token) return // connect() opens it
    const controller = new AbortController()
    this.#stream = controller
    let silence: NodeJS.Timeout | null = null
    const quiet = () => {
      if (silence) clearTimeout(silence)
      silence = setTimeout(() => controller.abort(), STREAM_SILENCE_MS)
    }
    try {
      const r = await this.#fetch(`${url}/api/events`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
        signal: controller.signal,
        redirect: "error",
      })
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`)
      quiet()
      const reader = r.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ""
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        quiet()
        buffer += value.replace(/\r\n/g, "\n")
        let end: number
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          this.#event(buffer.slice(0, end))
          buffer = buffer.slice(end + 2)
        }
      }
    } catch (e) {
      if (this.#stream === controller && !controller.signal.aborted) console.error(`finance: change feed: ${(e as Error).message}`)
    } finally {
      if (silence) clearTimeout(silence)
    }
    if (this.#stream !== controller) return // closed on purpose, or replaced
    const wasLive = this.#live
    this.#live = false
    if (wasLive) this.#retryMs = RETRY_MIN_MS
    this.#reconnect(this.#retryMs)
    this.#retryMs = Math.min(this.#retryMs * 2, RETRY_MAX_MS)
  }

  #event(block: string) {
    let name = "message"
    let data = ""
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) name = line.slice(6).trim()
      else if (line.startsWith("data:")) data += line.slice(5).trim()
    }
    if (name === "ready") {
      this.#live = true
      this.#retryMs = RETRY_MIN_MS
      this.#scheduleSync("recent") // catch up on what changed while the feed was closed
    } else if (name === "change") {
      let collection: unknown
      try {
        collection = (JSON.parse(data) as Raw).collection
      } catch {
        return
      }
      if (typeof collection === "string" && WATCHED.has(collection)) this.#scheduleSync("recent")
    }
  }
}

const euro = (n: number) => `||€ ${n.toFixed(2)}||`

/** finance/summary.md: what the chat agent reads to answer questions about spending. */
export function summary(m: FinanceMirror, today: string): string {
  const names = new Map(m.categories.map((c) => [c.id, c.name]))
  const from = `${addMonths(today, -23).slice(0, 7)}-01`
  // To the end of this month: transactions already entered for later this month count too.
  const end = addDays(addMonths(`${today.slice(0, 7)}-01`, 1), -1)
  const months = trend(m.transactions, "month", from, end).reverse()
  const lines = [
    "# Finance (synced from the finance app — do not edit)",
    "",
    `Last sync: ${m.synced_at}. ${m.transactions.length} transactions. Detail per transaction: finance/mirror.json.`,
    "",
    "## Months (newest first)",
    "",
  ]
  for (const b of months) {
    if (!b.expense && !b.earning) continue
    lines.push(`### ${b.start.slice(0, 7)}`, `Expenses ${euro(b.expense)} · earnings ${euro(b.earning)} · net ${euro(b.net)}`)
    for (const c of byCategory(m.transactions, b.start, addDays(addMonths(b.start, 1), -1))) lines.push(`- ${names.get(c.category) ?? c.category}: ${euro(c.total)}`)
    lines.push("")
  }
  const active = m.recurring.filter((r) => r.active)
  if (active.length) {
    lines.push("## Recurring (monthly)", "")
    for (const r of active) lines.push(`- ${r.description} (${names.get(r.category) ?? r.category}, ${r.type}): ${euro(r.amount)} on day ${r.dayOfMonth}`)
    lines.push("")
  }
  return lines.join("\n")
}
