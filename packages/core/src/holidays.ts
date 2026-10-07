/**
 * Italian public holidays and the rules that move a deadline off them. Mirrors scripts/store.py
 * (test/parity.test.ts checks they agree). A fork for another country changes `holidays()` and,
 * if its rules differ, `shiftDate()`.
 *
 * - `workday`: a deadline that falls on a Saturday, Sunday or public holiday moves to the next
 *   working day (for tax deadlines: art. 7 c. 1 lett. h DL 70/2011).
 * - `tax`: the same, and payments due from 1 to 20 August move to 20 August first (summer
 *   suspension, art. 37 c. 11-bis DL 223/2006).
 */
import { addDays } from "./dates.ts"

export const SHIFTS = ["none", "workday", "tax"] as const
export type Shift = (typeof SHIFTS)[number]

const pad = (n: number) => String(n).padStart(2, "0")

/** Easter Sunday (Gregorian calendar, anonymous algorithm). */
export function easter(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${pad(month)}-${pad(day)}`
}

/** National public holidays of a year, as ISO dates. */
export function holidays(year: number): Set<string> {
  const fixed = ["01-01", "01-06", "04-25", "05-01", "06-02", "08-15", "11-01", "12-08", "12-25", "12-26"]
  if (year >= 2026) fixed.push("10-04") // St Francis, a holiday again from 2026 (L. 151/2025)
  return new Set([...fixed.map((md) => `${year}-${md}`), addDays(easter(year), 1)])
}

/** Monday to Friday and not a public holiday. */
export function isWorkday(iso: string): boolean {
  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return weekday !== 0 && weekday !== 6 && !holidays(Number(iso.slice(0, 4))).has(iso)
}

/** The day a deadline due on `iso` actually falls on under `shift`. */
export function shiftDate(iso: string, shift: Shift): string {
  if (shift === "none") return iso
  let d = iso
  if (shift === "tax" && d.slice(5, 7) === "08" && d.slice(8) < "20") d = `${d.slice(0, 8)}20`
  while (!isWorkday(d)) d = addDays(d, 1)
  return d
}
