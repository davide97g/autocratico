import { describe, expect, it } from "vitest"

import { pace, parseRateLimit, worstPace } from "../src/index.ts"

const H = 3_600_000
const at = (ms: number) => new Date(ms).toISOString()

describe("parseRateLimit", () => {
  it("reads the unified windows, shortest first", () => {
    const l = parseRateLimit(
      {
        status: "allowed",
        resetsAt: 1791289200,
        rateLimitType: "five_hour",
        overageStatus: "rejected",
        isUsingOverage: false,
        unifiedWindows: { seven_day: { utilization: 0.59, resetsAt: 1791298800 }, five_hour: { utilization: 0.25, resetsAt: 1791289200 } },
      },
      "2026-10-06T09:17:05.000Z"
    )
    expect(l?.windows.map((w) => w.id)).toEqual(["five_hour", "seven_day"])
    expect(l?.windows[0]).toEqual({ id: "five_hour", utilization: 0.25, resets_at: new Date(1791289200 * 1000).toISOString() })
    expect(l?.overage).toEqual({ status: "rejected", using: false })
  })

  it("falls back to the single window and ignores junk", () => {
    expect(parseRateLimit({ status: "allowed", rateLimitType: "five_hour", resetsAt: 1791289200 }, "x")?.windows).toEqual([
      { id: "five_hour", utilization: null, resets_at: new Date(1791289200 * 1000).toISOString() },
    ])
    expect(parseRateLimit({ unifiedWindows: { "../x": { utilization: 1 } } }, "x")).toBeNull()
    expect(parseRateLimit("nope", "x")).toBeNull()
  })
})

describe("pace", () => {
  const reset = Date.UTC(2026, 9, 6, 15)
  const w = (utilization: number) => ({ id: "five_hour", utilization, resets_at: at(reset) })

  it("projects the current rate to the reset", () => {
    // 2.5 h into the window, 25% spent: 50% by the reset.
    const p = pace(w(0.25), at(reset - 2.5 * H), reset - 2.5 * H)!
    expect(p.elapsed).toBeCloseTo(0.5)
    expect(p.projected).toBeCloseTo(0.5)
    expect(p.state).toBe("calm")
    expect(p.limitAt).toBeNull()
  })

  it("says when the limit comes at this pace", () => {
    // 1 h in, 40% spent: 100% 2.5 h after the start.
    const p = pace(w(0.4), at(reset - 4 * H), reset - 4 * H)!
    expect(p.state).toBe("hot")
    expect(p.limitAt).toBe(reset - 5 * H + 2.5 * H)
  })

  it("does not panic over the first minutes", () => {
    const p = pace(w(0.05), at(reset - 5 * H + 60_000), reset - 5 * H + 60_000)!
    expect(p.projected).toBeLessThan(1)
  })

  it("starts over once the window has reset", () => {
    const p = pace(w(0.9), at(reset - H), reset + H)!
    expect(p.state).toBe("reset")
    expect(p.used).toBe(0)
    expect(worstPace([p, pace(w(1), at(reset - H), reset - H)!])).toBe("limit")
  })
})
