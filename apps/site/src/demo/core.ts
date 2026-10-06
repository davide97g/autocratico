// State and helpers shared by the demo's views, chat and director.
import { addMonths, daysBetween, level, type Level } from "../time.ts"
import { baseCommits, baseDeadlines, baseInbox, T0, type Commit, type Deadline, type InboxItem, type View } from "./data.ts"

/** Skip mode: the director fast-forwards a story by turning every wait into nothing. */
export const M = { instant: false }
export const wait = (ms: number) => (M.instant ? Promise.resolve() : new Promise<void>((ok) => setTimeout(ok, ms)))

/** Personal data: hidden by Omissis, as <Sensitive> in the app. */
export const s = (text: string | number) => `<span class="s">${text}</span>`
export const esc = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)
export const hash7 = () => Array.from({ length: 7 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")

export interface State {
  view: View
  chat: boolean
  range: 3 | 6 | 12
  payRange: 3 | 6 | 12
  area: string
  showDone: boolean
  deadlines: Deadline[]
  inbox: InboxItem[]
  commits: Commit[]
  /** Ids that just changed: they glow once on the next render. */
  fresh: Set<string>
  /** The agent at work, for Attività → Adesso. */
  working: { file: string; step: string } | null
  arrived: Set<string>
  reminders: number
}

export function createState(): State {
  return {
    view: "overview",
    chat: false,
    range: 6,
    payRange: 6,
    area: "Tutti",
    showDone: false,
    deadlines: baseDeadlines(),
    inbox: baseInbox(),
    commits: baseCommits(),
    fresh: new Set(),
    working: null,
    arrived: new Set(),
    reminders: 0,
  }
}

export const daysLeft = (d: Deadline) => (d.date ? daysBetween(T0, d.date) : Infinity)
export const lv = (d: Deadline): Level => (d.date ? level(daysLeft(d), d.severity, d.done) : "planned")
export const ORDER: Level[] = ["overdue", "urgent", "soon", "planned", "done"]
export const rank = (d: Deadline) => ORDER.indexOf(lv(d)) * 100_000 + daysLeft(d)

/** Open deadlines with a date, most pressing first. */
export const pressing = (S: State) => S.deadlines.filter((d) => d.date && !d.done).sort((a, b) => rank(a) - rank(b))
/** How many need attention now: the badge on Scadenze and the bell. */
export const alerts = (S: State) => S.deadlines.filter((d) => d.date && !d.done && ["overdue", "urgent"].includes(lv(d))).length

export interface Totals {
  known: number
  estimated: number
  todo: number
  months: { label: Date; known: number; estimated: number }[]
  items: Deadline[]
}

/** What is left to pay in the next `months`, overdue included (packages/core/src/payments.ts). */
export function totals(S: State, months: number): Totals {
  const end = addMonths(T0, months)
  const items = S.deadlines
    .filter((d) => d.date && !d.done && d.amount !== undefined && d.date <= end)
    .sort((a, b) => a.date!.getTime() - b.date!.getTime())
  const out: Totals = { known: 0, estimated: 0, todo: 0, months: [], items }
  for (let i = 0; i < months; i++) out.months.push({ label: new Date(T0.getFullYear(), T0.getMonth() + i, 1), known: 0, estimated: 0 })
  for (const d of items) {
    if (d.amount == null) {
      out.todo++
      continue
    }
    const m = Math.max(0, (d.date!.getFullYear() - T0.getFullYear()) * 12 + d.date!.getMonth() - T0.getMonth())
    const slot = out.months[Math.min(m, months - 1)]
    if (d.estimate) {
      out.estimated += d.amount
      slot.estimated += d.amount
    } else {
      out.known += d.amount
      slot.known += d.amount
    }
  }
  return out
}

export const AREA_ICON: Record<string, string> = { Casa: "house", Veicoli: "car", Fisco: "landmark", Documenti: "id-card" }

export interface Toast {
  icon: string
  title: string
  body?: string
  tone?: "ok" | "warn"
  action?: { label: string; run: () => void }
}

export interface TgMessage {
  html: string
  warn?: boolean
  /** The deadline its "Fatto" button marks as done. */
  deadline?: string
}

/** What the chat and the arrivals can do to the demo. */
export interface Ctx {
  S: State
  /** Re-render after a change: `fresh` ids glow once, `notice` shows the app's live toast. */
  changed(fresh?: string[], notice?: boolean): void
  toast(t: Toast): void
  telegram(m: TgMessage): void
  go(view: View, focus?: string): void
  commit(title: string, files: string[], diff: string, undo?: () => void): string
  setDone(id: string, done: boolean): void
  ask(question: string): void
}
