/** Status of an occurrence, from severity and days left. Used by the web app and the notifications. */
import type { Occurrence, Severity } from "./schema.ts"

export type Level = "overdue" | "urgent" | "soon" | "planned" | "done"
export const ORDER: Level[] = ["overdue", "urgent", "soon", "planned", "done"]

/** Days within which a deadline becomes urgent or coming up, by severity. */
export const THRESHOLDS: Record<Severity, { urgent: number; soon: number }> = {
  high: { urgent: 30, soon: 90 },
  medium: { urgent: 14, soon: 45 },
  low: { urgent: 7, soon: 21 },
}

export function severity(s: string | undefined): Severity {
  return s === "high" || s === "low" ? s : "medium"
}

export function level(o: Pick<Occurrence, "days" | "done_on" | "severity">): Level {
  if (o.done_on) return "done"
  if (o.days < 0) return "overdue"
  const t = THRESHOLDS[severity(o.severity)]
  if (o.days <= t.urgent) return "urgent"
  if (o.days <= t.soon) return "soon"
  return "planned"
}
