/**
 * Deadlines: parsing deadlines.toml, recurrence, agenda.
 * Mirrors scripts/store.py, which the Python CLIs keep using; test/parity.test.ts checks they agree.
 */
import { parse, TomlDate } from "smol-toml"

import { addDays, addMonths, daysBetween } from "./dates.ts"
import {
  type Deadline,
  type Incomplete,
  type Occurrence,
  type Severity,
  SEVERITIES,
  type State,
} from "./schema.ts"

export class DataError extends Error {}

/** TOML values as JSON: dates become ISO strings. */
export function jsonable(v: unknown): unknown {
  if (v instanceof TomlDate) return v.isDate() ? v.toISOString().slice(0, 10) : v.toISOString()
  if (v instanceof Date) return v.toISOString()
  if (Array.isArray(v)) return v.map(jsonable)
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonable(x)]))
  return v
}

export function parseToml(text: string, file = "TOML"): Record<string, unknown> {
  try {
    return parse(text) as Record<string, unknown>
  } catch (e) {
    throw new DataError(`${file}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** Repeat unit and interval in months, null when the deadline does not repeat. */
export function stepMonths(d: Pick<Deadline, "id" | "repeat">): number | null {
  const r = d.repeat.trim().toLowerCase()
  if (r === "" || r === "none") return null
  if (r === "yearly") return 12
  if (r === "monthly") return 1
  const m = /^every (\d+) (years|months)$/.exec(r)
  if (m && Number(m[1]) > 0) return Number(m[1]) * (m[2] === "years" ? 12 : 1)
  throw new DataError(`${d.id}: invalid repeat: ${JSON.stringify(d.repeat)}`)
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback
}

export function parseDeadlines(text: string): Deadline[] {
  const raw = parseToml(text, "deadlines.toml").deadline ?? []
  if (!Array.isArray(raw)) throw new DataError("deadlines.toml: `deadline` must be an array of tables")
  const seen = new Set<string>()
  return raw.map((r: Record<string, unknown>) => {
    const id = str(r.id)
    if (!id) throw new DataError("deadlines.toml: a deadline has no id")
    if (seen.has(id)) throw new DataError(`duplicate id in deadlines.toml: ${id}`)
    seen.add(id)
    if (typeof r.title !== "string") throw new DataError(`${id}: missing title`)
    const date = isoDate(r.date)
    const until = isoDate(r.until)
    if (r.until !== undefined && until === null) throw new DataError(`${id}: until must be a date (YYYY-MM-DD)`)
    const severity = str(r.severity, "medium")
    if (!(SEVERITIES as readonly string[]).includes(severity)) {
      throw new DataError(`${id}: invalid severity: ${JSON.stringify(severity)} (allowed: ${SEVERITIES.join(", ")})`)
    }
    const d: Deadline = {
      id,
      title: r.title,
      area: str(r.area, "other"),
      date,
      repeat: str(r.repeat, "none"),
      until,
      severity: severity as Severity,
      remind_days: Array.isArray(r.remind_days) ? r.remind_days.map(Number) : [],
      amount: typeof r.amount === "number" ? r.amount : typeof r.amount === "bigint" ? Number(r.amount) : null,
      sensitive: r.sensitive === true,
      case: typeof r.case === "string" ? r.case : null,
      notes: str(r.notes),
      source: str(r.source),
    }
    stepMonths(d) // validate the repeat field right away
    return d
  })
}

function isoDate(v: unknown): string | null {
  return v instanceof TomlDate && v.isDate() ? v.toISOString().slice(0, 10) : null
}

/** Dates of `d` within [start, end], and not after its `until`. */
export function occurrences(d: Deadline, start: string, end: string): string[] {
  if (d.date === null) return []
  const last = d.until !== null && d.until < end ? d.until : end
  const step = stepMonths(d)
  if (step === null) return start <= d.date && d.date <= last ? [d.date] : []
  const found: string[] = []
  for (let i = 0; ; i++) {
    const o = addMonths(d.date, step * i)
    if (o > last) break
    if (o >= start) found.push(o)
  }
  return found
}

export function occurrenceKey(id: string, on: string): string {
  return `${id}@${on}`
}

/** Occurrences in the window, with done/overdue state, sorted by date then title. */
export function agenda(deadlines: Deadline[], state: State, today: string, back = 120, ahead = 400): Occurrence[] {
  const items: Occurrence[] = []
  for (const d of deadlines) {
    for (const on of occurrences(d, addDays(today, -back), addDays(today, ahead))) {
      const key = occurrenceKey(d.id, on)
      items.push({
        key,
        id: d.id,
        title: d.title,
        area: d.area,
        date: on,
        days: daysBetween(today, on),
        done_on: state.done[key] ?? null,
        repeat: d.repeat,
        severity: d.severity,
        amount: d.amount,
        sensitive: d.sensitive,
        case: d.case,
        notes: d.notes,
        source: d.source,
      })
    }
  }
  return items.sort((a, b) => (a.date === b.date ? cmp(a.title, b.title) : cmp(a.date, b.date)))
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function incomplete(deadlines: Deadline[]): Incomplete[] {
  return deadlines
    .filter((d) => d.date === null && d.until === null)
    .map(({ id, title, area, severity, notes }) => ({ id, title, area, severity, notes }))
}

/** Reminders due today: occurrences not done whose `remind_days` include the days left, plus overdue ones. */
export function reminders(deadlines: Deadline[], state: State, today: string): { due: Occurrence[]; overdue: Occurrence[] } {
  const byId = new Map(deadlines.map((d) => [d.id, d]))
  const open = agenda(deadlines, state, today, 30, 400).filter((o) => !o.done_on)
  return {
    due: open.filter((o) => o.days === 0 || (o.days > 0 && (byId.get(o.id)?.remind_days ?? []).includes(o.days))),
    overdue: open.filter((o) => o.days < 0),
  }
}
