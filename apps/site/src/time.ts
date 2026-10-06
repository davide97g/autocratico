// Dates, money and status levels for the page. Thresholds mirror packages/core/src/status.ts.

export type Severity = "high" | "medium" | "low"
export type Level = "overdue" | "urgent" | "soon" | "planned" | "done"

export const THRESHOLDS: Record<Severity, { urgent: number; soon: number }> = {
  high: { urgent: 30, soon: 90 },
  medium: { urgent: 14, soon: 45 },
  low: { urgent: 7, soon: 21 },
}

export const LEVEL_LABEL: Record<Level, string> = {
  overdue: "Scaduta",
  urgent: "Urgente",
  soon: "In arrivo",
  planned: "Pianificata",
  done: "Fatta",
}

export const SEVERITY_LABEL: Record<Severity, string> = { high: "alta", medium: "media", low: "bassa" }

export function level(days: number, severity: Severity, done = false): Level {
  if (done) return "done"
  if (days < 0) return "overdue"
  const t = THRESHOLDS[severity]
  if (days <= t.urgent) return "urgent"
  if (days <= t.soon) return "soon"
  return "planned"
}

export function today(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function addMonths(d: Date, n: number): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

/** The next `day` of `month` (1-12) from `from`, this year or the next. */
export function next(month: number, day: number, from = today()): Date {
  const d = new Date(from.getFullYear(), month - 1, day)
  return d < from ? new Date(from.getFullYear() + 1, month - 1, day) : d
}

/** The last day of this month, or of the next one when this one is about to end. */
export function endOfMonth(from = today()): Date {
  let d = new Date(from.getFullYear(), from.getMonth() + 1, 0)
  if (daysBetween(from, d) < 6) d = new Date(from.getFullYear(), from.getMonth() + 2, 0)
  return d
}

const dayMonth = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" })
const dayMonthLong = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" })
const longDate = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long" })
const fullDate = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" })
const weekday = new Intl.DateTimeFormat("it-IT", { weekday: "long" })
const weekdayShort = new Intl.DateTimeFormat("it-IT", { weekday: "short" })
const monthShort = new Intl.DateTimeFormat("it-IT", { month: "short" })
const monthYear = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" })
const money = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" })

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const fmtShort = (d: Date) => dayMonth.format(d).replace(".", "")
export const fmtDay = (d: Date) => dayMonthLong.format(d)
export const fmtLong = (d: Date) => longDate.format(d)
export const fmtFull = (d: Date) => fullDate.format(d)
export const fmtWeekday = (d: Date) => cap(weekday.format(d))
export const fmtWeekdayShort = (d: Date) => weekdayShort.format(d).replace(".", "").toUpperCase()
export const fmtMonth = (d: Date) => monthShort.format(d).replace(".", "")
export const fmtMonthYear = (d: Date) => cap(monthYear.format(d))
/** "180,00 €", as the app writes amounts. */
export const eur = (n: number) => money.format(n).replace(/ /g, " ")
export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

/** "tra 3 gg", "oggi", "2 gg fa", as the app's pills. */
export function relative(days: number): string {
  if (days === 0) return "oggi"
  if (days === 1) return "domani"
  if (days > 0) return `tra ${days} gg`
  return `${-days} gg fa`
}

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches
