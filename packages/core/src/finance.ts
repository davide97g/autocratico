/**
 * Money over time, from the finance app's transactions (synced into data/finance/mirror.json),
 * the payments in the register and the investments snapshots.
 */
import { addDays, addMonths, daysBetween } from "./dates.ts"
import { jsonable, parseToml } from "./deadlines.ts"
import { payments } from "./payments.ts"
import type { AmountBasis, FinanceData, FinanceRecurring, FinanceTransaction, InvestmentSnapshot, Occurrence } from "./schema.ts"

export const GRANULARITIES = ["week", "month", "year"] as const
export type Granularity = (typeof GRANULARITIES)[number]

const cents = (n: number) => Math.round(n * 100) / 100

/** First day of the period holding `iso`: Monday of its ISO week, first of its month, January 1. */
export function periodStart(iso: string, g: Granularity): string {
  if (g === "year") return `${iso.slice(0, 4)}-01-01`
  if (g === "month") return `${iso.slice(0, 7)}-01`
  const weekday = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7 // Monday = 0
  return addDays(iso, -weekday)
}

export function nextPeriod(start: string, g: Granularity): string {
  return g === "week" ? addDays(start, 7) : addMonths(start, g === "year" ? 12 : 1)
}

export type TrendBucket = {
  /** First day of the period. */
  start: string
  expense: number
  earning: number
  /** earning - expense. */
  net: number
  /** Expenses by category id. */
  categories: Record<string, number>
}

/**
 * Totals per week, month or year for the periods from `from` to `to` (both included, empty ones too).
 * `exclude`: category ids left out (e.g. the ones the finance app keeps out of the budget).
 */
export function trend(transactions: FinanceTransaction[], g: Granularity, from: string, to: string, exclude: ReadonlySet<string> = new Set()): TrendBucket[] {
  const buckets = new Map<string, TrendBucket>()
  for (let s = periodStart(from, g); s <= to; s = nextPeriod(s, g)) buckets.set(s, { start: s, expense: 0, earning: 0, net: 0, categories: {} })
  for (const t of transactions) {
    if (t.date < from || t.date > to || exclude.has(t.category)) continue
    const b = buckets.get(periodStart(t.date, g))
    if (!b) continue
    if (t.type === "expense") {
      b.expense += t.amount
      b.categories[t.category] = (b.categories[t.category] ?? 0) + t.amount
    } else b.earning += t.amount
  }
  return [...buckets.values()].map((b) => ({
    ...b,
    expense: cents(b.expense),
    earning: cents(b.earning),
    net: cents(b.earning - b.expense),
    categories: Object.fromEntries(Object.entries(b.categories).map(([k, v]) => [k, cents(v)])),
  }))
}

/** Expenses by category over a date range, largest first. */
export function byCategory(transactions: FinanceTransaction[], from: string, to: string, exclude: ReadonlySet<string> = new Set()): { category: string; total: number }[] {
  const totals = new Map<string, number>()
  for (const t of transactions) {
    if (t.type !== "expense" || t.date < from || t.date > to || exclude.has(t.category)) continue
    totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount)
  }
  return [...totals].map(([category, total]) => ({ category, total: cents(total) })).sort((a, b) => b.total - a.total)
}

export const FUTURE_SOURCES = ["finance", "deadline"] as const
export type FutureSource = (typeof FUTURE_SOURCES)[number]

export type FutureItem = {
  /** `<recurring id>@<date>` or the occurrence key. */
  key: string
  date: string
  days: number
  amount: number | null
  /** Recurring templates have a fixed amount: always "known". */
  basis: AmountBasis
  source: FutureSource
  label: string
  /** Finance category id, when known. */
  category: string | null
  /** The deadline id, for items from the register. */
  deadline: string | null
}

function lastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Expenses the finance app will add from its active templates, from today to `months` ahead:
 * one per month after `lastPeriod`, on `dayOfMonth` clamped to the month's length.
 */
export function projectRecurring(recurring: FinanceRecurring[], today: string, months: number): FutureItem[] {
  const end = addMonths(today, months)
  const items: FutureItem[] = []
  for (const r of recurring) {
    if (!r.active || r.type !== "expense" || !/^\d{4}-\d{2}$/.test(r.lastPeriod)) continue
    let [y, m] = r.lastPeriod.split("-").map(Number)
    for (;;) {
      m += 1
      if (m > 12) [y, m] = [y + 1, 1]
      const date = `${y}-${String(m).padStart(2, "0")}-${String(Math.min(Math.max(r.dayOfMonth, 1), lastDay(y, m))).padStart(2, "0")}`
      if (date > end) break
      if (date < today) continue // added by the finance app next time it opens: not "future" any more
      items.push({ key: `${r.id}@${date}`, date, days: daysBetween(today, date), amount: r.amount, basis: "known", source: "finance", label: r.description, category: r.category, deadline: null })
    }
  }
  return items
}

/**
 * What is left to pay over the next `months`: the register's payments (overdue ones included) and the
 * finance app's recurring expenses. A deadline with `finance_recurring` stands for that template,
 * whose projection is then left out.
 */
export function futureExpenses(
  agenda: Occurrence[],
  recurring: FinanceRecurring[],
  deadlines: FinanceData["deadlines"],
  today: string,
  months: number
): FutureItem[] {
  const tied = new Map(deadlines.map((d) => [d.id, d]))
  const covered = new Set(deadlines.flatMap((d) => (d.finance_recurring ? [d.finance_recurring] : [])))
  const fromRegister: FutureItem[] = payments(agenda, today, months).items.map((o) => ({
    key: o.key,
    date: o.date,
    days: o.days,
    amount: o.amount,
    basis: o.amount_basis ?? "unknown",
    source: "deadline",
    label: o.title,
    category: tied.get(o.id)?.finance_category ?? null,
    deadline: o.id,
  }))
  const fromFinance = projectRecurring(
    recurring.filter((r) => !covered.has(r.id)),
    today,
    months
  )
  return [...fromRegister, ...fromFinance].sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label))
}

export type FutureMonth = { month: string; finance: number; known: number; estimate: number }

/** Future expenses per month (YYYY-MM), from this month on; overdue ones count in this month. */
export function futureByMonth(items: FutureItem[], today: string, months: number): FutureMonth[] {
  const rows = new Map<string, FutureMonth>()
  for (let i = 0; i <= months; i++) {
    const month = addMonths(`${today.slice(0, 7)}-01`, i).slice(0, 7)
    rows.set(month, { month, finance: 0, known: 0, estimate: 0 })
  }
  for (const item of items) {
    const row = rows.get(item.date < today ? today.slice(0, 7) : item.date.slice(0, 7))
    if (!row || item.amount === null || item.basis === "unknown") continue
    if (item.source === "finance") row.finance += item.amount
    else if (item.basis === "known") row.known += item.amount
    else row.estimate += item.amount
  }
  return [...rows.values()].map((r) => ({ ...r, finance: cents(r.finance), known: cents(r.known), estimate: cents(r.estimate) }))
}

const numberOr = <T>(v: unknown, fallback: T): number | T => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "bigint" ? Number(v) : fallback)
const textOr = <T>(v: unknown, fallback: T): string | T => (typeof v === "string" && v.trim() ? v.trim() : fallback)

/**
 * investments.toml: `[[snapshot]]` tables written by the agent from brokers' screenshots and exports.
 * Snapshots without a date or a broker are skipped and reported, so one bad entry does not hide the rest.
 */
export function parseInvestments(text: string): { snapshots: InvestmentSnapshot[]; problems: string[] } {
  const raw = jsonable(parseToml(text, "investments.toml").snapshot ?? []) as Record<string, unknown>[]
  if (!Array.isArray(raw)) return { snapshots: [], problems: ["investments.toml: `snapshot` must be an array of tables"] }
  const snapshots: InvestmentSnapshot[] = []
  const problems: string[] = []
  raw.forEach((r, i) => {
    const date = typeof r?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null
    const broker = textOr(r?.broker, null)
    if (!date || !broker) {
      problems.push(`investments.toml: snapshot ${i + 1} needs a date (YYYY-MM-DD) and a broker`)
      return
    }
    const positions = (Array.isArray(r.position) ? r.position : Array.isArray(r.positions) ? r.positions : []) as Record<string, unknown>[]
    snapshots.push({
      date,
      broker,
      cash: numberOr(r.cash, 0),
      source: textOr(r.source, ""),
      positions: positions
        .filter((p) => p && typeof p === "object" && numberOr(p.value, null) !== null)
        .map((p) => ({ name: textOr(p.name, "?"), isin: textOr(p.isin, null), quantity: numberOr(p.quantity, null), value: numberOr(p.value, 0), cost: numberOr(p.cost, null) })),
    })
  })
  return { snapshots, problems }
}

const snapshotValue = (s: InvestmentSnapshot) => s.cash + s.positions.reduce((sum, p) => sum + p.value, 0)

export type PortfolioPoint = { date: string; total: number; brokers: Record<string, number> }
export type Holding = { name: string; isin: string | null; broker: string; value: number; cost: number | null }
export type Portfolio = {
  /** Total value on each snapshot date: every broker counts with its latest snapshot until then. */
  history: PortfolioPoint[]
  /** The latest snapshot of each broker. */
  latest: InvestmentSnapshot[]
  total: number
  cash: number
  /** Sum of `cost` where the broker shows it, and the value of those same positions. */
  cost: number | null
  costedValue: number
  holdings: Holding[]
}

export function portfolio(snapshots: InvestmentSnapshot[]): Portfolio {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
  const current = new Map<string, InvestmentSnapshot>()
  const history: PortfolioPoint[] = []
  for (const s of sorted) {
    current.set(s.broker, s)
    const brokers = Object.fromEntries([...current].map(([b, x]) => [b, cents(snapshotValue(x))]))
    const point = { date: s.date, total: cents(Object.values(brokers).reduce((a, b) => a + b, 0)), brokers }
    if (history.at(-1)?.date === s.date) history[history.length - 1] = point
    else history.push(point)
  }
  const latest = [...current.values()]
  const holdings = latest
    .flatMap((s) => s.positions.map((p) => ({ name: p.name, isin: p.isin, broker: s.broker, value: p.value, cost: p.cost })))
    .sort((a, b) => b.value - a.value)
  const costed = holdings.filter((h) => h.cost !== null)
  return {
    history,
    latest,
    total: history.at(-1)?.total ?? 0,
    cash: cents(latest.reduce((s, x) => s + x.cash, 0)),
    cost: costed.length ? cents(costed.reduce((s, h) => s + h.cost!, 0)) : null,
    costedValue: cents(costed.reduce((s, h) => s + h.value, 0)),
    holdings,
  }
}
