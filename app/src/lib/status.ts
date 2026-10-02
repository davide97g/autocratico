import { SignalHighIcon, SignalLowIcon, SignalMediumIcon, type LucideIcon } from "lucide-react"

import type { Occurrence } from "@/lib/api"

export type Severity = "high" | "medium" | "low"
export type Level = "overdue" | "urgent" | "soon" | "planned" | "done"

/** Days within which a deadline becomes urgent or coming up, by severity. */
const THRESHOLDS: Record<Severity, { urgent: number; soon: number }> = {
  high: { urgent: 30, soon: 90 },
  medium: { urgent: 14, soon: 45 },
  low: { urgent: 7, soon: 21 },
}

export const SEVERITY_ICON: Record<Severity, LucideIcon> = {
  high: SignalHighIcon,
  medium: SignalMediumIcon,
  low: SignalLowIcon,
}

export const SEVERITIES: Severity[] = ["high", "medium", "low"]

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

/** Static classes per level: `solid` for dots and chips, `soft` for badges. */
export const STYLE: Record<Level, { solid: string; soft: string; dot: string }> = {
  overdue: {
    solid: "bg-status-overdue text-status-overdue-foreground",
    soft: "bg-status-overdue/12 text-status-overdue",
    dot: "bg-status-overdue",
  },
  urgent: {
    solid: "bg-status-urgent text-status-urgent-foreground",
    soft: "bg-status-urgent/12 text-status-urgent",
    dot: "bg-status-urgent",
  },
  soon: {
    solid: "bg-status-soon text-status-soon-foreground",
    soft: "bg-status-soon/20 text-foreground",
    dot: "bg-status-soon",
  },
  planned: {
    solid: "bg-primary-foreground text-primary",
    soft: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  done: {
    solid: "bg-status-done text-status-done-foreground",
    soft: "bg-status-done/12 text-status-done",
    dot: "bg-status-done",
  },
}

export const ORDER: Level[] = ["overdue", "urgent", "soon", "planned", "done"]
