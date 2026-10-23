// Google Calendar in the demo: a made-up account with events around today, the agent's ```calendar
// blocks carried out on it as apps/server/src/calendar.ts does at Google (checked by the same
// parseCalendarOp), and an appointment "found" in a document waiting for the visitor's yes.
import {
  addMinutes,
  type CalendarAccount,
  type CalendarAgenda,
  type CalendarEvent,
  type CalendarInfo,
  type CalendarOp,
  type CalendarProposal,
  type CalendarSetup,
  IMPORTANT_REMINDERS,
  overlapping,
  parseCalendarOp,
} from "@autocratico/core"

import type { Lang } from "./register"
import { changed, state } from "./state"
import { addDays, hex, nowIso, today } from "./util"

export const CALENDAR_ACCOUNT = "personale"
const ADDRESS = "maria.rossi@example.com"

export type DemoCalendar = {
  synced_at: string
  calendars: CalendarInfo[]
  events: CalendarEvent[]
  proposals: CalendarProposal[]
  /** Accounts added in Settings: they stay "not connected", there is no Google behind the demo. */
  others: string[]
}

const PRIMARY = ADDRESS
const WORK = "lavoro-demo@group.calendar.google.com"
const HOLIDAYS = "it.italian#holiday@group.v.calendar.google.com"

function event(over: Partial<CalendarEvent> & Pick<CalendarEvent, "title" | "start">): CalendarEvent {
  const allDay = !over.start.includes("T")
  return {
    id: hex(26),
    account: CALENDAR_ACCOUNT,
    calendar: PRIMARY,
    end: allDay ? over.start : addMinutes(over.start, 60),
    all_day: allDay,
    location: null,
    description: null,
    reminders: null,
    important: false,
    deadline: null,
    recurring: null,
    busy: true,
    link: null,
    ours: false,
    updated: nowIso(),
    ...over,
  }
}

/** The visitor's calendar: a week that looks lived in, dates relative to today. */
export function seedCalendar(): DemoCalendar {
  const d = (n: number, time?: string) => (time ? `${addDays(today(), n)}T${time}` : addDays(today(), n))
  const gym = hex(26)
  const standup = hex(26)
  // The weekend away starts on the Friday after next.
  const friday = ((5 - new Date(`${today()}T12:00:00`).getDay() + 7) % 7) + 7
  const events: CalendarEvent[] = [
    ...[0, 7, 14, 21, 28].map((n) => event({ title: "Palestra", start: d(n, "18:30"), end: d(n, "19:30"), recurring: gym, id: `${gym}_${d(n).replace(/-/g, "")}` })),
    event({
      title: "Visita cardiologica",
      start: d(1, "09:00"),
      end: d(1, "09:30"),
      location: "Poliambulatorio, via Garibaldi 5",
      description: "Portare l'impegnativa del medico, la tessera sanitaria e gli esami del sangue di settembre.",
      important: true,
      reminders: IMPORTANT_REMINDERS.map((minutes) => ({ method: "popup" as const, minutes })),
      ours: true,
    }),
    event({ title: "Call progetto", start: d(1, "14:00"), end: d(1, "15:00"), calendar: WORK }),
    // Weekdays: the team's stand-up, a series in the work calendar.
    ...Array.from({ length: 36 }, (_, i) => i - 14)
      .filter((n) => ![0, 6].includes(new Date(`${d(n)}T12:00:00`).getDay()))
      .map((n) => event({ title: "Stand-up", start: d(n, "09:30"), end: d(n, "09:45"), calendar: WORK, recurring: standup, id: `${standup}_${d(n).replace(/-/g, "")}` })),
    event({ title: "Pranzo con Giulia", start: d(-2, "12:30"), end: d(-2, "14:00"), location: "Trattoria da Mario" }),
    event({ title: "Corsa al parco", start: d(-1, "07:30"), end: d(-1, "08:30"), busy: false }),
    event({ title: "Call con il commercialista", start: d(0, "11:00"), end: d(0, "12:00"), description: "Dubbi sul 730: spese mediche e bonus facciata." }),
    event({ title: "Ritiro raccomandata", start: d(0, "16:30"), end: d(0, "17:00"), location: "Ufficio postale, via Manzoni", important: true, reminders: [{ method: "popup", minutes: 60 }], ours: true }),
    event({ title: "Colloquio con le maestre", start: d(2, "17:00"), end: d(2, "18:00"), location: "Scuola primaria Rodari" }),
    event({ title: "Cena da mamma", start: d(5, "20:00"), end: d(5, "22:30") }),
    event({ title: "Riunione di condominio", start: d(2, "21:00"), end: d(2, "22:30"), location: "Via Roma 12, sala comune" }),
    event({ title: "Compleanno di Luca", start: d(3), busy: false }),
    event({ title: "Sprint review", start: d(4, "10:00"), end: d(4, "11:00"), calendar: WORK }),
    event({
      title: "CAF: documenti per il 730",
      start: d(6, "10:30"),
      end: d(6, "11:15"),
      location: "CAF, piazza Duomo 3",
      description: "Portare CU, scontrini delle spese mediche e ricevute dell'asilo.",
      important: true,
      reminders: [{ method: "popup", minutes: 1440 }],
      ours: true,
    }),
    event({ title: "Revisione auto", start: d(9, "08:30"), end: d(9, "09:30"), location: "Officina Bianchi", important: true, ours: true, deadline: "revisione" }),
    event({ title: "Weekend a Torino", start: d(friday), end: d(friday + 2), busy: false }),
    event({ title: "Festa nazionale", start: d(20), calendar: HOLIDAYS, busy: false }),
  ]
  return {
    synced_at: nowIso(),
    calendars: [
      { id: PRIMARY, title: "Maria", primary: true, color: "#039be5", role: "owner", synced: true, default: true },
      { id: WORK, title: "Lavoro", primary: false, color: "#33b679", role: "writer", synced: true, default: false },
      { id: HOLIDAYS, title: "Festività in Italia", primary: false, color: "#0b8043", role: "reader", synced: true, default: false },
    ],
    events: events.sort((a, b) => a.start.localeCompare(b.start)),
    proposals: [
      {
        id: hex(8),
        created: nowIso(),
        item: null,
        title: "Ritiro passaporto in Questura",
        start: d(10, "11:20"),
        end: d(10, "11:40"),
        all_day: false,
        location: "Questura, ufficio passaporti, via Verdi 2",
        description: "Dalla PEC della Questura: portare la ricevuta della richiesta e il vecchio passaporto.",
        important: true,
        deadline: "passaporto",
        status: "open",
        event: null,
      },
    ],
    others: [],
  }
}

/** The calendar, created for demos started before it existed. */
export function calendar(): DemoCalendar {
  const s = state()
  s.calendar ??= seedCalendar()
  return s.calendar
}

function account(c: DemoCalendar): CalendarAccount {
  return { name: CALENDAR_ACCOUNT, state: "connected", address: ADDRESS, synced_at: c.synced_at, error: null, calendars: c.calendars, events: c.events.length }
}

export function calendarSetup(): CalendarSetup {
  const c = calendar()
  const origin = typeof location === "undefined" ? "https://demo.invalid" : location.origin
  return {
    client: { type: "web", redirects: [`${origin}/oauth/gmail`, `${origin}/oauth/calendar`] },
    accounts: [
      account(c),
      ...c.others.map((name): CalendarAccount => ({ name, state: "disconnected", address: null, synced_at: null, error: null, calendars: [], events: 0 })),
    ],
  }
}

export function calendarAgenda(range: { from?: string; to?: string } = {}): CalendarAgenda {
  const c = calendar()
  const from = range.from ?? addDays(today(), -7)
  const to = range.to ?? addDays(today(), 120)
  return {
    accounts: calendarSetup().accounts,
    events: c.events.filter((e) => e.end.slice(0, 10) >= from && e.start.slice(0, 10) <= to),
    proposals: c.proposals.filter((p) => p.status === "open"),
  }
}

export class DemoCalendarError extends Error {}

/** What apps/server/src/calendar.ts `apply` does, on the made-up copy. */
export function applyCalendarOp(op: CalendarOp): { event: CalendarEvent; overlaps: CalendarEvent[]; series: boolean } {
  const c = calendar()
  if (op.account && op.account !== CALENDAR_ACCOUNT) throw new DemoCalendarError(`no connected calendar account "${op.account}" (${CALENDAR_ACCOUNT})`)
  if (op.op === "create") {
    const f = op.event
    const allDay = !f.start.includes("T")
    const asked = op.calendar?.toLowerCase()
    const target = asked ? c.calendars.find((x) => (x.id === op.calendar || x.title.toLowerCase() === asked || (asked === "primary" && x.primary)) && x.role !== "reader") : c.calendars.find((x) => x.default)
    if (!target) throw new DemoCalendarError(`no writable calendar "${op.calendar}"`)
    const overlaps = overlapping(c.events, f.start, f.end)
    const important = f.important === true
    const base = {
      title: f.title,
      start: f.start,
      end: f.end ?? (allDay ? f.start : addMinutes(f.start, 60)),
      calendar: target.id,
      location: f.location ?? null,
      description: f.description ?? null,
      reminders: f.reminders ?? (important ? IMPORTANT_REMINDERS.map((minutes) => ({ method: "popup" as const, minutes })) : null),
      important,
      deadline: f.deadline ?? null,
      busy: f.busy !== false,
      ours: true,
    }
    let made: CalendarEvent
    if (f.repeat) {
      // A series, copied one occurrence at a time for the next months (as the sync expands it).
      const series = hex(26)
      const step = /WEEKLY/.test(f.repeat) ? 7 : /DAILY/.test(f.repeat) ? 1 : /MONTHLY/.test(f.repeat) ? 30 : 365
      const length = allDay ? 0 : (Date.parse(`${base.end}:00Z`) - Date.parse(`${base.start}:00Z`)) / 60_000
      const list = Array.from({ length: Math.min(12, Math.ceil(120 / step)) }, (_, i) => {
        const day = addDays(f.start.slice(0, 10), i * step)
        const start = allDay ? day : `${day}T${f.start.slice(11)}`
        return event({ ...base, start, end: allDay ? start : addMinutes(start, length), recurring: series, id: `${series}_${day.replace(/-/g, "")}` })
      })
      c.events.push(...list)
      made = list[0]
    } else {
      made = event(base)
      c.events.push(made)
    }
    c.events.sort((a, b) => a.start.localeCompare(b.start))
    changed("calendar")
    return { event: made, overlaps, series: Boolean(f.repeat) }
  }
  const found = c.events.find((e) => e.id === op.id || e.recurring === op.id)
  if (!found) throw new DemoCalendarError("this event is not in the copy of the calendar: read calendar/agenda.md again for its id")
  if (c.calendars.find((x) => x.id === found.calendar)?.role === "reader") throw new DemoCalendarError("the calendar is read-only")
  const series = Boolean(found.recurring) && (op.series || op.id === found.recurring)
  if (op.op === "delete") {
    c.events = c.events.filter((e) => (series ? e.recurring !== found.recurring : e.id !== found.id))
    changed("calendar")
    return { event: found, overlaps: [], series }
  }
  const set = op.set
  if (series && (set.start || set.end)) throw new DemoCalendarError("the dates of a whole series are changed in Google Calendar itself")
  const moved = Boolean(set.start || set.end)
  const start = set.start ?? found.start
  const keep = found.all_day ? 0 : (Date.parse(`${found.end}:00Z`) - Date.parse(`${found.start}:00Z`)) / 60_000
  const end = set.end ?? (moved ? (start.includes("T") ? addMinutes(start, keep || 60) : start) : found.end)
  const overlaps = moved ? overlapping(c.events, start, end, found.id) : []
  const patch = (e: CalendarEvent): CalendarEvent => ({
    ...e,
    ...(set.title ? { title: set.title } : {}),
    ...(moved ? { start, end, all_day: !start.includes("T") } : {}),
    ...("location" in set ? { location: set.location ?? null } : {}),
    ...("description" in set ? { description: set.description ?? null } : {}),
    ...(set.reminders ? { reminders: set.reminders } : {}),
    ...("important" in set ? { important: set.important === true } : {}),
    ...("deadline" in set ? { deadline: set.deadline ?? null } : {}),
    ...("busy" in set ? { busy: set.busy !== false } : {}),
    updated: nowIso(),
  })
  c.events = c.events.map((e) => (series ? (e.recurring === found.recurring ? patch(e) : e) : e.id === found.id ? patch(e) : e)).sort((a, b) => a.start.localeCompare(b.start))
  changed("calendar")
  return { event: patch(found), overlaps, series }
}

// ---------- the confirmation lines, as apps/server/src/chat-actions.ts writes them ----------

const TEXT = {
  it: {
    created: (what: string, series: boolean) => `📅 Aggiunto a Google Calendar: ${what}${series ? " (ricorrente)" : ""}`,
    updated: (what: string, series: boolean) => `📅 Evento aggiornato${series ? " (tutta la serie)" : ""}: ${what}`,
    deleted: (what: string, series: boolean) => `📅 Evento eliminato${series ? " (tutta la serie)" : ""}: ${what}. Si recupera dal Cestino di Google Calendar.`,
    overlaps: (titles: string) => `⚠️ Nello stesso orario c'è già: ${titles}`,
    notCalendar: (why: string) => `⚠️ Calendario non aggiornato: ${why}`,
    allDay: "tutto il giorno",
  },
  en: {
    created: (what: string, series: boolean) => `📅 Added to Google Calendar: ${what}${series ? " (recurring)" : ""}`,
    updated: (what: string, series: boolean) => `📅 Event updated${series ? " (whole series)" : ""}: ${what}`,
    deleted: (what: string, series: boolean) => `📅 Event deleted${series ? " (whole series)" : ""}: ${what}. It can be restored from Google Calendar's Trash.`,
    overlaps: (titles: string) => `⚠️ At the same time there is already: ${titles}`,
    notCalendar: (why: string) => `⚠️ Calendar not updated: ${why}`,
    allDay: "all day",
  },
}

export function eventTime(e: Pick<CalendarEvent, "start" | "end" | "all_day">, lang: Lang): string {
  const tag = lang === "it" ? "it-IT" : "en-GB"
  const day = (d: string) => new Intl.DateTimeFormat(tag, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d.slice(0, 10)}T12:00:00Z`))
  if (e.all_day) return `${day(e.start)}${e.end !== e.start ? `–${day(e.end)}` : ""}, ${TEXT[lang].allDay}`
  const sameDay = e.end.slice(0, 10) === e.start.slice(0, 10)
  return `${day(e.start)}, ${e.start.slice(11)}–${sameDay ? e.end.slice(11) : `${day(e.end)} ${e.end.slice(11)}`}`
}

export function applyCalendarBlocks(raw: Record<string, unknown>[], lang: Lang): string[] {
  const t = TEXT[lang]
  const lines: string[] = []
  for (const r of raw.slice(0, 10)) {
    const parsed = parseCalendarOp(r)
    if ("error" in parsed) {
      lines.push(t.notCalendar(parsed.error))
      continue
    }
    try {
      const done = applyCalendarOp(parsed.op)
      const what = `${done.event.title} — ${eventTime(done.event, lang)}`
      lines.push(parsed.op.op === "create" ? t.created(what, done.series) : parsed.op.op === "update" ? t.updated(what, done.series) : t.deleted(what, done.series))
      if (done.overlaps.length) lines.push(t.overlaps(done.overlaps.slice(0, 3).map((e) => `${e.title} (${eventTime(e, lang)})`).join(", ")))
    } catch (e) {
      lines.push(t.notCalendar((e as Error).message))
    }
  }
  return lines
}

/** POST /api/calendar/proposals/:id */
export function answerProposal(id: string, answer: "add" | "dismiss"): { proposal: CalendarProposal; event: CalendarEvent | null } | null {
  const c = calendar()
  const p = c.proposals.find((x) => x.id === id && x.status === "open")
  if (!p) return null
  let made: CalendarEvent | null = null
  if (answer === "add") {
    made = applyCalendarOp({
      op: "create",
      account: null,
      calendar: null,
      event: { title: p.title, start: p.start, end: p.end, location: p.location, description: p.description, important: p.important, deadline: p.deadline },
    }).event
  }
  p.status = answer === "add" ? "added" : "dismissed"
  p.event = made?.id ?? null
  changed("calendar")
  return { proposal: p, event: made }
}
