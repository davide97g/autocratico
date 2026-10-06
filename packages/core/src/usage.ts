/**
 * The Claude subscription's limits, read from the `rate_limit_event` lines of `claude -p` and turned into a pace:
 * how much of a window is spent against how much of its time has gone by, and where that leads by the reset.
 */
import type { UsageLimits, UsageWindow } from "./schema.ts"

const HOUR = 3_600_000
const WINDOW_ID = /^[a-z][a-z0-9_]{0,39}$/

/** How long a window lasts, from its name; null for names we do not know. */
export function windowLength(id: string): number | null {
  if (id === "five_hour") return 5 * HOUR
  if (id === "seven_day" || id.startsWith("seven_day_")) return 7 * 24 * HOUR
  return null
}

const seconds = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? new Date(v * 1000).toISOString() : null)
const fraction = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(v, 10) : null)

/** `rate_limit_info` from Claude Code, in a fixed shape; null when there is nothing usable in it. */
export function parseRateLimit(info: unknown, at: string): UsageLimits | null {
  if (!info || typeof info !== "object") return null
  const i = info as Record<string, unknown>
  const windows: UsageWindow[] = []
  const unified = i.unifiedWindows
  if (unified && typeof unified === "object") {
    for (const [id, w] of Object.entries(unified as Record<string, unknown>)) {
      if (!WINDOW_ID.test(id) || !w || typeof w !== "object") continue
      const v = w as Record<string, unknown>
      windows.push({ id, utilization: fraction(v.utilization), resets_at: seconds(v.resetsAt) })
    }
  }
  // Older Claude Code versions name only the window the status is about.
  if (!windows.length && typeof i.rateLimitType === "string" && WINDOW_ID.test(i.rateLimitType)) {
    windows.push({ id: i.rateLimitType, utilization: fraction(i.utilization), resets_at: seconds(i.resetsAt) })
  }
  if (!windows.length) return null
  windows.sort((a, b) => (windowLength(a.id) ?? Infinity) - (windowLength(b.id) ?? Infinity) || a.id.localeCompare(b.id))
  return {
    at,
    status: typeof i.status === "string" ? i.status.slice(0, 40) : "allowed",
    windows,
    overage: {
      status: typeof i.overageStatus === "string" ? i.overageStatus.slice(0, 40) : null,
      using: i.isUsingOverage === true,
    },
  }
}

export type PaceState = "calm" | "warm" | "hot" | "limit" | "reset"

export type Pace = {
  id: string
  length: number
  /** When the window began and ends (ms). */
  start: number
  reset: number
  /** 0..1 of the window's time gone by now. */
  elapsed: number
  /** 0..1+ spent, as last reported (0 once the window has reset). */
  used: number
  /** Where the current rate leads by the reset. */
  projected: number
  /** When the current rate reaches 100% before the reset (ms), or null. */
  limitAt: number | null
  state: PaceState
}

/**
 * Early in a window a few minutes of work look like a runaway rate: the rate is measured over at least
 * this share of the window, so the projection only grows alarming once there is enough to go on.
 */
const MIN_SPAN = 0.08

export function pace(w: UsageWindow, measuredAt: string, now: number, rejected = false): Pace | null {
  const length = windowLength(w.id)
  if (!length || !w.resets_at || w.utilization === null) return null
  const reset = Date.parse(w.resets_at)
  const at = Date.parse(measuredAt)
  if (!Number.isFinite(reset) || !Number.isFinite(at)) return null
  const start = reset - length
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  if (now >= reset) {
    // A new window has begun since the last run: nothing spent in it as far as we know.
    return { id: w.id, length, start: reset, reset: reset + length, elapsed: clamp((now - reset) / length), used: 0, projected: 0, limitAt: null, state: "reset" }
  }
  const used = w.utilization
  const span = Math.max(at - start, length * MIN_SPAN)
  const rate = used / span
  const projected = used + rate * Math.max(0, reset - at)
  const limitAt = used >= 1 ? reset : projected > 1 ? at + (1 - used) / rate : null
  const state: PaceState = used >= 1 || (rejected && used >= 0.95) ? "limit" : projected > 1 ? "hot" : projected > 0.8 || used > 0.75 ? "warm" : "calm"
  return { id: w.id, length, start, reset, elapsed: clamp((now - start) / length), used, projected, limitAt, state }
}

/** The worst state among windows, for one status light. */
export function worstPace(paces: Pace[]): PaceState {
  const order: PaceState[] = ["reset", "calm", "warm", "hot", "limit"]
  return paces.reduce<PaceState>((worst, p) => (order.indexOf(p.state) > order.indexOf(worst) ? p.state : worst), "reset")
}
