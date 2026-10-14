/**
 * Widgets the chat agent designs for the Board (docs/generative-ui.md): a declarative spec drawn from
 * the catalog below, rendered by the web app with its own components. Widgets carry queries on the
 * register, not numbers, so they stay true as the data changes and personal data stays where it is.
 *
 * ```widget
 * {"id": "car", "title": "Car", "size": "medium", "spec": {"root": "main", "elements": {
 *   "main": {"type": "Stack", "children": ["next", "list"]},
 *   "next": {"type": "Countdown", "props": {"deadline": "car-tax"}},
 *   "list": {"type": "Deadlines", "props": {"query": {"from": "deadlines", "areas": ["car"], "days": 365}}}
 * }}}
 * ```
 * The server validates the block (`parseWidget`) and keeps it in the answer: the web chat shows a live
 * preview with a button that adds it to data/board.json (server-owned, one commit per change).
 */
import { z } from "zod"

import { addDays, addMonths } from "./dates.ts"
import { periodStart, portfolio } from "./finance.ts"
import type { Case, Data, FinanceData, Occurrence } from "./schema.ts"
import { type Level, level, ORDER } from "./status.ts"

// ---------- queries: what a widget shows, read from the register ----------

const Label = z.string().trim().min(1).max(80)
const Words = z.array(z.string().trim().min(1).max(80)).min(1).max(30)

/** Occurrences of the agenda (120 days back, 400 ahead): open overdue ones always count unless `overdue` is false. */
const DeadlinesQuery = z
  .object({
    from: z.literal("deadlines"),
    /** Days ahead from today (default 90). */
    days: z.number().int().min(0).max(400).optional(),
    /** Days back from today (default 0); open overdue occurrences are included anyway, see `overdue`. */
    past: z.number().int().min(0).max(120).optional(),
    overdue: z.boolean().optional(),
    areas: Words.optional(),
    ids: Words.optional(),
    severity: z.array(z.enum(["high", "medium", "low"])).min(1).optional(),
    status: z.array(z.enum(ORDER as [Level, ...Level[]])).min(1).optional(),
    /** Only payments (an amount, known, estimated or unknown). */
    payments: z.boolean().optional(),
    /** true: only occurrences marked done; false: only open ones. Default: both. */
    done: z.boolean().optional(),
  })
  .strict()

/** Transactions of the finance source (finance/mirror.json). */
const TransactionsQuery = z
  .object({
    from: z.literal("transactions"),
    /** Months back from today, this month included (default 1). */
    months: z.number().int().min(1).max(60).optional(),
    type: z.enum(["expense", "earning"]).optional(),
    /** Category ids or names. */
    categories: Words.optional(),
    /** Words in the description, any of them. */
    text: Words.optional(),
  })
  .strict()

/** Investment snapshots (investments.toml): total value on each date. */
const PortfolioQuery = z.object({ from: z.literal("portfolio") }).strict()

/** Cases (cases/<slug>/README.md). */
const CasesQuery = z
  .object({
    from: z.literal("cases"),
    /** Open: not every checklist item is done. */
    open: z.boolean().optional(),
    slugs: Words.optional(),
  })
  .strict()

export const WidgetQuery = z.discriminatedUnion("from", [DeadlinesQuery, TransactionsQuery, PortfolioQuery, CasesQuery])
export type WidgetQuery = z.infer<typeof WidgetQuery>

const Measure = z.enum(["amount", "count"]).optional()
/** A chart's points: a query grouped `by` something, summing amounts (or counting rows). */
export const SeriesQuery = z.discriminatedUnion("from", [
  DeadlinesQuery.extend({ by: z.enum(["month", "week", "area", "severity", "status"]), measure: Measure }),
  TransactionsQuery.extend({ by: z.enum(["month", "week", "category"]), measure: Measure }),
  PortfolioQuery.extend({ by: z.enum(["date", "broker"]), measure: Measure }),
  CasesQuery.extend({ by: z.enum(["status"]), measure: Measure }),
])
export type SeriesQuery = z.infer<typeof SeriesQuery>

/** A number: as is, how many rows a query returns, or the sum of their amounts. */
export const WidgetValue = z.union([z.number(), z.object({ count: WidgetQuery }).strict(), z.object({ sum: WidgetQuery }).strict()])
export type WidgetValue = z.infer<typeof WidgetValue>

const Format = z.enum(["money", "number", "percent", "days"])

/** What a Button does: open a view, a deadline or a case, or ask the chat. */
export const WidgetAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("view"), view: z.enum(["overview", "deadlines", "cases", "inbox", "finance", "profile", "archive", "catalog", "activity", "board"]) }).strict(),
  z.object({ type: z.literal("deadline"), id: Label }).strict(),
  z.object({ type: z.literal("case"), slug: Label }).strict(),
  z.object({ type: z.literal("ask"), question: z.string().trim().min(1).max(500) }).strict(),
])
export type WidgetAction = z.infer<typeof WidgetAction>

// ---------- the catalog ----------

const Text = z.string().trim().min(1).max(2000)
const Title = z.string().trim().min(1).max(120)
const none = z.object({}).strict()

export const WIDGET_COMPONENTS = {
  Grid: { children: true, props: z.object({ columns: z.number().int().min(1).max(4).optional() }).strict() },
  Stack: { children: true, props: z.object({ direction: z.enum(["row", "column"]).optional(), gap: z.enum(["sm", "md", "lg"]).optional() }).strict() },
  Section: { children: true, props: z.object({ title: Title, description: z.string().max(300).optional() }).strict() },
  Heading: { children: false, props: z.object({ text: Title }).strict() },
  Text: { children: false, props: z.object({ text: Text, muted: z.boolean().optional() }).strict() },
  Callout: { children: false, props: z.object({ tone: z.enum(["info", "success", "warning", "danger"]), title: Title.optional(), text: Text }).strict() },
  Separator: { children: false, props: none },
  Metric: { children: false, props: z.object({ label: Label, value: WidgetValue, format: Format.optional(), hint: z.string().max(200).optional() }).strict() },
  Progress: { children: false, props: z.object({ label: Label, value: WidgetValue, max: WidgetValue, format: Format.optional() }).strict() },
  Chart: {
    children: false,
    props: z.object({ kind: z.enum(["bar", "line", "area", "donut"]), series: SeriesQuery, height: z.enum(["sm", "md", "lg"]).optional(), cumulative: z.boolean().optional() }).strict(),
  },
  Deadlines: {
    children: false,
    props: z.object({ query: DeadlinesQuery, limit: z.number().int().min(1).max(50).optional(), empty: z.string().max(200).optional() }).strict(),
  },
  Cases: { children: false, props: z.object({ query: CasesQuery.optional(), limit: z.number().int().min(1).max(30).optional() }).strict() },
  Countdown: { children: false, props: z.object({ deadline: Label, label: Label.optional() }).strict() },
  Button: { children: false, props: z.object({ label: Label, action: WidgetAction }).strict() },
} as const
export type WidgetType = keyof typeof WIDGET_COMPONENTS
export const WIDGET_TYPES = Object.keys(WIDGET_COMPONENTS) as WidgetType[]

export const MAX_ELEMENTS = 40
const MAX_DEPTH = 8
const ElementId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, "element ids are lowercase letters, digits, - and _")
export const WidgetId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/, "widget ids are lowercase kebab-case")

export type WidgetElement = { type: WidgetType; props: Record<string, unknown>; children: string[] }
export type WidgetSpec = { root: string; elements: Record<string, WidgetElement> }

const RawElement = z
  .object({ type: z.string(), props: z.record(z.string(), z.unknown()).optional(), children: z.array(ElementId).max(MAX_ELEMENTS).optional() })
  .strict()

export const WidgetSpec: z.ZodType<WidgetSpec> = z
  .object({
    root: ElementId,
    elements: z.record(ElementId, RawElement).refine((e) => Object.keys(e).length <= MAX_ELEMENTS, `at most ${MAX_ELEMENTS} elements`),
  })
  .strict()
  .transform((spec, ctx) => {
    let bad = false
    const problem = (message: string) => {
      bad = true
      ctx.addIssue({ code: "custom", message })
    }
    const elements: Record<string, WidgetElement> = {}
    for (const [id, el] of Object.entries(spec.elements)) {
      const component = WIDGET_COMPONENTS[el.type as WidgetType]
      if (!component) {
        problem(`${id}: unknown type "${el.type}" (known: ${WIDGET_TYPES.join(", ")})`)
        continue
      }
      const props = component.props.safeParse(el.props ?? {})
      if (!props.success) {
        const issue = props.error.issues[0]
        problem(`${id} (${el.type}): ${issue.path.join(".") || "props"}: ${issue.message}`)
        continue
      }
      const children = el.children ?? []
      if (children.length && !component.children) problem(`${id} (${el.type}) takes no children`)
      for (const c of children) if (!spec.elements[c]) problem(`${id}: child "${c}" is not an element`)
      elements[id] = { type: el.type as WidgetType, props: props.data as Record<string, unknown>, children }
    }
    if (!spec.elements[spec.root]) problem(`root "${spec.root}" is not an element`)
    if (bad) return z.NEVER
    // Each element shown once, no cycles, not too deep.
    const seen = new Set<string>()
    const walk = (id: string, depth: number): boolean => {
      if (seen.has(id) || depth > MAX_DEPTH) return false
      seen.add(id)
      return elements[id].children.every((c) => walk(c, depth + 1))
    }
    if (!walk(spec.root, 1)) {
      problem(`elements form a cycle, are used twice or nest deeper than ${MAX_DEPTH}`)
      return z.NEVER
    }
    // Elements the root never reaches are dropped.
    return { root: spec.root, elements: Object.fromEntries(Object.entries(elements).filter(([id]) => seen.has(id))) }
  })

export const WIDGET_SIZES = ["small", "medium", "large", "full"] as const
export const WidgetSize = z.enum(WIDGET_SIZES)
export type WidgetSize = z.infer<typeof WidgetSize>

/** What the agent proposes, and what the web app sends to save it. */
export const WidgetInput = z
  .object({ id: WidgetId, title: Title, size: WidgetSize.default("medium"), spec: WidgetSpec })
  .strict()
export type WidgetInput = z.infer<typeof WidgetInput>

export const Widget = z.object({
  id: WidgetId,
  title: z.string(),
  size: WidgetSize,
  spec: WidgetSpec,
  created: z.string(),
  updated: z.string(),
})
export type Widget = z.infer<typeof Widget>

/** data/board.json: the widgets in the order shown. */
export const Board = z.object({ version: z.literal(1), widgets: z.array(Widget) })
export type Board = z.infer<typeof Board>
export const EMPTY_BOARD: Board = { version: 1, widgets: [] }

/** A widget as written to the board file and in the agent's blocks (JSON, stable key order). */
export function widgetJson(w: WidgetInput): string {
  return JSON.stringify({ id: w.id, title: w.title, size: w.size, spec: w.spec })
}

/** A widget proposal parsed, or the first problem found (shown to the user). */
export function parseWidget(value: unknown): { widget: WidgetInput } | { error: string } {
  const r = WidgetInput.safeParse(value)
  if (r.success) return { widget: r.data }
  const issue = r.error.issues[0]
  const where = issue.path.filter((p) => p !== "spec" && p !== "elements").join(".")
  return { error: `${where ? `${where}: ` : ""}${issue.message}` }
}

// ---------- widget blocks in the chat ----------

const WIDGET_BLOCK = /```widget[ \t]*\n([\s\S]*?)```/g

/** Widget blocks in an answer, as written by the agent (unchecked JSON, or null when unreadable). */
export function widgetBlocks(answer: string): unknown[] {
  return [...answer.matchAll(WIDGET_BLOCK)].map((m) => {
    try {
      return JSON.parse(m[1])
    } catch {
      return null
    }
  })
}

/** The answer with its widget blocks replaced by `replace(index)` ("" removes them). */
export function replaceWidgetBlocks(answer: string, replace: (index: number) => string): string {
  let i = 0
  return answer.replace(WIDGET_BLOCK, () => replace(i++))
}

export function widgetBlock(w: WidgetInput): string {
  return "```widget\n" + widgetJson(w) + "\n```"
}

/**
 * The widgets an answer proposes (checked by the server when it was saved; parsed again here), one per id:
 * the last one wins, since a live answer holds the agent's block and then the server's normalized copy.
 */
export function answerWidgets(answer: string): WidgetInput[] {
  const byId = new Map<string, WidgetInput>()
  for (const v of widgetBlocks(answer)) {
    const r = WidgetInput.safeParse(v)
    if (r.success) {
      byId.delete(r.data.id)
      byId.set(r.data.id, r.data)
    }
  }
  return [...byId.values()]
}

// ---------- evaluation, shared by the web app and the demo ----------

/** What queries read: the register (`GET /api/data`) and, when loaded, the finance data. */
export type WidgetContext = { data: Pick<Data, "today" | "agenda" | "cases">; finance: FinanceData | null }

export type DeadlinesQuery = z.infer<typeof DeadlinesQuery>
export type TransactionsQuery = z.infer<typeof TransactionsQuery>
export type CasesQuery = z.infer<typeof CasesQuery>

/** True when the query needs the finance data (transactions, portfolio). */
export function needsFinance(spec: WidgetSpec): boolean {
  return JSON.stringify(spec).match(/"from":"(transactions|portfolio)"/) !== null
}

const lower = (s: string) => s.toLowerCase()
const cents = (n: number) => Math.round(n * 100) / 100

export function deadlineRows(q: DeadlinesQuery, ctx: WidgetContext): Occurrence[] {
  const { today, agenda } = ctx.data
  const end = addDays(today, q.days ?? 90)
  const start = addDays(today, -(q.past ?? 0))
  const areas = q.areas?.map(lower)
  return agenda.filter((o) => {
    const inWindow = o.date >= start && o.date <= end
    const overdueOpen = (q.overdue ?? true) && !o.done_on && o.days < 0
    if (!inWindow && !overdueOpen) return false
    if (areas && !areas.includes(lower(o.area))) return false
    if (q.ids && !q.ids.includes(o.id)) return false
    if (q.severity && !q.severity.includes(o.severity)) return false
    if (q.status && !q.status.includes(level(o))) return false
    if (q.payments && o.amount_basis === null) return false
    if (q.done !== undefined && Boolean(o.done_on) !== q.done) return false
    return true
  })
}

export function transactionRows(q: TransactionsQuery, ctx: WidgetContext) {
  const mirror = ctx.finance?.mirror
  if (!mirror) return []
  const from = addMonths(`${ctx.data.today.slice(0, 7)}-01`, -((q.months ?? 1) - 1))
  const names = new Map(mirror.categories.map((c) => [c.id, lower(c.name)]))
  const cats = q.categories?.map(lower)
  const words = q.text?.map(lower)
  return mirror.transactions.filter((t) => {
    if (t.date < from || t.date > ctx.data.today) return false
    if (q.type && t.type !== q.type) return false
    if (cats && !cats.includes(lower(t.category)) && !cats.includes(names.get(t.category) ?? "")) return false
    if (words && !words.some((w) => lower(t.description).includes(w))) return false
    return true
  })
}

export function caseRows(q: CasesQuery | undefined, ctx: WidgetContext): Case[] {
  return ctx.data.cases.filter((c) => {
    if (q?.open !== undefined && (c.total > 0 && c.done >= c.total) === q.open) return false
    if (q?.slugs && !q.slugs.includes(c.slug)) return false
    return true
  })
}

function portfolioPoints(ctx: WidgetContext) {
  return portfolio(ctx.finance?.investments ?? [])
}

/** Rows of a query, each with an amount (null when it has none) for sums. */
function amounts(q: WidgetQuery, ctx: WidgetContext): (number | null)[] {
  switch (q.from) {
    case "deadlines":
      return deadlineRows(q, ctx).map((o) => o.amount)
    case "transactions":
      return transactionRows(q, ctx).map((t) => t.amount)
    case "portfolio": {
      const p = portfolioPoints(ctx)
      return p.history.length ? [p.total] : []
    }
    case "cases":
      return caseRows(q, ctx).map(() => null)
  }
}

/** A Value as a number; null when the data it needs is not there (finance not connected). */
export function widgetValue(v: WidgetValue, ctx: WidgetContext): number | null {
  if (typeof v === "number") return v
  const q = "count" in v ? v.count : v.sum
  if ((q.from === "transactions" || q.from === "portfolio") && !ctx.finance) return null
  if (q.from === "transactions" && !ctx.finance?.mirror) return null
  const rows = amounts(q, ctx)
  return "count" in v ? rows.length : cents(rows.reduce<number>((s, a) => s + (a ?? 0), 0))
}

export type SeriesPoint = { key: string; value: number }

/** Points of a chart, in order (dates ascending, other groupings largest first). */
export function widgetSeries(q: SeriesQuery, ctx: WidgetContext, cumulative = false): SeriesPoint[] | null {
  const count = q.measure === "count"
  const totals = new Map<string, number>()
  const add = (key: string, amount: number | null) => totals.set(key, (totals.get(key) ?? 0) + (count ? 1 : (amount ?? 0)))
  const byDate = q.by === "month" || q.by === "week" || q.by === "date"
  if (q.from === "deadlines") {
    const rows = deadlineRows(q, ctx)
    if (byDate) {
      // Every period of the window, empty ones too.
      const g = q.by === "week" ? "week" : "month"
      const first = rows.reduce((m, o) => (o.date < m ? o.date : m), addDays(ctx.data.today, -(q.past ?? 0)))
      for (let s = periodStart(first, g); s <= addDays(ctx.data.today, q.days ?? 90); s = g === "week" ? addDays(s, 7) : addMonths(s, 1)) totals.set(s, 0)
      for (const o of rows) add(periodStart(o.date, g), o.amount)
    } else {
      for (const o of rows) add(q.by === "area" ? o.area : q.by === "severity" ? o.severity : level(o), o.amount)
    }
  } else if (q.from === "transactions") {
    if (!ctx.finance?.mirror) return null
    const rows = transactionRows(q, ctx)
    const names = new Map(ctx.finance.mirror.categories.map((c) => [c.id, c.name]))
    if (byDate) {
      const g = q.by === "week" ? "week" : "month"
      const from = addMonths(`${ctx.data.today.slice(0, 7)}-01`, -((q.months ?? 1) - 1))
      for (let s = periodStart(from, g); s <= ctx.data.today; s = g === "week" ? addDays(s, 7) : addMonths(s, 1)) totals.set(s, 0)
      for (const t of rows) add(periodStart(t.date, g), t.amount)
    } else {
      for (const t of rows) add(names.get(t.category) ?? t.category, t.amount)
    }
  } else if (q.from === "portfolio") {
    if (!ctx.finance) return null
    const p = portfolioPoints(ctx)
    if (q.by === "broker") for (const s of p.latest) add(s.broker, p.history.at(-1)?.brokers[s.broker] ?? 0)
    else for (const h of p.history) totals.set(h.date, h.total)
  } else {
    for (const c of caseRows(q, ctx)) add(c.status || "—", null)
  }
  const points = [...totals].map(([key, value]) => ({ key, value: cents(value) }))
  points.sort(byDate ? (a, b) => a.key.localeCompare(b.key) : (a, b) => b.value - a.value)
  if (cumulative) {
    let run = 0
    for (const p of points) p.value = cents((run += p.value))
  }
  return points
}

/** The next open occurrence of a deadline (or the latest overdue one), for a Countdown. */
export function nextOccurrence(id: string, ctx: WidgetContext): Occurrence | null {
  const open = ctx.data.agenda.filter((o) => o.id === id && !o.done_on).sort((a, b) => a.date.localeCompare(b.date))
  return open[0] ?? null
}

// ---------- what the agent is told ----------

export const WIDGET_INSTRUCTIONS = `Widgets: the user's Board page (data/board.json, read it to see what is there) holds small dashboards you design. When the user asks for a widget, a chart, a dashboard or a view of their data, or to change one on the Board, answer with one short sentence and a block
\`\`\`widget
{"id": "<kebab-case id; the same id as on the Board to update that widget>", "title": "<short, user's language>", "size": "small|medium|large|full", "spec": {"root": "<element id>", "elements": {"<element id>": {"type": "<component>", "props": {...}, "children": ["<element id>", ...]}}}}
\`\`\`
The app shows a live preview with a button to add it (or update it); nothing is saved until the user presses it, so no confirmation is needed first. Widgets never hold amounts or personal data: they hold queries, and the app fills in the numbers. At most ${MAX_ELEMENTS} elements; element ids lowercase; only layout components take children.
Components (props; ? = optional):
- Grid {columns?: 1-4} children side by side (one column on phones). Stack {direction?: "row"|"column", gap?: "sm"|"md"|"lg"}. Section {title, description?} a titled group.
- Heading {text}. Text {text, muted?} Markdown, user's language; wrap personal data in ||...||. Callout {tone: "info"|"success"|"warning"|"danger", title?, text}. Separator {}.
- Metric {label, value, format?: "money"|"number"|"percent"|"days", hint?} one big number. Progress {label, value, max, format?}.
- Chart {kind: "bar"|"line"|"area"|"donut", series, height?: "sm"|"md"|"lg", cumulative?} series = a query plus "by" and "measure"?: "amount" (default) or "count".
- Deadlines {query, limit?, empty?} the matching occurrences with status color, date and amount. Cases {query?, limit?} cases with checklist progress. Countdown {deadline: "<deadline id>", label?} days to its next open occurrence.
- Button {label, action} action: {"type": "view", "view": "overview"|"deadlines"|"cases"|"inbox"|"finance"|"profile"|"archive"|"catalog"|"activity"|"board"} | {"type": "deadline", "id"} | {"type": "case", "slug"} | {"type": "ask", "question"} (asks you in the chat).
Values (value, max): a number, {"count": query} or {"sum": query} (sum of amounts).
Queries ("from"):
- {"from": "deadlines", days?: ahead (default 90, max 400), past?: days back (default 0, max 120), overdue?: include open overdue ones (default true), areas?: [...], ids?: [deadline ids], severity?: ["high"|"medium"|"low"], status?: ["overdue"|"urgent"|"soon"|"planned"|"done"], payments?: true = only payments, done?: true|false}. Chart "by": month, week, area, severity, status.
- {"from": "transactions", months?: back from today, this month included (default 1), type?: "expense"|"earning", categories?: [ids or names, see finance/mirror.json], text?: [words in the description]} the finance source. Chart "by": month, week, category.
- {"from": "portfolio"} investments.toml. Chart "by": date (total value), broker. {"sum": {"from": "portfolio"}} is the current total.
- {"from": "cases", open?: true|false, slugs?: [...]}. Chart "by": status.
Use the real area names, deadline ids, case slugs and category ids from the data files. Prefer few, clear elements: a Metric or two above a Chart or a list. "small" fits one number, "medium" a chart or a list, "large" and "full" a few side by side.`
