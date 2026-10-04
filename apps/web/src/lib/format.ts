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
