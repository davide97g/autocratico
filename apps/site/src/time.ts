// Dates and status levels for the page. Thresholds mirror packages/core/src/status.ts.

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

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

const dayMonth = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" })
const longDate = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long" })
const fullDate = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" })

export const fmtShort = (d: Date) => dayMonth.format(d).replace(".", "")
export const fmtLong = (d: Date) => longDate.format(d)
export const fmtFull = (d: Date) => fullDate.format(d)
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
