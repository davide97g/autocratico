/**
 * The Claude subscription's usage, as seen by the agent: every `claude -p` run reports the limit windows
 * (shared with the user's other Claude use) and its own tokens and list-price cost. Kept in data/usage.json,
 * server-owned and not versioned; a week is enough for the Settings card.
 */
import { join } from "node:path"

import { type Usage as UsageData, UsageRun as UsageRunShape, type UsageLimits, type UsageRun, parseRateLimit } from "@autocratico/core"

import { locks, readJson, writeJson } from "./files.ts"

const KEEP_MS = 8 * 24 * 3_600_000
const MAX_SAMPLES = 2000
const MAX_RUNS = 3000
const EMPTY: UsageData = { limits: null, samples: [], runs: [] }

export class Usage {
  readonly file: string

  constructor(dir: string) {
    this.file = join(dir, "usage.json")
  }

  read(): UsageData {
    try {
      const u = readJson<UsageData>(this.file, EMPTY)
      return { limits: u.limits ?? null, samples: u.samples ?? [], runs: u.runs ?? [] }
    } catch {
      return EMPTY
    }
  }

  /** The last week, for GET /api/usage. */
  view(now = Date.now()): UsageData {
    const u = this.read()
    const since = new Date(now - 7 * 24 * 3_600_000).toISOString()
    return { limits: u.limits, samples: u.samples.filter((s) => s.at >= since), runs: u.runs.filter((r) => r.at >= since) }
  }

  /** A `rate_limit_info` from Claude Code. */
  limits(info: unknown): Promise<UsageLimits | null> {
    const limits = parseRateLimit(info, new Date().toISOString())
    if (!limits) return Promise.resolve(null)
    return this.#update((u) => {
      const windows = Object.fromEntries(limits.windows.flatMap((w) => (w.utilization === null ? [] : [[w.id, w.utilization]])))
      const last = u.samples.at(-1)
      // Several API calls in one run report the same numbers: one sample is enough.
      if (!last || JSON.stringify(last.windows) !== JSON.stringify(windows)) u.samples.push({ at: limits.at, windows })
      u.limits = limits
      return limits
    })
  }

  run(r: Omit<UsageRun, "at">): Promise<void> {
    const parsed = UsageRunShape.safeParse({ ...r, at: new Date().toISOString() })
    if (!parsed.success) return Promise.resolve()
    return this.#update((u) => void u.runs.push(parsed.data))
  }

  #update<T>(fn: (u: UsageData) => T): Promise<T> {
    return locks.run(this.file, () => {
      const u = this.read()
      const value = fn(u)
      const since = new Date(Date.now() - KEEP_MS).toISOString()
      writeJson(this.file, {
        limits: u.limits,
        samples: u.samples.filter((s) => s.at >= since).slice(-MAX_SAMPLES),
        runs: u.runs.filter((r) => r.at >= since).slice(-MAX_RUNS),
      })
      return value
    })
  }
}

const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0)

/** Tokens of a `result` line's `usage`. */
export function tokens(usage: unknown): Pick<UsageRun, "input" | "output" | "cache_read" | "cache_write"> {
  const u = (usage && typeof usage === "object" ? usage : {}) as Record<string, unknown>
  return { input: int(u.input_tokens), output: int(u.output_tokens), cache_read: int(u.cache_read_input_tokens), cache_write: int(u.cache_creation_input_tokens) }
}
