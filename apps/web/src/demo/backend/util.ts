// Small helpers for the demo's pretend server: time, ids, randomness, waiting.
import { addDays, addMonths, today as todayIn } from "@autocratico/core"

export const ZONE = "Europe/Rome"

export const today = () => todayIn(ZONE)
export const nowIso = () => new Date().toISOString()
/** An ISO instant `days` from now, at `hh:mm` local-ish time (good enough for made-up history). */
export function at(days: number, hh = 9, mm = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hh, mm, 0, 0)
  return d.toISOString()
}
export const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString()
export { addDays, addMonths }

/** The next `month`/`day` on or after today (tax dates that come back every year). */
export function nextOn(month: number, day: number, from = today()): string {
  const y = Number(from.slice(0, 4))
  const iso = (year: number) =>
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  return iso(y) >= from ? iso(y) : iso(y + 1)
}

/** The last time `month`/`day` came, before today. */
export function lastOn(month: number, day: number, from = today()): string {
  const y = Number(from.slice(0, 4))
  const iso = (year: number) =>
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  return iso(y) < from ? iso(y) : iso(y - 1)
}

export const endOfMonth = (from = today()) =>
  addDays(addMonths(`${from.slice(0, 7)}-01`, 1), -1)
export const year = (from = today()) => Number(from.slice(0, 4))

export function hex(n: number): string {
  let s = ""
  const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(n / 2)))
  for (const b of bytes) s += b.toString(16).padStart(2, "0")
  return s.slice(0, n)
}
export const shortHash = () => hex(7)
export const uid = () => hex(12)

/** Deterministic random numbers for the made-up history (same register for everyone). */
export function prng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
}

export const round2 = (n: number) => Math.round(n * 100) / 100
