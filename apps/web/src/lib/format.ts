import * as React from "react"
import {
  BanknoteIcon,
  ChartLineIcon,
  BellRingIcon,
  BotIcon,
  DatabaseBackupIcon,
  MailIcon,
  NewspaperIcon,
  WorkflowIcon,
  BriefcaseBusinessIcon,
  CarIcon,
  HeartIcon,
  HeartPulseIcon,
  HouseIcon,
  IdCardIcon,
  LandmarkIcon,
  StoreIcon,
  type LucideIcon,
  TagIcon,
} from "lucide-react"

import type { Area } from "@/lib/api"
import type { Messages } from "@/i18n/en"

const AREA_ICONS: Record<string, LucideIcon> = {
  tax: LandmarkIcon,
  home: HouseIcon,
  vehicles: CarIcon,
  documents: IdCardIcon,
  health: HeartPulseIcon,
  "social-security": BriefcaseBusinessIcon,
  bank: BanknoteIcon,
  family: HeartIcon,
  business: StoreIcon,
}

const JOB_ICONS: Record<string, LucideIcon> = {
  gmail: MailIcon,
  finance: ChartLineIcon,
  triage: BotIcon,
  reminders: BellRingIcon,
  digest: NewspaperIcon,
  backup: DatabaseBackupIcon,
}

/** Icon of a server job (`JOB_NAMES` in apps/server/src/jobs.ts). */
export function jobIcon(job: string): LucideIcon {
  return JOB_ICONS[job] ?? WorkflowIcon
}

export function areaIcon(a: Area): LucideIcon {
  return AREA_ICONS[a] ?? TagIcon
}

export function areaName(t: Messages, a: Area) {
  return t.areas[a] ?? humanize(a)
}

/** Parse an ISO date (YYYY-MM-DD) as a local date. */
export function parseDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** `snake_case` or `kebab-case` key to a readable label. */
export function humanize(key: string) {
  return capitalize(key.replace(/[_-]/g, " "))
}

/** 45 s, 3:07, 1:02:05 */
export function duration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000))
  if (total < 60) return `${total} s`
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, "0")
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`
}

/** The current time, ticking every second while `active`. */
export function useNow(active: boolean) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return now
}
