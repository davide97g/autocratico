import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

import type { JobRun } from "@autocratico/core"
import { strToU8, zipSync } from "fflate"
import { beforeEach, describe, expect, it } from "vitest"

import { ChangeError } from "../src/changes.ts"
import { tools } from "../src/claude.ts"
import { type Config, loadConfig } from "../src/config.ts"
import { cleanSteps, parseTriage, recorder } from "../src/jobs.ts"
import { outgoing } from "../src/telegram.ts"
import { cookieOf, LOCAL, LOCAL_WRITE, owner, PASSWORD, post, setup } from "./helpers.ts"

const ROOT = resolve(import.meta.dirname, "../../..")

describe("dev mode", () => {
  it("serves the data to local pages only, after login", async () => {
    const { app } = setup()
    expect((await app.request("/api/data", { headers: LOCAL })).status).toBe(401)
    const me = await owner(app)
    expect((await app.request("/api/data", { headers: me })).status).toBe(200)
    expect((await app.request("/api/data", { headers: { ...me, host: "evil.example" } })).status).toBe(403)
    expect((await app.request("/api/data", { headers: { ...me, origin: "https://evil.example" } })).status).toBe(403)
  })

  it("marks an occurrence as done", async () => {
    const { app, data } = setup()
    const me = await owner(app)
    const r = await post(app, "/api/done", { key: "car-tax@2027-01-31", done: true }, me)
    expect(r.status).toBe(200)
    expect(JSON.parse(readFileSync(join(data, "state.json"), "utf8")).done["car-tax@2027-01-31"]).toBeTruthy()
    // Writes must name their origin.
    const { origin: _, ...noOrigin } = me
    expect((await post(app, "/api/done", { key: "car-tax@2027-01-31", done: false }, noOrigin)).status).toBe(403)
  })

  it("refuses to listen on other interfaces", () => {
    expect(() => loadConfig({ host: "0.0.0.0" })).toThrow(/loopback/)
  })
})

describe("account", () => {
  it("is set up once, with the name in profile.toml", async () => {
    const { app, data } = setup()
    const before = (await (await app.request("/api/session", { headers: LOCAL })).json()) as any
    expect(before).toMatchObject({ auth: "dev", owner: false, authenticated: false, user: null, needsCode: false })
    expect((await post(app, "/api/setup", { name: "Maria", password: "short" })).status).toBe(400)
    const me = await owner(app)
    const after = (await (await app.request("/api/session", { headers: me })).json()) as any
    expect(after).toMatchObject({ owner: true, authenticated: true, user: { name: "Maria", onboarded: false } })
    expect(readFileSync(join(data, "profile.toml"), "utf8")).toMatch(/\[person\]\nname = "Maria"/)
    // Only one user.
    expect((await post(app, "/api/setup", { name: "Eve", password: PASSWORD })).status).toBe(409)
    expect((await post(app, "/api/setup", { name: "Eve", password: PASSWORD }, me)).status).toBe(409)
  })

  it("logs in with the masterpass and locks out after five wrong tries", async () => {
    const { app } = setup()
    await owner(app)
    const ok = await post(app, "/api/login", { password: PASSWORD })
    expect(ok.status).toBe(200)
    const cookie = ok.headers.getSetCookie().join("\n")
    expect(cookie).toMatch(/autocratico\.session_token=/)
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/SameSite=Strict/)
    for (let i = 0; i < 5; i++) expect((await post(app, "/api/login", { password: "wrong password" })).status).toBe(401)
    const locked = await post(app, "/api/login", { password: PASSWORD })
    expect(locked.status).toBe(429)
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0)
  })

  it("logs out", async () => {
    const { app } = setup()
    const me = await owner(app)
    expect((await post(app, "/api/logout", {}, me)).status).toBe(200)
    expect((await app.request("/api/data", { headers: me })).status).toBe(401)
  })

  it("changes the masterpass and logs the other browsers out", async () => {
    const { app } = setup()
    const me = await owner(app)
    const other = { ...LOCAL_WRITE, cookie: cookieOf(await post(app, "/api/login", { password: PASSWORD })) }
    const sessions = (await (await app.request("/api/account/sessions", { headers: me })).json()) as any[]
    expect(sessions).toHaveLength(2)
    expect(sessions.filter((x) => x.current)).toHaveLength(1)

    expect((await post(app, "/api/account/password", { current: "wrong password", next: "another long one" }, me)).status).toBe(401)
    const r = await post(app, "/api/account/password", { current: PASSWORD, next: "another long one", revokeOthers: true }, me)
    expect(r.status).toBe(200)
    const renewed = { ...me, cookie: cookieOf(r) || me.cookie }
    expect((await app.request("/api/data", { headers: renewed })).status).toBe(200)
    expect((await app.request("/api/data", { headers: other })).status).toBe(401)
    expect((await post(app, "/api/login", { password: PASSWORD })).status).toBe(401)
    expect((await post(app, "/api/login", { password: "another long one" })).status).toBe(200)
  })

  it("revokes a session", async () => {
    const { app } = setup()
    const me = await owner(app)
    const other = { ...LOCAL_WRITE, cookie: cookieOf(await post(app, "/api/login", { password: PASSWORD })) }
    const list = (await (await app.request("/api/account/sessions", { headers: me })).json()) as any[]
    const id = list.find((x) => !x.current).id
    expect((await app.request(`/api/account/sessions/${id}`, { method: "DELETE", headers: me })).status).toBe(200)
    expect((await app.request("/api/data", { headers: other })).status).toBe(401)
  })

  it("resets a forgotten masterpass from the command line", async () => {
    const { app, s } = setup()
    const me = await owner(app)
    await s.account.resetPassword("from the terminal")
    expect((await app.request("/api/data", { headers: me })).status).toBe(401)
    expect((await post(app, "/api/login", { password: "from the terminal" })).status).toBe(200)
  })

  it("renames the owner and edits the profile, keeping what it does not know", async () => {
    const { app, data } = setup()
    const me = await owner(app)
    expect((await post(app, "/api/account/name", { name: "Maria Bianchi" }, me)).status).toBe(200)
    const r = await app.request("/api/profile", {
      method: "PUT",
      headers: { ...me, "content-type": "application/json" },
      body: JSON.stringify({ person: { name: "Eve", birth_date: "1990-04-12", municipality: "" }, vehicle: [{ type: "car", plate: "AB123CD", registration_date: "2019-03-31" }] }),
    })
    expect(r.status).toBe(200)
    const toml = readFileSync(join(data, "profile.toml"), "utf8")
    expect(toml).toMatch(/^# Profile \(EXAMPLE/)
    expect(toml).toContain('name = "Maria Bianchi"')
    expect(toml).toContain("birth_date = 1990-04-12")
    expect(toml).not.toContain("municipality = \"Example town (XX)\"\n\n[work]")
    expect(toml).toContain("registration_date = 2019-03-31")
    expect(toml).toContain("[[property]]") // not sent: kept
    const profile = ((await (await app.request("/api/data", { headers: me })).json()) as any).profile
    expect(profile.person).toEqual({ name: "Maria Bianchi", birth_date: "1990-04-12" })
    expect(profile.vehicle).toEqual([{ type: "car", plate: "AB123CD", registration_date: "2019-03-31" }])
    const session = (await (await app.request("/api/session", { headers: me })).json()) as any
    expect(session.user.name).toBe("Maria Bianchi")
    expect((await post(app, "/api/account/onboarded", { onboarded: true }, me)).status).toBe(200)
    expect(((await (await app.request("/api/session", { headers: me })).json()) as any).user.onboarded).toBe(true)
  })
})

describe("prod mode", () => {
  const prod: Partial<Config> = { auth: "prod", host: "0.0.0.0", publicOrigin: "https://app.example", access: { team: "t", aud: "a" } }
  const ORIGIN = "https://app.example"
  let env: ReturnType<typeof setup>
  beforeEach(() => {
    env = setup(prod, async (t) => t === "good-jwt")
  })
  const jwt = { "cf-access-jwt-assertion": "good-jwt" }
  const write = { ...jwt, host: "app.example", origin: ORIGIN }

  async function prodOwner() {
    const code = await env.s.account.startSetupCode()
    const r = await post(env.app, "/api/setup", { name: "Maria", password: PASSWORD, code }, write)
    expect(r.status).toBe(200)
    return { ...write, cookie: cookieOf(r) }
  }

  it("needs Cloudflare Access and a session", async () => {
    expect((await env.app.request("/api/data")).status).toBe(401)
    expect((await env.app.request("/api/data", { headers: jwt })).status).toBe(401)
    expect((await env.app.request("/api/health")).status).toBe(200)
    expect((await env.app.request("/api/session", { headers: jwt })).status).toBe(200)
    expect((await env.app.request("/api/session")).status).toBe(401)
  })

  it("needs the setup code printed by the server for the first setup", async () => {
    const session = (await (await env.app.request("/api/session", { headers: jwt })).json()) as any
    expect(session.needsCode).toBe(true)
    expect((await post(env.app, "/api/setup", { name: "Eve", password: PASSWORD }, write)).status).toBe(403)
    const code = await env.s.account.startSetupCode()
    for (let i = 0; i < 5; i++) expect((await post(env.app, "/api/setup", { name: "Eve", password: PASSWORD, code: "12345678" }, write)).status).toBe(403)
    // Voided after five wrong codes.
    expect((await post(env.app, "/api/setup", { name: "Eve", password: PASSWORD, code }, write)).status).toBe(403)
    const me = await prodOwner()
    expect((await env.app.request("/api/data", { headers: me })).status).toBe(200)
  })

  it("sets a secure session cookie", async () => {
    await prodOwner()
    const r = await post(env.app, "/api/login", { password: PASSWORD }, write)
    expect(r.headers.getSetCookie().join("\n")).toMatch(/__Secure-autocratico\.session_token=.*Secure/)
  })

  it("blocks cross-site and origin-less writes with the cookie", async () => {
    const me = await prodOwner()
    const body = { key: "car-tax@2027-01-31", done: true }
    expect((await post(env.app, "/api/done", body, { ...me, origin: "https://evil.example" })).status).toBe(403)
    const { origin: _, ...noOrigin } = me
    expect((await post(env.app, "/api/done", body, noOrigin)).status).toBe(403)
    expect((await post(env.app, "/api/login", { password: PASSWORD }, noOrigin)).status).toBe(403)
    expect((await post(env.app, "/api/done", body, me)).status).toBe(200)
  })

  it("limits ingest tokens to /api/ingest", async () => {
    const { token } = await env.s.devices.create("shortcut", "ingest")
    const auth = { ...jwt, authorization: `Bearer ${token}` }
    expect((await env.app.request("/api/data", { headers: auth })).status).toBe(403)
    const r = await env.app.request("/api/ingest", { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ text: "Avviso TARI, scadenza 16/12", title: "TARI" }) })
    expect(r.status).toBe(200)
    const item = (await r.json()) as any
    expect(item).toMatchObject({ source: "shortcut", account: "shortcut", status: "new", title: "TARI" })
    // A revoked token stops working.
    await env.s.devices.revoke(token.split(".")[0])
    expect((await env.app.request("/api/ingest", { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: "{}" })).status).toBe(401)
  })
})

describe("inbox", () => {
  it("stores uploads with safe names and reads WhatsApp exports", async () => {
    const { app, s } = setup()
    const me = await owner(app)
    const form = new FormData()
    form.append("file", new File([new Uint8Array([37, 80, 68, 70])], "../../bolletta.pdf"))
    form.append("text", "Bolletta luce")
    const r = await app.request("/api/ingest", { method: "POST", headers: me, body: form })
    expect(r.status).toBe(200)
    const item = (await r.json()) as any
    expect(item.files).toEqual(["_.._bolletta.pdf"])
    expect(s.inbox.file(item.id, "_.._bolletta.pdf")).toBeTruthy()
    expect(s.inbox.file(item.id, "../item.json")).toBeNull()

    const zip = zipSync({
      "_chat.txt": strToU8("[03/10/26, 14:05:12] Mario: Ti giro la multa\n[03/10/26, 14:06:00] Mario: ‎<allegato: 00000012-PHOTO.jpg>"),
      "00000012-PHOTO.jpg": new Uint8Array([1, 2, 3]),
      "__MACOSX/._x": new Uint8Array([0]),
    })
    const wa = new FormData()
    wa.append("file", new File([zip], "WhatsApp Chat - Mario.zip"))
    const w = (await (await app.request("/api/ingest", { method: "POST", headers: me, body: wa })).json()) as any
    expect(w.source).toBe("whatsapp")
    expect(w.files).toEqual(["00000012-PHOTO.jpg"])
    const detail = (await (await app.request(`/api/inbox/${w.id}`, { headers: me })).json()) as any
    expect(detail.content).toContain("Ti giro la multa")
  })

  it("serves attachments as downloads only", async () => {
    const { app, s } = setup()
    const item = await s.inbox.add({ source: "upload", files: [{ name: "x.html", data: new TextEncoder().encode("<script>alert(1)</script>") }] })
    const r = await app.request(`/api/inbox/${item.id}/files/x.html`, { headers: await owner(app) })
    expect(r.headers.get("content-type")).toBe("application/octet-stream")
    expect(r.headers.get("content-disposition")).toMatch(/^attachment/)
  })
})

describe("agent", () => {
  it("keeps the triage profile away from secrets, the web and server files", () => {
    const { allowed, denied } = tools("triage", "/data")
    expect(allowed).toContain("Edit(//data/**)")
    expect(allowed.some((t) => t.startsWith("WebFetch") || t === "WebSearch" || t === "Bash")).toBe(false)
    expect(denied).toEqual(expect.arrayContaining(["WebFetch", "WebSearch", "Read(//data/secrets/**)", "Edit(//data/state.json)", "Write(//data/reminders.json)", "Write(//data/inbox/*/item.json)"]))
  })

  it("keeps the chat read-only", () => {
    const { allowed, denied } = tools("read", "/data")
    expect(allowed.some((t) => t.startsWith("Edit") || t.startsWith("Write"))).toBe(false)
    expect(denied).toEqual(expect.arrayContaining(["Edit", "Write", "Read(//data/secrets/**)"]))
  })

  it("reads the triage result block", () => {
    const r = parseTriage('Done.\n```json\n{"items":[{"id":"a","status":"processed","outcome":"TARI aggiunta"}],"summary":"TARI ||120 €||","phishing":[]}\n```')
    expect(r?.items[0].id).toBe("a")
    expect(parseTriage("no block")).toBeNull()
    const d = parseTriage('```json\n{"items":[],"summary":"","phishing":[],"done":["imu-2021@2026-10-20","bad key","x@2026-1-1"]}\n```')
    expect(d?.done).toEqual(["imu-2021@2026-10-20"])
  })

  it("records the agent's steps without the result block", async () => {
    const run: JobRun = { id: "r", job: "triage", started: "", finished: null, ok: null, summary: "" }
    const on = recorder(run)
    on({ type: "block" })
    on({ type: "text", text: "Reading the " })
    on({ type: "text", text: "notice." })
    on({ type: "tool", name: "Read", detail: "inbox/x/content.md" })
    on({ type: "block" })
    on({ type: "text", text: 'Done.\n```json\n{"items":[]}\n```' })
    on({ type: "block" })
    on({ type: "text", text: "```json\n{}\n```" })
    expect(cleanSteps(run.steps!).map(({ tool, text }) => ({ tool, text }))).toEqual([
      { tool: undefined, text: "Reading the notice." },
      { tool: "Read", text: "inbox/x/content.md" },
      { tool: undefined, text: "Done." },
    ])
  })

  it("reports no live job when the scheduler is off", async () => {
    const { app } = setup()
    const r = await app.request("/api/jobs/live", { headers: await owner(app) })
    expect(await r.json()).toEqual({ current: null, waiting: [], triage: null })
  })
})

describe("telegram", () => {
  it("redacts and splits outgoing text", () => {
    const [first] = outgoing("**Bollo** auto: ||€ 180|| entro il 31/01, IBAN IT60X0542811101000000123456")
    expect(first).toBe("Bollo auto: ••• entro il 31/01, IBAN •••")
    expect(outgoing("x".repeat(9000)).length).toBe(3)
  })
})

describe("speech to text", () => {
  it("reads the transcript and catches silent failures", async () => {
    const { parseTranscript } = await import("../src/transcribe.ts")
    expect(parseTranscript("Ciao, quanto devo pagare\ndi TARI?\n", "whisper_init: ok\n")).toBe("Ciao, quanto devo pagare di TARI?")
    expect(() => parseTranscript("", "read_audio_data: failed to read audio data\nerror: failed to read audio file 'x.ogg'\n")).toThrow(/failed to read/)
  })

  it("is off without a model", async () => {
    const { Transcriber } = await import("../src/transcribe.ts")
    const t = new Transcriber(loadConfig({ asr: null, jobs: false, claude: null }))
    expect(t.available).toBe(false)
    await expect(t.transcribe(new Uint8Array([1]))).rejects.toThrow(/not configured/)
  })
})

describe("agent errors", () => {
  it("explains failures in plain language", async () => {
    const { friendlyError } = await import("../src/claude.ts")
    expect(friendlyError("error_during_execution", "it")).toMatch(/Riprova/)
    expect(friendlyError("Claude AI usage limit reached|1791040000", "it")).toMatch(/Limite/)
    expect(friendlyError("API Error: 401 OAuth token has expired", "en")).toMatch(/setup-token/)
  })

  it("does not resume a session that is gone", async () => {
    const { Claude } = await import("../src/claude.ts")
    const c = new Claude(loadConfig({ jobs: false, claude: null }))
    expect(c.sessionExists("00000000-0000-0000-0000-000000000000")).toBe(false)
  })
})

describe("reminders", () => {
  it("stores, lists, cancels and delivers reminders once", async () => {
    const { Reminders } = await import("../src/reminders.ts")
    const { data } = setup()
    const r = new Reminders(data, "Europe/Rome")
    const soon = await r.add(new Date(Date.now() + 1000).toISOString(), "Inserire la TARI", "telegram")
    const later = await r.add("2099-01-01T09:00", "too far", "telegram")
    expect(soon).toBeTruthy()
    expect(later).toBeNull()
    const other = await r.add(new Date(Date.now() + 3_600_000).toISOString(), "Chiamare il CAF", "web")
    expect(r.pending().map((x) => x.text)).toEqual(["Inserire la TARI", "Chiamare il CAF"])
    expect(await r.takeDue(new Date(Date.now() + 5000))).toHaveLength(1)
    expect(await r.takeDue(new Date(Date.now() + 5000))).toHaveLength(0)
    expect((await r.cancel(other!.id))?.text).toBe("Chiamare il CAF")
    expect(r.pending()).toEqual([])
  })

  it("acts on the chat agent's blocks", async () => {
    const { finishAnswer } = await import("../src/chat-actions.ts")
    const { Reminders } = await import("../src/reminders.ts")
    const { s, data } = setup()
    const reminders = new Reminders(data, "Europe/Rome")
    const at = new Date(Date.now() + 90 * 60_000).toISOString()
    const answer = `Ok, te lo ricordo.\n\n\`\`\`reminder\n{"at":"${at}","text":"Inserire i dati della TARI"}\n\`\`\`\n\`\`\`inbox\n{"title":"TARI 2026","text":"Avviso TARI ricevuto, scadenza 16 ottobre"}\n\`\`\``
    const out = await finishAnswer(answer, "telegram", "Mario", { reminders, inbox: s.inbox, jobs: null, telegram: true, locale: "it", changes: null })
    expect(out).toMatch(/^Ok, te lo ricordo\.\n\n⏰ Promemoria per .+: Inserire i dati della TARI\n📥 Aggiunto all'inbox: TARI 2026/)
    expect(reminders.pending()).toHaveLength(1)
    expect(s.inbox.list().find((i) => i.source === "chat")?.title).toBe("TARI 2026")
    const off = await finishAnswer(answer, "web", "Mac", { reminders, inbox: s.inbox, jobs: null, telegram: false, locale: "it", changes: null })
    expect(off).toMatch(/Telegram non è configurato/)
  })
})

describe("date and time tool", () => {
  const when = (...args: string[]) =>
    execFileSync("python3", [join(ROOT, "scripts/when.py"), ...args], { encoding: "utf8", env: { ...process.env, WHEN_NOW: "2026-10-03T15:47:00+02:00" } })

  it("gives the current time and resolves expressions, across DST", () => {
    expect(when()).toMatch(/^now: 2026-10-03 15:47 Saturday \(Europe\/Rome, UTC\+02:00\)/)
    const out = when("+90m, domani alle 9:30, lunedì, 2026-10-26 09:00")
    expect(out).toMatch(/\+90m: 2026-10-03 17:17 .* iso 2026-10-03T17:17:00\+02:00 · in 1 h 30 min/)
    expect(out).toMatch(/domani alle 9:30: 2026-10-04 09:30 Sunday/)
    expect(out).toMatch(/lunedì: 2026-10-05 09:00 Monday/)
    expect(out).toMatch(/2026-10-26 09:00: .*UTC\+01:00/)
  })

  it("is allowed to both agents", () => {
    expect(tools("read", "/data").allowed).toContain("Bash(python3 scripts/when.py:*)")
    expect(tools("triage", "/data").allowed).toContain("Bash(python3 scripts/when.py:*)")
  })
})

describe("changes from the chat", () => {
  async function env() {
    const e = setup()
    await e.s.repo.init()
    return { ...e, file: join(e.data, "deadlines.toml") }
  }
  const occurrences = (e: { s: { store: { data: () => { agenda: { id: string; date: string }[] } } } }, id: string) =>
    e.s.store
      .data()
      .agenda.filter((o) => o.id === id)
      .map((o) => o.date)

  it("closes a deadline in place, as one commit that can be undone", async () => {
    const e = await env()
    const before = readFileSync(e.file, "utf8")
    expect(occurrences(e, "imu-first")).toContain("2027-06-16")
    const { hash } = await e.s.changes.apply({ summary: "IMU: one-off", ops: [{ op: "close", id: "imu-first", until: "2026-06-16" }] }, "web")
    expect(hash).toMatch(/^[0-9a-f]+$/)
    const after = readFileSync(e.file, "utf8")
    // Only one line added, inside the right table; comments and layout untouched.
    expect(after.split("\n").length).toBe(before.split("\n").length + 1)
    expect(after).toContain('notes = "Example: second home. A main residence outside categories A/1, A/8, A/9 is exempt."\nuntil = 2026-06-16\n\n[[deadline]]\nid = "imu-balance"')
    expect(occurrences(e, "imu-first")).toEqual(["2026-06-16"])
    const [commit] = await e.s.repo.log(1)
    expect(commit).toMatchObject({ subject: "Chat: IMU: one-off", files: ["deadlines.toml"] })
    expect(await e.s.repo.show(hash!)).toContain("- close imu-first (until 2026-06-16)")
    await e.s.repo.revert(hash!)
    expect(readFileSync(e.file, "utf8")).toBe(before)
  })

  it("updates, adds, reopens and marks occurrences done", async () => {
    const e = await env()
    const { hash } = await e.s.changes.apply(
      {
        summary: "",
        ops: [
          { op: "update", id: "tari", set: { date: "2026-12-16", amount: 250, notes: null, remind_days: [7] } },
          { op: "add", deadline: { id: "fine-2021", title: "Old fine", area: "home", date: "2026-11-30", severity: "high", amount: 120.5 } },
          { op: "close", id: "passport" },
          { op: "reopen", id: "passport" },
          { op: "done", key: "tari@2026-12-16" },
        ],
      },
      "telegram"
    )
    const tari = e.s.store.data().agenda.find((o) => o.id === "tari")!
    expect(tari).toMatchObject({ date: "2026-12-16", amount: 250, notes: "", done_on: expect.any(String) })
    expect(occurrences(e, "fine-2021")).toEqual(["2026-11-30"])
    expect(readFileSync(e.file, "utf8")).not.toMatch(/^until =/m)
    expect(JSON.parse(readFileSync(join(e.data, "state.json"), "utf8")).done["tari@2026-12-16"]).toBeTruthy()
    const [commit] = await e.s.repo.log(1)
    expect(commit.subject).toMatch(/^Chat: update tari: [a-z_, ]+; add fine-2021; close passport; reopen passport; done tari@2026-12-16$/)
    expect(commit.files.sort()).toEqual(["deadlines.toml", "state.json"])
    expect(hash).toBe(commit.hash)
  })

  it("edits multi-line values and leaves the rest alone", async () => {
    const e = await env()
    writeFileSync(
      e.file,
      `# header\n\n[[deadline]]\nid = "a"\ntitle = "A"\narea = "tax"\ndate = 2026-01-31\nrepeat = "yearly"\nremind_days = [\n  30,\n  7,\n]\nnotes = """\nline one\nline two\n"""\n\n# --- next ---\n\n[[deadline]]\nid = "b"\ntitle = "B"\narea = "tax"\ndate = "TODO"\n`
    )
    await e.s.changes.apply({ summary: "x", ops: [{ op: "update", id: "a", set: { remind_days: [1], notes: "short" } }, { op: "update", id: "b", set: { date: "2027-02-01" } }] }, "web")
    expect(readFileSync(e.file, "utf8")).toBe(
      `# header\n\n[[deadline]]\nid = "a"\ntitle = "A"\narea = "tax"\ndate = 2026-01-31\nrepeat = "yearly"\nremind_days = [ 1 ]\nnotes = "short"\n\n# --- next ---\n\n[[deadline]]\nid = "b"\ntitle = "B"\narea = "tax"\ndate = 2027-02-01\n`
    )
  })

  it("refuses invalid changes and writes nothing", async () => {
    const e = await env()
    const before = readFileSync(e.file, "utf8")
    const bad = [
      [{ op: "close", id: "nope" }],
      [{ op: "update", id: "tari", set: { repeat: "every week" } }],
      [{ op: "update", id: "tari", set: { title: null } }],
      [{ op: "update", id: "tari", set: { owner: "x" } }],
      [{ op: "add", deadline: { id: "tari", title: "T", area: "home", date: "2026-01-01" } }],
      [{ op: "delete", id: "tari" }],
      [{ op: "done", key: "nope@2026-01-01" }],
      [{ op: "update", id: "tari", set: { amount: 1 } }, { op: "close", id: "nope" }],
    ]
    for (const ops of bad) await expect(e.s.changes.apply({ summary: "x", ops }, "web")).rejects.toThrow()
    await expect(e.s.changes.apply({ summary: "x", ops: [{ op: "close", id: "nope" }] }, "web")).rejects.toBeInstanceOf(ChangeError)
    expect(readFileSync(e.file, "utf8")).toBe(before)
    expect((await e.s.repo.log(5)).every((c) => !c.subject.startsWith("Chat:"))).toBe(true)
  })

  it("is applied from a confirmed answer", async () => {
    const { finishAnswer } = await import("../src/chat-actions.ts")
    const e = await env()
    const answer = 'Fatto.\n\n```change\n{"summary": "IMU chiusa", "ops": [{"op": "close", "id": "imu-first", "until": "2026-06-16"}]}\n```'
    const deps = { reminders: e.s.reminders, inbox: e.s.inbox, jobs: null, telegram: false, locale: "it" as const, changes: e.s.changes }
    expect(await finishAnswer(answer, "web", "Maria", deps)).toMatch(/^Fatto\.\n\n✏️ Registro aggiornato: IMU chiusa \(modifica [0-9a-f]+, annullabile da Attività\)$/)
    const failed = await finishAnswer('```change\n{"summary": "x", "ops": [{"op": "close", "id": "nope"}]}\n```', "web", "Maria", deps)
    expect(failed).toBe('⚠️ Modifica non applicata: no deadline with id "nope"')
  })
})

describe("sources and archive", () => {
  async function withEmail() {
    const e = setup()
    const me = await owner(e.app)
    const folder = join(e.data, "archive/email/2026-04-29-chiusura-pratica-abc123")
    const { mkdirSync } = await import("node:fs")
    mkdirSync(folder, { recursive: true })
    writeFileSync(
      join(folder, "message.md"),
      `---\nid: 18f0a1b2c3d4e5f6\naccount: personal\nthread: 18f0a1b2c3d4e5f0\ndate: 2026-04-29T10:00:00+02:00\nfrom: "Agenzia Entrate <noreply@agenziaentrate.it>"\nto: "Maria <maria@example.com>"\nsubject: "Chiusura pratica"\nlabels: []\nattachments: ["esito.pdf"]\n---\n\nLa pratica è stata chiusa.\n`
    )
    writeFileSync(join(folder, "esito.pdf"), "%PDF")
    return { ...e, me }
  }

  it("describes an email source with its text, files and Gmail link", async () => {
    const { app, me } = await withEmail()
    const r = await app.request("/api/source?path=archive/email/2026-04-29-chiusura-pratica-abc123", { headers: me })
    expect(await r.json()).toMatchObject({
      kind: "email",
      title: "Chiusura pratica",
      from: "Agenzia Entrate <noreply@agenziaentrate.it>",
      account: "personal",
      text: "La pratica è stata chiusa.",
      files: ["archive/email/2026-04-29-chiusura-pratica-abc123/esito.pdf"],
      link: "https://mail.google.com/mail/u/?authuser=maria%40example.com#all/18f0a1b2c3d4e5f0",
    })
    const file = await (await app.request("/api/source?path=archive/email/2026-04-29-chiusura-pratica-abc123/esito.pdf", { headers: me })).json()
    expect(file).toMatchObject({ kind: "email", path: "archive/email/2026-04-29-chiusura-pratica-abc123/esito.pdf" })
  })

  it("follows an inbox item to its email and lists the archive", async () => {
    const { app, me, s } = await withEmail()
    const item = await s.inbox.add({ source: "email", title: "Chiusura pratica", text: "pointer" })
    const { writeFileSync: write } = await import("node:fs")
    const json = JSON.parse(readFileSync(join(s.config.data, "inbox", item.folder, "item.json"), "utf8"))
    write(join(s.config.data, "inbox", item.folder, "item.json"), JSON.stringify({ ...json, ref: "archive/email/2026-04-29-chiusura-pratica-abc123" }))
    const viaInbox = await (await app.request(`/api/source?path=inbox/${item.folder}/`, { headers: me })).json()
    expect(viaInbox).toMatchObject({ kind: "email", title: "Chiusura pratica" })
    const list = (await (await app.request("/api/archive", { headers: me })).json()) as any[]
    expect(list[0]).toMatchObject({ kind: "email", title: "Chiusura pratica", files: 1, path: "archive/email/2026-04-29-chiusura-pratica-abc123" })
  })

  it("never reads outside inbox/ and archive/", async () => {
    const { app, me } = await withEmail()
    for (const path of ["secrets/devices.json", "archive/../secrets", "inbox/x/item.json", "deadlines.toml", "archive/.hidden", ""]) {
      expect((await app.request(`/api/source?path=${encodeURIComponent(path)}`, { headers: me })).status).toBe(404)
    }
    expect((await app.request("/api/archive", { headers: LOCAL })).status).toBe(401)
  })
})
