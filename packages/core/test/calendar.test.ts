import { describe, expect, it } from "vitest"

import { calendarMarkdown, createBody, fromGoogle, parseCalendarOp, patchBody } from "../src/index.ts"

describe("calendar blocks", () => {
  it("checks what the agent asks for", () => {
    expect(parseCalendarOp({ op: "create", title: "Visita", start: "2026-11-03T09:00", duration: 30 })).toEqual({
      op: { op: "create", account: null, calendar: null, event: { title: "Visita", start: "2026-11-03T09:00", end: "2026-11-03T09:30" } },
    })
    expect(parseCalendarOp({ op: "create", title: "Visita", start: "2026-02-30" })).toEqual({ error: "start: not a date (2026-02-30)" })
    expect(parseCalendarOp({ op: "create", title: "x", start: "2026-11-03T10:00", end: "2026-11-03T09:00" })).toEqual({ error: "end comes before start" })
    expect(parseCalendarOp({ op: "create", title: "x", start: "2026-11-03", reminders: [1, 2, 3, 4, 5, 6] })).toEqual({ error: "at most 5 reminders" })
    expect(parseCalendarOp({ op: "update", id: "abc", set: {} })).toEqual({ error: "nothing to change" })
    expect(parseCalendarOp({ op: "update", id: "abc", series: true, set: { start: "2026-11-04" } })).toMatchObject({ error: expect.stringContaining("series") })
    expect(parseCalendarOp({ op: "drop", id: "abc" })).toMatchObject({ error: expect.stringContaining("op must be") })
    expect(parseCalendarOp({ op: "create", title: "x", start: "2026-11-03", repeat: "RRULE:FREQ=WEEKLY;COUNT=4" })).toMatchObject({ op: { event: { repeat: "RRULE:FREQ=WEEKLY;COUNT=4" } } })
  })

  it("turns them into Google's bodies, all-day ends included", () => {
    const body = createBody({ title: "Ferie", start: "2026-08-10", end: "2026-08-14", busy: false }, "Europe/Rome")
    expect(body).toMatchObject({ start: { date: "2026-08-10" }, end: { date: "2026-08-15" }, transparency: "transparent", reminders: { useDefault: true } })
    const event = fromGoogle({ id: "e1", summary: "Ferie", start: { date: "2026-08-10" }, end: { date: "2026-08-15" }, colorId: "11" }, "me", "primary", "Europe/Rome")!
    expect(event).toMatchObject({ start: "2026-08-10", end: "2026-08-14", all_day: true, important: true })
    // Moved without an end: the same number of days.
    expect(patchBody({ start: "2026-09-01" }, event, "Europe/Rome")).toMatchObject({ start: { date: "2026-09-01" }, end: { date: "2026-09-06" } })
  })

  it("reads Google's times in the register's zone", () => {
    const e = fromGoogle({ id: "e2", summary: "Call", start: { dateTime: "2026-11-03T08:00:00Z" }, end: { dateTime: "2026-11-03T09:00:00Z" } }, "me", "primary", "Europe/Rome")!
    expect([e.start, e.end]).toEqual(["2026-11-03T09:00", "2026-11-03T10:00"])
    expect(fromGoogle({ id: "x", status: "cancelled", start: { date: "2026-11-03" } }, "me", "primary", "Europe/Rome")).toBeNull()
    const md = calendarMarkdown([{ account: "me", address: null, synced_at: null, error: null, calendars: [], events: [e] }], "2026-11-01", "Europe/Rome")
    expect(md).toContain("### 2026-11-03\n- 09:00–10:00 · Call · id e2")
  })
})
