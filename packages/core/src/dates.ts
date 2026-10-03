/** Calendar math on ISO dates (YYYY-MM-DD), independent of the time zone. */

const DAY = 86_400_000

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number)
  return [y, m, d]
}

function toIso(t: number): string {
  return new Date(t).toISOString().slice(0, 10)
}

function utc(iso: string): number {
  const [y, m, d] = parts(iso)
  return Date.UTC(y, m - 1, d)
}

export function addDays(iso: string, days: number): string {
  return toIso(utc(iso) + days * DAY)
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / DAY)
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Same day `months` later, clamped to the end of the month (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = parts(iso)
  const total = y * 12 + (m - 1) + months
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  const day = Math.min(d, daysInMonth(year, month))
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/** Today's date in a given time zone (default Europe/Rome, where the deadlines live). */
export function today(timeZone = "Europe/Rome", now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}
