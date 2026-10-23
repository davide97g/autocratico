import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { addDays, type CalendarAgenda, type CalendarSetup, type GoogleEvent, offsetMs, reminderTime, today } from "@autocratico/core"
import { describe, expect, it } from "vitest"

import { Account } from "../src/account.ts"
import { createApp } from "../src/app.ts"
import { Calendar } from "../src/calendar.ts"
import { applyCalendar } from "../src/chat-actions.ts"
import { tools } from "../src/claude.ts"
import { loadConfig } from "../src/config.ts"
import { services } from "../src/services.ts"
import { LOCAL, owner, post, setup } from "./helpers.ts"

const ZONE = "Europe/Rome"
const CLIENT = {
  web: {
    client_id: "123-abc.apps.googleusercontent.com",
    client_secret: "GOCSPX-not-a-real-secret",
    project_id: "autocratico",
    redirect_uris: ["http://127.0.0.1:8790/oauth/calendar"],
  },
}
const SCOPES = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly"
const PRIMARY = "maria@example.com"

/** Google's token endpoint and Calendar API over an in-memory calendar, recording every call. */
function fakeGoogle(scope = SCOPES) {
  const day = (n: number) => addDays(today(ZONE), n)
  // Google answers with the zone's offset of that day.
  const off = offsetMs(ZONE, new Date(`${day(1)}T09:00:00Z`)) / 60_000
  const zone = `${off < 0 ? "-" : "+"}${String(Math.floor(Math.abs(off) / 60)).padStart(2, "0")}:${String(Math.abs(off) % 60).padStart(2, "0")}`
  const events: GoogleEvent[] = [
    { id: "visit", summary: "Visita", start: { dateTime: `${day(1)}T09:00:00${zone}` }, end: { dateTime: `${day(1)}T10:00:00${zone}` }, htmlLink: "https://www.google.com/calendar/event?eid=1" },
    { id: "trip", summary: "Torino", start: { date: day(3) }, end: { date: day(6) }, transparency: "transparent" },
    { id: "gone", summary: "Cancelled", status: "cancelled", start: { date: day(2) }, end: { date: day(3) } },
  ]
  const calls: { method: string; url: string; body: unknown }[] = []
  let n = 0
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    const body = init?.body instanceof URLSearchParams ? Object.fromEntries(init.body) : typeof init?.body === "string" ? JSON.parse(init.body) : null
    calls.push({ method, url, body })
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: `ya29.${++n}`, refresh_token: "1//refresh", expires_in: 3599, scope, token_type: "Bearer" })
    if (url === "https://oauth2.googleapis.com/revoke") return new Response("{}")
    const path = url.replace("https://www.googleapis.com/calendar/v3", "").split("?")[0]
    if (path === "/users/me/calendarList") {
      return Response.json({
        items: [
          { id: PRIMARY, summary: PRIMARY, primary: true, backgroundColor: "#039be5", accessRole: "owner" },
          { id: "holidays@group.v.calendar.google.com", summary: "Holidays", accessRole: "reader" },
        ],
      })
    }
    const m = /^\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(path)
    if (m) {
      const id = m[2] && decodeURIComponent(m[2])
      if (method === "GET") return Response.json({ items: decodeURIComponent(m[1]) === PRIMARY ? events : [] })
      if (method === "POST") {
        const made = { ...(body as GoogleEvent), id: `new${events.length}`, htmlLink: "https://www.google.com/calendar/event?eid=new" }
        events.push(made)
        return Response.json(made)
      }
      const i = events.findIndex((e) => e.id === id)
      if (i < 0) return new Response("{}", { status: 404 })
      if (method === "PATCH") {
        events[i] = { ...events[i], ...(body as GoogleEvent) }
        return Response.json(events[i])
      }
      if (method === "DELETE") {
        events.splice(i, 1)
        return new Response(null, { status: 204 })
      }
    }
    return new Response("not found", { status: 404 })
  }) as typeof fetch
  return { fetcher, calls, events }
}

/** A server on a copy of example/ with the Gmail OAuth client uploaded and the fake Google behind the calendar. */
function withCalendar(scope?: string) {
  const google = fakeGoogle(scope)
  const { data } = setup()
  mkdirSync(join(data, "secrets"), { recursive: true })
  writeFileSync(join(data, "secrets", "credentials.json"), JSON.stringify(CLIENT))
  const config = loadConfig({ data, jobs: false, telegramToken: null, claude: null, timeZone: ZONE })
  const calendar = new Calendar(data, ZONE, google.fetcher)
  const app = createApp(services(config, { jobs: null, telegram: null, verifyAccess: null, account: new Account(config, ":memory:"), calendar }))
  return { app, data, google, calendar }
}

async function json<T>(r: Response | Promise<Response>): Promise<T> {
  return (await (await r).json()) as T
}

/** Adds the account and signs it in, as Settings does with a web client. */
async function signIn(e: ReturnType<typeof withCalendar>, headers: Record<string, string>) {
  expect((await post(e.app, "/api/calendar/accounts", { name: "personal" }, headers)).status).toBe(200)
  const { url } = await json<{ url: string }>(post(e.app, "/api/calendar/accounts/personal/authorize", {}, headers))
  const state = new URL(url).searchParams.get("state")
  return post(e.app, "/api/calendar/complete", { url: `http://127.0.0.1:8790/oauth/calendar?state=${state}&code=4/abc` }, headers)
}

describe("Google Calendar", () => {
  it("needs the owner's session", async () => {
    const { app } = withCalendar()
    expect((await app.request("/api/calendar/setup", { headers: LOCAL })).status).toBe(401)
  })

  it("signs in with PKCE and the calendar scopes only, keeps the token secret, and copies the calendar", async () => {
    const e = withCalendar()
    const headers = await owner(e.app)
    expect((await post(e.app, "/api/calendar/accounts", { name: "personal" }, headers)).status).toBe(200)
    const { url, type } = await json<{ url: string; type: string }>(post(e.app, "/api/calendar/accounts/personal/authorize", {}, headers))
    expect(type).toBe("web")
    const q = new URL(url).searchParams
    expect(url.startsWith("https://accounts.google.com/o/oauth2/auth?")).toBe(true)
    expect(q.get("scope")).toBe(SCOPES)
    expect(q.get("redirect_uri")).toBe("http://127.0.0.1:8790/oauth/calendar")
    expect(q.get("code_challenge_method")).toBe("S256")

    const done = await json<{ name: string; address: string }>(
      post(e.app, "/api/calendar/complete", { url: `http://127.0.0.1:8790/oauth/calendar?state=${q.get("state")}&code=4/abc` }, headers)
    )
    expect(done).toEqual({ name: "personal", address: PRIMARY })
    // The state is single-use.
    expect((await post(e.app, "/api/calendar/complete", { url: `http://127.0.0.1:8790/oauth/calendar?state=${q.get("state")}&code=4/abc` }, headers)).status).toBe(400)

    const token = join(e.data, "secrets", "calendar", "personal.json")
    expect(statSync(token).mode & 0o777).toBe(0o600)
    const setupBody = await (await e.app.request("/api/calendar/setup", { headers })).text()
    expect(setupBody).not.toContain("1//refresh")
    expect(setupBody).not.toContain("GOCSPX")
    const s = JSON.parse(setupBody) as CalendarSetup
    expect(s.accounts[0]).toMatchObject({ name: "personal", state: "connected", address: PRIMARY, events: 2 })
    expect(s.accounts[0].calendars.map((c) => [c.id, c.synced, c.default])).toEqual([
      [PRIMARY, true, true],
      ["holidays@group.v.calendar.google.com", false, false],
    ])

    const agenda = await json<CalendarAgenda>(e.app.request("/api/calendar", { headers }))
    const day = (n: number) => addDays(today(ZONE), n)
    expect(agenda.events.map((x) => [x.title, x.start, x.end, x.all_day, x.busy])).toEqual([
      ["Visita", `${day(1)}T09:00`, `${day(1)}T10:00`, false, true],
      // Google's all-day end is the day after: the copy keeps the last day.
      ["Torino", day(3), day(5), true, false],
    ])
    const md = readFileSync(join(e.data, "calendar", "agenda.md"), "utf8")
    expect(md).toContain("· Visita · id visit")
    expect(md).toContain("default for new events")
    expect(readFileSync(join(e.data, "calendar.toml"), "utf8")).toContain('name = "personal"')
  })

  it("refuses a sign-in without access to events", async () => {
    const e = withCalendar("https://www.googleapis.com/auth/calendar.calendarlist.readonly")
    const headers = await owner(e.app)
    const r = await signIn(e, headers)
    expect(r.status).toBe(400)
    expect(existsSync(join(e.data, "secrets", "calendar", "personal.json"))).toBe(false)
    expect(e.google.calls.some((c) => c.url.endsWith("/revoke"))).toBe(true)
  })

  it("creates, moves and deletes events from the chat's blocks, and warns about overlaps", async () => {
    const e = withCalendar()
    await signIn(e, await owner(e.app))
    const day = (n: number) => addDays(today(ZONE), n)

    const created = await applyCalendar(
      [{ op: "create", title: "Dentista", start: `${day(1)}T09:30`, duration: 45, location: "Via Roma 1", important: true, deadline: "dentist" }],
      e.calendar,
      "it"
    )
    expect(created[0]).toMatch(/^📅 Aggiunto a Google Calendar: Dentista — .+, 09:30–10:15$/)
    expect(created[1]).toMatch(/^⚠️ Nello stesso orario c'è già: Visita/)
    const sent = e.google.calls.find((c) => c.method === "POST" && c.url.includes("/events"))!
    expect(sent.url).toContain(`/calendars/${encodeURIComponent(PRIMARY)}/events`)
    expect(sent.body).toMatchObject({
      summary: "Dentista",
      start: { dateTime: `${day(1)}T09:30:00`, timeZone: ZONE },
      end: { dateTime: `${day(1)}T10:15:00`, timeZone: ZONE },
      colorId: "11",
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 1440 }, { method: "popup", minutes: 60 }] },
      extendedProperties: { private: { autocratico: "1", autocratico_important: "1", autocratico_deadline: "dentist" } },
    })
    const id = e.calendar.mirror("personal")!.events.find((x) => x.title === "Dentista")!.id

    const moved = await applyCalendar([{ op: "update", id, set: { start: `${day(2)}T15:00` } }], e.calendar, "en")
    expect(moved).toEqual([expect.stringMatching(/^📅 Event updated: Dentista — .+, 15:00–15:45$/)])
    expect(e.google.calls.at(-1)).toMatchObject({ method: "PATCH", body: { start: { dateTime: `${day(2)}T15:00:00` }, end: { dateTime: `${day(2)}T15:45:00` } } })

    expect(await applyCalendar([{ op: "delete", id: "made-up" }], e.calendar, "en")).toEqual([expect.stringMatching(/^⚠️ Calendar not updated: this event is not in the copy/)])
    expect(await applyCalendar([{ op: "create", title: "x", start: "tomorrow" }], e.calendar, "en")).toEqual([expect.stringMatching(/^⚠️ Calendar not updated: start: expected YYYY-MM-DD/)])

    const deleted = await applyCalendar([{ op: "delete", id }], e.calendar, "en")
    expect(deleted[0]).toMatch(/^📅 Event deleted: Dentista/)
    expect(e.calendar.mirror("personal")!.events.some((x) => x.id === id)).toBe(false)
    expect(readFileSync(join(e.data, "calendar", "agenda.md"), "utf8")).not.toContain("Dentista")
  })

  it("answers calendar blocks with a warning when nothing is connected", async () => {
    const { calendar } = withCalendar()
    expect(await applyCalendar([{ op: "create", title: "x", start: "2026-11-02" }], calendar, "en")).toEqual(["⚠️ Google Calendar is not connected: connect it from Settings."])
  })

  it("keeps appointments found in documents until the user says yes", async () => {
    const e = withCalendar()
    const headers = await owner(e.app)
    await signIn(e, headers)
    const day = addDays(today(ZONE), 10)
    const found = await e.calendar.propose([{ title: "Questura", start: `${day}T11:20`, location: "Via Verdi 2" }, { title: "bad", start: "soon" }], "item1")
    expect(found.map((p) => [p.title, p.end])).toEqual([["Questura", `${day}T12:20`]])
    // Proposed once only.
    expect(await e.calendar.propose([{ title: "Questura", start: `${day}T11:20` }], null)).toEqual([])
    const r = await json<{ event: { title: string } }>(post(e.app, `/api/calendar/proposals/${found[0].id}`, { answer: "add" }, headers))
    expect(r.event.title).toBe("Questura")
    expect((await post(e.app, `/api/calendar/proposals/${found[0].id}`, { answer: "add" }, headers)).status).toBe(409)
    expect((await json<CalendarAgenda>(e.app.request("/api/calendar", { headers }))).proposals).toEqual([])
  })

  it("alerts important events once, when their reminders are due", async () => {
    const e = withCalendar()
    await signIn(e, await owner(e.app))
    const day = addDays(today(ZONE), 1)
    await applyCalendar([{ op: "create", title: "Notaio", start: `${day}T10:00`, important: true, reminders: [30] }], e.calendar, "en")
    await applyCalendar([{ op: "create", title: "Cena", start: `${day}T10:00` }], e.calendar, "en")
    const local = (time: string) => new Date(reminderTime(`${day}T${time}`, ZONE)!)
    expect(await e.calendar.dueAlerts(local("09:29"))).toEqual([])
    const due = await e.calendar.dueAlerts(local("09:31"))
    expect(due.map((a) => [a.event.title, a.minutes])).toEqual([["Notaio", 30]])
    expect(await e.calendar.dueAlerts(local("09:35"))).toEqual([])
  })

  it("keeps calendar/ and calendar.toml out of the background agent's and the research job's reach", () => {
    const triage = tools("triage", "/data")
    expect(triage.denied).toContain("Edit(//data/calendar/**)")
    expect(triage.denied).toContain("Write(//data/calendar.toml)")
    expect(tools("research", "/data").denied).toContain("Read(//data/calendar/**)")
  })
})
