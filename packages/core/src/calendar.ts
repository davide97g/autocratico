/**
 * Google Calendar: the shapes of the copy kept in the data folder (calendar/<account>.json, one per
 * Google account), the events the chat agent asks for in ```calendar blocks, and how they become
 * Google's event bodies. The server talks to Google (apps/server/src/calendar.ts); the agents read
 * the copy, mostly calendar/agenda.md (`calendarMarkdown`).
 *
 * Times are local to the server's time zone: "YYYY-MM-DDTHH:MM" for timed events, "YYYY-MM-DD"
 * for all-day ones, whose `end` is the last day (inclusive; Google's own end date is the day after).
 */
import { z } from "zod"

import { addDays } from "./dates.ts"
import { offsetMs } from "./actions.ts"
import { GMAIL_NAME } from "./schema.ts"

/** Where Google sends the browser back after a Calendar sign-in, with a "Web application" OAuth client. */
export const CALENDAR_REDIRECT_PATH = "/oauth/calendar"
/** Events and the list of calendars: no sharing, no deleting whole calendars, no other Google data. */
export const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.calendarlist.readonly"] as const
/** Account names follow the Gmail rule (calendar.toml, secrets/calendar/<name>.json, calendar/<name>.json). */
export const CALENDAR_NAME = GMAIL_NAME
/** The window copied from Google, in days from today. */
export const CALENDAR_PAST_DAYS = 90
export const CALENDAR_FUTURE_DAYS = 400
/** Google's "Tomato": the color of important events. */
export const IMPORTANT_COLOR = "11"
/** Reminders an important event gets when none are given: the day before and an hour before. */
export const IMPORTANT_REMINDERS = [1440, 60]
/** Google accepts at most 5 reminder overrides, up to 4 weeks before. */
const MAX_REMINDERS = 5
const MAX_REMINDER_MINUTES = 40_320

export const CalendarReminder = z.object({ method: z.enum(["popup", "email"]), minutes: z.number().int() })
export type CalendarReminder = z.infer<typeof CalendarReminder>

export const CalendarEvent = z.object({
  id: z.string(),
  account: z.string(),
  /** Calendar id at Google ("primary" is stored as the account's own address). */
  calendar: z.string(),
  title: z.string(),
  /** "YYYY-MM-DD" (all day) or "YYYY-MM-DDTHH:MM", local to the server's time zone. */
  start: z.string(),
  /** Same form as start; for all-day events the last day, inclusive. */
  end: z.string(),
  all_day: z.boolean(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  /** The event's own reminders; null when it uses the calendar's defaults. */
  reminders: z.array(CalendarReminder).nullable(),
  important: z.boolean(),
  /** A deadline of deadlines.toml this event is about (set by Autocratico). */
  deadline: z.string().nullable(),
  /** The series this occurrence belongs to (recurring events are copied one occurrence at a time). */
  recurring: z.string().nullable(),
  /** False for events marked "free". */
  busy: z.boolean(),
  /** The event in Google Calendar's web app. */
  link: z.string().nullable(),
  /** Created by Autocratico. */
  ours: z.boolean(),
  updated: z.string().nullable(),
})
export type CalendarEvent = z.infer<typeof CalendarEvent>

export const CalendarInfo = z.object({
  id: z.string(),
  title: z.string(),
  primary: z.boolean(),
  /** Background color at Google, "#rrggbb". */
  color: z.string().nullable(),
  /** owner, writer, reader, freeBusyReader: only owner and writer calendars take new events. */
  role: z.string(),
  /** Copied into calendar/<account>.json. */
  synced: z.boolean(),
  /** Where new events go when the agent names no calendar. */
  default: z.boolean(),
})
export type CalendarInfo = z.infer<typeof CalendarInfo>

/** calendar/<account>.json, written by the server only. */
export const CalendarMirror = z.object({
  account: z.string(),
  address: z.string().nullable(),
  synced_at: z.string().nullable(),
  /** Why the last sync failed, if it did; the events are those of the sync before. */
  error: z.string().nullable(),
  calendars: z.array(CalendarInfo),
  events: z.array(CalendarEvent),
})
export type CalendarMirror = z.infer<typeof CalendarMirror>

export const CalendarAccount = z.object({
  name: z.string(),
  /** reconnect: the token belongs to an OAuth client that has been replaced since, or lacks a scope. */
  state: z.enum(["connected", "disconnected", "reconnect"]),
  address: z.string().nullable(),
  synced_at: z.string().nullable(),
  error: z.string().nullable(),
  calendars: z.array(CalendarInfo),
  events: z.number().int(),
})
export type CalendarAccount = z.infer<typeof CalendarAccount>

export const CalendarSetup = z.object({
  /** The OAuth client is the one uploaded for Gmail (secrets/credentials.json). */
  client: z.object({ type: z.enum(["web", "installed"]), redirects: z.array(z.string()) }).nullable(),
  accounts: z.array(CalendarAccount),
})
export type CalendarSetup = z.infer<typeof CalendarSetup>

export const CalendarAccountInput = z.object({
  name: z.string().regex(CALENDAR_NAME),
  /** Calendar ids to copy; empty or missing: the primary one. */
  calendars: z.array(z.string().min(1).max(300)).max(30).optional(),
  /** Where new events go; missing: the primary one. */
  default: z.string().min(1).max(300).optional(),
})
export type CalendarAccountInput = z.infer<typeof CalendarAccountInput>

/** An appointment the background agent found in a document, waiting for the user's yes (calendar/proposals.json). */
export const CalendarProposal = z.object({
  id: z.string(),
  created: z.string(),
  /** The inbox item it comes from. */
  item: z.string().nullable(),
  title: z.string(),
  start: z.string(),
  end: z.string(),
  all_day: z.boolean(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  important: z.boolean(),
  deadline: z.string().nullable(),
  status: z.enum(["open", "added", "dismissed"]),
  /** The event created from it. */
  event: z.string().nullable(),
})
export type CalendarProposal = z.infer<typeof CalendarProposal>

/** GET /api/calendar: the copy for the Agenda view. */
export const CalendarAgenda = z.object({
  accounts: z.array(CalendarAccount),
  events: z.array(CalendarEvent),
  proposals: z.array(CalendarProposal),
})
export type CalendarAgenda = z.infer<typeof CalendarAgenda>

// ---------- what the agent asks for ----------

/** What an event is made of, as the agent writes it (and as a proposal carries it). */
export type EventFields = {
  title: string
  start: string
  /** Missing: an hour after a timed start, the same day for an all-day one. */
  end?: string
  location?: string | null
  description?: string | null
  /** Missing: the calendar's defaults (an important event: the day before and an hour before). */
  reminders?: CalendarReminder[]
  important?: boolean
  deadline?: string | null
  /** RRULE for Google, from "daily", "weekly", "monthly", "yearly" or an RRULE line. */
  repeat?: string | null
  busy?: boolean
}

export type CalendarOp =
  | { op: "create"; account: string | null; calendar: string | null; event: EventFields }
  | { op: "update"; account: string | null; id: string; series: boolean; set: Partial<EventFields> }
  | { op: "delete"; account: string | null; id: string; series: boolean }

const DATE = /^\d{4}-\d{2}-\d{2}$/
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?$/
const REPEATS: Record<string, string> = { daily: "RRULE:FREQ=DAILY", weekly: "RRULE:FREQ=WEEKLY", monthly: "RRULE:FREQ=MONTHLY", yearly: "RRULE:FREQ=YEARLY" }
const RRULE = /^RRULE:[A-Z0-9=;,+:-]{6,200}$/
const DEADLINE_ID = /^[\w-]{1,80}$/

class OpError extends Error {}

function realDate(d: string): boolean {
  return DATE.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d
}

/** "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" (seconds dropped); throws on anything else. */
function when(v: unknown, field: string): string {
  if (typeof v !== "string") throw new OpError(`${field} missing`)
  const s = v.trim()
  if (DATE.test(s)) {
    if (!realDate(s)) throw new OpError(`${field}: not a date (${s})`)
    return s
  }
  const m = DATE_TIME.exec(s)
  if (!m || !realDate(m[1]) || Number(m[2]) > 23 || Number(m[3]) > 59) throw new OpError(`${field}: expected YYYY-MM-DD or YYYY-MM-DDTHH:MM in local time (${s.slice(0, 40)})`)
  return `${m[1]}T${m[2]}:${m[3]}`
}

/** Local "YYYY-MM-DDTHH:MM" plus minutes (wall-clock arithmetic: Google reads it in the zone). */
export function addMinutes(local: string, minutes: number): string {
  const t = Date.parse(`${local}:00Z`) + minutes * 60_000
  return new Date(t).toISOString().slice(0, 16)
}

function text(v: unknown, field: string, max: number): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== "string") throw new OpError(`${field} must be text`)
  return v.trim().slice(0, max) || null
}

function reminders(v: unknown): CalendarReminder[] {
  if (!Array.isArray(v)) throw new OpError("reminders must be a list of minutes before")
  const out = v.map((r): CalendarReminder => {
    const o = typeof r === "number" ? { minutes: r, method: "popup" } : (r as Record<string, unknown> | null)
    const minutes = o?.minutes
    const method = o?.method ?? "popup"
    if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 0 || minutes > MAX_REMINDER_MINUTES) throw new OpError("reminders: minutes from 0 to 40320 (4 weeks)")
    if (method !== "popup" && method !== "email") throw new OpError('reminders: method "popup" or "email"')
    return { method, minutes }
  })
  if (out.length > MAX_REMINDERS) throw new OpError("at most 5 reminders")
  return out
}

function repeat(v: unknown): string | null {
  if (v === null || v === undefined || v === "none") return null
  if (typeof v !== "string") throw new OpError("repeat must be text")
  const s = v.trim()
  const rule = REPEATS[s.toLowerCase()] ?? (RRULE.test(s) ? s : null)
  if (!rule) throw new OpError('repeat: "daily", "weekly", "monthly", "yearly" or an RRULE line')
  return rule
}

/** The fields present in `o`, checked; `create` requires a title and a start. */
function fields(o: Record<string, unknown>, create: boolean): Partial<EventFields> {
  const f: Partial<EventFields> = {}
  if (create || "title" in o) {
    const title = text(o.title, "title", 200)
    if (!title) throw new OpError("title missing")
    f.title = title
  }
  if (create || "start" in o) f.start = when(o.start, "start")
  if (o.end !== undefined && o.end !== null) f.end = when(o.end, "end")
  if (o.duration !== undefined) {
    const d = o.duration
    if (typeof d !== "number" || !Number.isInteger(d) || d < 1 || d > 20_160) throw new OpError("duration: minutes, from 1 to 20160")
    if (f.end) throw new OpError("give end or duration, not both")
    if (!f.start || DATE.test(f.start)) throw new OpError("duration needs a start with a time")
    f.end = addMinutes(f.start, d)
  }
  if ("location" in o) f.location = text(o.location, "location", 300)
  if ("description" in o) f.description = text(o.description, "description", 4000)
  if (o.reminders !== undefined && o.reminders !== null) f.reminders = reminders(o.reminders)
  if ("important" in o) {
    if (typeof o.important !== "boolean") throw new OpError("important must be true or false")
    f.important = o.important
  }
  if ("busy" in o) {
    if (typeof o.busy !== "boolean") throw new OpError("busy must be true or false")
    f.busy = o.busy
  }
  if ("deadline" in o) {
    const d = o.deadline
    if (d !== null && (typeof d !== "string" || !DEADLINE_ID.test(d))) throw new OpError("deadline: the id of a deadline")
    f.deadline = d as string | null
  }
  if ("repeat" in o) f.repeat = repeat(o.repeat)
  if (f.start && f.end) checkOrder(f.start, f.end)
  return f
}

function checkOrder(start: string, end: string) {
  const allDay = DATE.test(start)
  if (allDay !== DATE.test(end)) throw new OpError("start and end must both be dates, or both dates with a time")
  if (allDay ? end < start : end <= start) throw new OpError("end comes before start")
}

/** A ```calendar block's object, checked: the operation, or why not. */
export function parseCalendarOp(raw: unknown): { op: CalendarOp } | { error: string } {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new OpError("not an object")
    const o = raw as Record<string, unknown>
    const account = o.account === undefined || o.account === null ? null : String(o.account)
    if (account !== null && !CALENDAR_NAME.test(account)) throw new OpError("unknown account")
    const id = typeof o.id === "string" && /^[\w@.-]{1,1024}$/.test(o.id) ? o.id : null
    const series = o.series === true
    if (o.op === "create") {
      const calendar = typeof o.calendar === "string" && o.calendar.trim() ? o.calendar.trim().slice(0, 300) : null
      return { op: { op: "create", account, calendar, event: fields(o, true) as EventFields } }
    }
    if (o.op === "update") {
      if (!id) throw new OpError("id of the event missing")
      const set = o.set && typeof o.set === "object" && !Array.isArray(o.set) ? fields(o.set as Record<string, unknown>, false) : null
      if (!set || !Object.keys(set).length) throw new OpError("nothing to change")
      if (series && (set.start || set.end || "repeat" in set)) throw new OpError("the dates of a whole series are changed in Google Calendar itself")
      return { op: { op: "update", account, id, series, set } }
    }
    if (o.op === "delete") {
      if (!id) throw new OpError("id of the event missing")
      return { op: { op: "delete", account, id, series } }
    }
    throw new OpError('op must be "create", "update" or "delete"')
  } catch (e) {
    if (e instanceof OpError) return { error: e.message }
    throw e
  }
}

// ---------- Google's shapes ----------

type GoogleTime = { date?: string; dateTime?: string; timeZone?: string }
export type GoogleEvent = {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  start?: GoogleTime
  end?: GoogleTime
  htmlLink?: string
  recurringEventId?: string
  recurrence?: string[]
  reminders?: { useDefault?: boolean; overrides?: { method?: string; minutes?: number }[] }
  colorId?: string
  transparency?: string
  eventType?: string
  updated?: string
  extendedProperties?: { private?: Record<string, string> }
}

/** An instant as local "YYYY-MM-DDTHH:MM" in `timeZone`. */
export function localDateTime(iso: string, timeZone: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso.slice(0, 16)
  return new Date(t + offsetMs(timeZone, new Date(t))).toISOString().slice(0, 16)
}

/** Google's event as it is kept in the copy; null for cancelled events and working-location entries. */
export function fromGoogle(g: GoogleEvent, account: string, calendar: string, timeZone: string): CalendarEvent | null {
  if (!g?.id || g.status === "cancelled" || g.eventType === "workingLocation" || !g.start) return null
  const allDay = Boolean(g.start.date)
  const start = allDay ? g.start.date! : g.start.dateTime ? localDateTime(g.start.dateTime, timeZone) : null
  if (!start) return null
  let end = allDay ? (g.end?.date ? addDays(g.end.date, -1) : start) : g.end?.dateTime ? localDateTime(g.end.dateTime, timeZone) : start
  if (end < start) end = start
  const own = g.extendedProperties?.private ?? {}
  const overrides = g.reminders?.overrides ?? []
  return {
    id: g.id,
    account,
    calendar,
    title: (g.summary ?? "").trim() || "(no title)",
    start,
    end,
    all_day: allDay,
    location: g.location?.trim() || null,
    description: g.description?.trim().slice(0, 4000) || null,
    reminders:
      g.reminders?.useDefault === false
        ? overrides
            .filter((r) => typeof r.minutes === "number")
            .map((r) => ({ method: r.method === "email" ? ("email" as const) : ("popup" as const), minutes: r.minutes! }))
        : null,
    important: own.autocratico_important ? own.autocratico_important === "1" : g.colorId === IMPORTANT_COLOR,
    deadline: own.autocratico_deadline || null,
    recurring: g.recurringEventId ?? null,
    busy: g.transparency !== "transparent",
    link: typeof g.htmlLink === "string" && g.htmlLink.startsWith("https://www.google.com/calendar/") ? g.htmlLink : null,
    ours: own.autocratico === "1",
    updated: g.updated ?? null,
  }
}

function googleTime(v: string, timeZone: string, end: boolean): GoogleTime {
  // All-day: Google's end is the day after the last one.
  if (DATE.test(v)) return { date: end ? addDays(v, 1) : v }
  return { dateTime: `${v}:00`, timeZone }
}

/** Start and end as Google wants them, with the defaults: an hour, or the same day. */
function span(start: string, end: string | undefined, timeZone: string) {
  const last = end ?? (DATE.test(start) ? start : addMinutes(start, 60))
  checkOrder(start, last)
  return { start: googleTime(start, timeZone, false), end: googleTime(last, timeZone, true) }
}

function reminderBody(list: CalendarReminder[] | undefined, important: boolean) {
  const chosen = list ?? (important ? IMPORTANT_REMINDERS.map((minutes) => ({ method: "popup" as const, minutes })) : null)
  return chosen ? { useDefault: false, overrides: chosen } : { useDefault: true }
}

/** The body of a new event. */
export function createBody(f: EventFields, timeZone: string): Record<string, unknown> {
  const important = f.important === true
  return {
    summary: f.title,
    ...span(f.start, f.end, timeZone),
    ...(f.location ? { location: f.location } : {}),
    ...(f.description ? { description: f.description } : {}),
    reminders: reminderBody(f.reminders, important),
    ...(important ? { colorId: IMPORTANT_COLOR } : {}),
    ...(f.busy === false ? { transparency: "transparent" } : {}),
    ...(f.repeat ? { recurrence: [f.repeat] } : {}),
    extendedProperties: {
      private: { autocratico: "1", autocratico_important: important ? "1" : "0", ...(f.deadline ? { autocratico_deadline: f.deadline } : {}) },
    },
  }
}

/** The PATCH body of a change to `existing` (null removes a field at Google). */
export function patchBody(set: Partial<EventFields>, existing: CalendarEvent, timeZone: string): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (set.title) body.summary = set.title
  if (set.start || set.end) {
    const start = set.start ?? existing.start
    let end = set.end
    if (!end) {
      // Moved: keep the length it had (a whole number of days, or of minutes).
      if (DATE.test(start) !== existing.all_day) end = undefined
      else if (existing.all_day) end = addDays(start, Math.round((Date.parse(existing.end) - Date.parse(existing.start)) / 86_400_000))
      else end = addMinutes(start, Math.round((Date.parse(`${existing.end}:00Z`) - Date.parse(`${existing.start}:00Z`)) / 60_000))
    }
    Object.assign(body, span(start, end, timeZone))
  }
  if ("location" in set) body.location = set.location ?? null
  if ("description" in set) body.description = set.description ?? null
  if ("busy" in set) body.transparency = set.busy === false ? "transparent" : "opaque"
  if ("repeat" in set) body.recurrence = set.repeat ? [set.repeat] : null
  const important = set.important ?? existing.important
  if ("important" in set) body.colorId = important ? IMPORTANT_COLOR : null
  if (set.reminders || (set.important === true && !existing.reminders)) body.reminders = reminderBody(set.reminders, important)
  if ("important" in set || "deadline" in set) {
    const deadline = "deadline" in set ? set.deadline : existing.deadline
    body.extendedProperties = {
      private: { autocratico_important: important ? "1" : "0", autocratico_deadline: deadline ?? null },
    }
  }
  return body
}

/** Timed, busy events of the same account that overlap [start, end). */
export function overlapping(events: CalendarEvent[], start: string, end: string | undefined, skip?: string): CalendarEvent[] {
  if (DATE.test(start)) return []
  const last = end ?? addMinutes(start, 60)
  return events.filter((e) => !e.all_day && e.busy && e.id !== skip && e.start < last && e.end > start)
}

// ---------- the copy, for the agents ----------

const AGENDA_PAST_DAYS = 30
const AGENDA_FUTURE_DAYS = 365
const AGENDA_MAX_EVENTS = 1500

function minutesLabel(m: number): string {
  if (m && m % 1440 === 0) return `${m / 1440}d`
  if (m && m % 60 === 0) return `${m / 60}h`
  return `${m}m`
}

/** One line per event, for agenda.md and the chat's answers. */
export function eventLine(e: CalendarEvent): string {
  const time = e.all_day
    ? e.end !== e.start ? `all day, until ${e.end}` : "all day"
    : `${e.start.slice(11)}–${e.end.slice(0, 10) === e.start.slice(0, 10) ? e.end.slice(11) : e.end.replace("T", " ")}`
  const bits = [
    time,
    e.title,
    e.location && `@ ${e.location}`,
    e.important && "IMPORTANT",
    !e.busy && "free",
    e.reminders && `reminders ${e.reminders.length ? e.reminders.map((r) => `${minutesLabel(r.minutes)}${r.method === "email" ? " email" : ""}`).join(", ") : "none"}`,
    e.deadline && `deadline ${e.deadline}`,
    e.recurring && `series ${e.recurring}`,
    `id ${e.id}`,
  ]
  return bits.filter(Boolean).join(" · ")
}

/**
 * calendar/agenda.md: every account's events from a month ago to a year ahead, by day, with the ids
 * the agent names in ```calendar blocks. Descriptions are left to calendar/<account>.json.
 */
export function calendarMarkdown(mirrors: CalendarMirror[], today: string, timeZone: string): string {
  const from = addDays(today, -AGENDA_PAST_DAYS)
  const to = addDays(today, AGENDA_FUTURE_DAYS)
  const lines = [
    "# Google Calendar (copy)",
    "",
    `Written by the server after each sync: do not edit. Times are local (${timeZone}). From ${from} to ${to}; every event, with its description, is in calendar/<account>.json.`,
    "",
  ]
  for (const m of mirrors) {
    lines.push(`## Account ${m.account}${m.address ? ` (${m.address})` : ""}`, "")
    lines.push(`Synced: ${m.synced_at ?? "never"}${m.error ? ` · last sync failed: ${m.error}` : ""}`)
    for (const c of m.calendars.filter((c) => c.synced)) {
      lines.push(`- calendar \`${c.id}\` «${c.title}»${c.primary ? " primary" : ""}${c.default ? " · default for new events" : ""}${c.role === "owner" || c.role === "writer" ? "" : " · read-only"}`)
    }
    const events = m.events
      .filter((e) => e.end >= from && e.start.slice(0, 10) <= to)
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, AGENDA_MAX_EVENTS)
    let day = ""
    for (const e of events) {
      const d = e.start.slice(0, 10)
      if (d !== day) {
        day = d
        lines.push("", `### ${d}${d === today ? " (today)" : ""}`)
      }
      const calendar = m.calendars.find((c) => c.id === e.calendar)
      lines.push(`- ${eventLine(e)}${calendar && !calendar.default ? ` · calendar ${calendar.id}` : ""}`)
    }
    if (!events.length) lines.push("", "No events in this window.")
    lines.push("")
  }
  return lines.join("\n")
}

/** Events of a day, all accounts, in time order (all-day ones first). */
export function eventsOn(mirrors: CalendarMirror[], day: string): CalendarEvent[] {
  return mirrors
    .flatMap((m) => m.events)
    .filter((e) => e.start.slice(0, 10) <= day && e.end.slice(0, 10) >= day && (e.all_day || e.start.slice(0, 10) === day || e.end.slice(11) !== "00:00"))
    .sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.start.localeCompare(b.start))
}
