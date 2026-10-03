import { cpSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { strToU8, zipSync } from "fflate"
import { beforeEach, describe, expect, it } from "vitest"

import { createApp } from "../src/app.ts"
import { tools } from "../src/claude.ts"
import { type Config, loadConfig } from "../src/config.ts"
import { parseTriage } from "../src/jobs.ts"
import { services } from "../src/services.ts"
import { outgoing } from "../src/telegram.ts"

const ROOT = resolve(import.meta.dirname, "../../..")

function setup(overrides: Partial<Config> = {}, access: ((t: string | undefined) => Promise<boolean>) | null = null) {
  const data = mkdtempSync(join(tmpdir(), "autocratico-"))
  cpSync(join(ROOT, "example"), data, { recursive: true })
  const config = loadConfig({ data, jobs: false, telegramToken: null, claude: null, ...overrides })
  const s = services(config, { jobs: null, telegram: null, verifyAccess: access })
  return { app: createApp(s), s, data }
}

const LOCAL = { host: "127.0.0.1:8790" }

describe("dev mode", () => {
  it("serves the data to local pages only", async () => {
    const { app } = setup()
    expect((await app.request("/api/data", { headers: LOCAL })).status).toBe(200)
    expect((await app.request("/api/data", { headers: { host: "evil.example" } })).status).toBe(403)
    expect((await app.request("/api/data", { headers: { ...LOCAL, origin: "https://evil.example" } })).status).toBe(403)
  })

  it("marks an occurrence as done", async () => {
    const { app, data } = setup()
    const r = await app.request("/api/done", {
      method: "POST",
      headers: { ...LOCAL, "content-type": "application/json" },
      body: JSON.stringify({ key: "car-tax@2027-01-31", done: true }),
    })
    expect(r.status).toBe(200)
    expect(JSON.parse(readFileSync(join(data, "state.json"), "utf8")).done["car-tax@2027-01-31"]).toBeTruthy()
  })

  it("refuses to listen on other interfaces", () => {
    expect(() => loadConfig({ host: "0.0.0.0" })).toThrow(/loopback/)
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

  it("needs Cloudflare Access and a paired device", async () => {
    expect((await env.app.request("/api/data")).status).toBe(401)
    expect((await env.app.request("/api/data", { headers: jwt })).status).toBe(401)
    expect((await env.app.request("/api/health")).status).toBe(200)
    expect((await env.app.request("/api/session", { headers: jwt })).status).toBe(200)
  })

  it("pairs a browser with a one-time code", async () => {
    const code = await env.s.devices.startPairing("phone")
    const bad = await env.app.request("/api/pair", { method: "POST", headers: { ...jwt, origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ code: "00000000" }) })
    expect(bad.status).toBe(401)
    const r = await env.app.request("/api/pair", { method: "POST", headers: { ...jwt, origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ code }) })
    expect(r.status).toBe(200)
    const cookie = r.headers.get("set-cookie") ?? ""
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/SameSite=Strict/)
    const token = cookie.split(";")[0]
    expect((await env.app.request("/api/data", { headers: { ...jwt, cookie: token } })).status).toBe(200)
    // The code works once.
    const again = await env.app.request("/api/pair", { method: "POST", headers: { ...jwt, origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ code }) })
    expect(again.status).toBe(401)
  })

  it("voids a pairing code after five wrong attempts", async () => {
    const code = await env.s.devices.startPairing("phone")
    for (let i = 0; i < 5; i++) expect(await env.s.devices.pair("12345678")).toBeNull()
    expect(await env.s.devices.pair(code)).toBeNull()
  })

  it("blocks cross-site writes with the cookie", async () => {
    const { token } = await env.s.devices.create("mac", "full")
    const cookie = `autocratico_device=${token}`
    const body = JSON.stringify({ key: "car-tax@2027-01-31", done: true })
    const headers = { ...jwt, cookie, "content-type": "application/json" }
    expect((await env.app.request("/api/done", { method: "POST", headers: { ...headers, origin: "https://evil.example" }, body })).status).toBe(403)
    expect((await env.app.request("/api/done", { method: "POST", headers, body })).status).toBe(403)
    expect((await env.app.request("/api/done", { method: "POST", headers: { ...headers, origin: ORIGIN }, body })).status).toBe(200)
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
    const form = new FormData()
    form.append("file", new File([new Uint8Array([37, 80, 68, 70])], "../../bolletta.pdf"))
    form.append("text", "Bolletta luce")
    const r = await app.request("/api/ingest", { method: "POST", headers: LOCAL, body: form })
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
    const w = (await (await app.request("/api/ingest", { method: "POST", headers: LOCAL, body: wa })).json()) as any
    expect(w.source).toBe("whatsapp")
    expect(w.files).toEqual(["00000012-PHOTO.jpg"])
    const detail = (await (await app.request(`/api/inbox/${w.id}`, { headers: LOCAL })).json()) as any
    expect(detail.content).toContain("Ti giro la multa")
  })

  it("serves attachments as downloads only", async () => {
    const { app, s } = setup()
    const item = await s.inbox.add({ source: "upload", files: [{ name: "x.html", data: new TextEncoder().encode("<script>alert(1)</script>") }] })
    const r = await app.request(`/api/inbox/${item.id}/files/x.html`, { headers: LOCAL })
    expect(r.headers.get("content-type")).toBe("application/octet-stream")
    expect(r.headers.get("content-disposition")).toMatch(/^attachment/)
  })
})

describe("agent", () => {
  it("keeps the triage profile away from secrets, the web and server files", () => {
    const { allowed, denied } = tools("triage", "/data")
    expect(allowed).toContain("Edit(//data/**)")
    expect(allowed.some((t) => t.startsWith("WebFetch") || t === "WebSearch" || t === "Bash")).toBe(false)
    expect(denied).toEqual(expect.arrayContaining(["WebFetch", "WebSearch", "Read(//data/secrets/**)", "Edit(//data/state.json)", "Write(//data/inbox/*/item.json)"]))
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
