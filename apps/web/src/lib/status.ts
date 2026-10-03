import { SignalHighIcon, SignalLowIcon, SignalMediumIcon, type LucideIcon } from "lucide-react"

import type { Level, Severity } from "@autocratico/core"

export { level, ORDER, severity } from "@autocratico/core"
export type { Level, Severity } from "@autocratico/core"

export const SEVERITY_ICON: Record<Severity, LucideIcon> = {
  high: SignalHighIcon,
  medium: SignalMediumIcon,
  low: SignalLowIcon,
}

export const SEVERITIES: Severity[] = ["high", "medium", "low"]

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

