/**
 * `http` finance connector: a server speaking the contract in docs/customize/finance-connector.md.
 * Bearer token, JSON lists at /api/transactions, /api/categories, /api/tags, /api/recurring, an SSE change
 * feed at /api/events, and (with a write token) POST/DELETE /api/transactions.
 *
 * Security-sensitive: the token comes from data/secrets and goes only to the configured address, never
 * through a redirect. Answers are data: mapped into fixed shapes, anything else dropped.
 */
import type { FinanceCategory, FinanceExpenseInput, FinanceRecurring, FinanceTag, FinanceTransaction } from "@autocratico/core"

import { type FinanceConnector, FinanceError, type FinanceFeed, type FinanceRead } from "./finance-connector.ts"

type Fetch = typeof fetch
type Raw = Record<string, unknown>

/** Collections of the change feed that the mirror holds. */
const WATCHED = new Set(["transactions", "categories", "tags", "recurring"])
const REQUEST_TIMEOUT_MS = 20_000
/** The server pings every 25 s: silence for longer means the stream is dead. */
const STREAM_SILENCE_MS = 75_000
const RETRY_MIN_MS = 5_000
const RETRY_MAX_MS = 5 * 60_000
/** Sent along with `date` for servers that store the month and year apart; others ignore them. */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

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
  if (!Array.isArray(value)) throw new FinanceError(502, "finance server: unexpected answer")
  return value.flatMap((r) => {
    const x = map(r as Raw)
    return x ? [x] : []
  })
}

export class HttpConnector implements FinanceConnector {
  readonly kind = "http"
  readonly capabilities = { write: true, live: true, recurring: true }
  readonly incremental = true
  readonly #url: string
  readonly #token: string
  readonly #fetch: Fetch

  constructor(url: string, token: string, fetcher: Fetch = fetch) {
    this.#url = url
    this.#token = token
    this.#fetch = fetcher
  }

  async check(): Promise<void> {
    await this.#send("GET", "/api/categories")
  }

  async read(since: string | null): Promise<FinanceRead> {
    const [transactions, categories, tags, recurring] = await Promise.all([
      this.#send("GET", since ? `/api/transactions?from=${since}` : "/api/transactions").then((v) => rows(v, toTransaction)),
      this.#send("GET", "/api/categories").then((v) => rows(v, toCategory)),
      this.#send("GET", "/api/tags").then((v) => rows(v, toTag)),
      this.#send("GET", "/api/recurring").then((v) => rows(v, toRecurring)),
    ])
    return { transactions, categories, tags, recurring }
  }

  async create(input: FinanceExpenseInput): Promise<string> {
    const [year, month] = input.date.split("-")
    const created = (await this.#send("POST", "/api/transactions", {
      date: input.date,
      month: MONTHS[Number(month) - 1],
      year,
      amount: input.amount,
      description: input.description,
      category: input.category,
      type: "expense",
    })) as Raw
    if (typeof created?.id !== "string") throw new FinanceError(502, "finance server: unexpected answer")
    return created.id
  }

  async remove(id: string): Promise<void> {
    await this.#send("DELETE", `/api/transactions/${encodeURIComponent(id)}`, undefined, true)
  }

  async #send(method: string, path: string, body?: unknown, missingOk = false): Promise<unknown> {
    let r: Response
    try {
      r = await this.#fetch(`${this.#url}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.#token}`, Accept: "application/json", "X-Client-Id": "autocratico", ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: "error",
      })
    } catch (e) {
      throw new FinanceError(502, `finance server unreachable: ${(e as Error).message}`)
    }
    if (r.status === 404 && missingOk) return null
    if (r.status === 401) throw new FinanceError(400, "the finance server refused the token: create a new one")
    if (r.status === 403) throw new FinanceError(400, "the token may not do this: create one that can write")
    if (!r.ok) throw new FinanceError(502, `finance server: HTTP ${r.status}`)
    return r.json().catch(() => {
      throw new FinanceError(502, "finance server: unexpected answer")
    })
  }

  // ---------- change feed ----------

  /** Keeps /api/events open, reconnecting with a growing delay, until closed. */
  watch(on: { ready(): void; change(): void }): FinanceFeed {
    let live = false
    let closed = false
    let retryMs = RETRY_MIN_MS
    let retryTimer: NodeJS.Timeout | null = null
    let stream: AbortController | null = null

    const event = (block: string) => {
      let name = "message"
      let data = ""
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) name = line.slice(6).trim()
        else if (line.startsWith("data:")) data += line.slice(5).trim()
      }
      if (name === "ready") {
        live = true
        retryMs = RETRY_MIN_MS
        on.ready()
      } else if (name === "change") {
        let collection: unknown
        try {
          collection = (JSON.parse(data) as Raw).collection
        } catch {
          return
        }
        if (typeof collection === "string" && WATCHED.has(collection)) on.change()
      }
    }

    const open = async () => {
      const controller = new AbortController()
      stream = controller
      let silence: NodeJS.Timeout | null = null
      const quiet = () => {
        if (silence) clearTimeout(silence)
        silence = setTimeout(() => controller.abort(), STREAM_SILENCE_MS)
      }
      try {
        const r = await this.#fetch(`${this.#url}/api/events`, {
          headers: { Authorization: `Bearer ${this.#token}`, Accept: "text/event-stream" },
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
            event(buffer.slice(0, end))
            buffer = buffer.slice(end + 2)
          }
        }
      } catch (e) {
        if (!closed && !controller.signal.aborted) console.error(`finance: change feed: ${(e as Error).message}`)
      } finally {
        if (silence) clearTimeout(silence)
      }
      if (closed || stream !== controller) return
      const wasLive = live
      live = false
      if (wasLive) retryMs = RETRY_MIN_MS
      retryTimer = setTimeout(() => void open(), retryMs)
      retryMs = Math.min(retryMs * 2, RETRY_MAX_MS)
    }

    void open()
    return {
      get live() {
        return live
      },
      close() {
        closed = true
        live = false
        if (retryTimer) clearTimeout(retryTimer)
        stream?.abort()
      },
    }
  }
}
