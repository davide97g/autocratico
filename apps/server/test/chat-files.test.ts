import { cpSync, existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { Account } from "../src/account.ts"
import { createApp } from "../src/app.ts"
import { finishAnswer } from "../src/chat-actions.ts"
import type { Claude } from "../src/claude.ts"
import { loadConfig } from "../src/config.ts"
import { services } from "../src/services.ts"
import { owner } from "./helpers.ts"

const ROOT = resolve(import.meta.dirname, "../../..")
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"))

/** A server whose agent records the prompt and answers `answer`. */
function env(answer = "Ok.") {
  const data = mkdtempSync(join(tmpdir(), "autocratico-"))
  cpSync(join(ROOT, "example"), data, { recursive: true })
  const config = loadConfig({ data, jobs: false, telegramToken: null, claude: null })
  const prompts: string[] = []
  const claude = {
    available: true,
    async *run(o: { prompt: string }) {
      prompts.push(o.prompt)
      yield { type: "text", text: answer }
      yield { type: "end", cost: 0, duration_ms: 1 }
    },
  } as unknown as Claude
  const s = services(config, { jobs: null, telegram: null, verifyAccess: null, account: new Account(config, ":memory:"), claude })
  return { app: createApp(s), s, data, prompts }
}

async function upload(app: ReturnType<typeof createApp>, headers: Record<string, string>, files: [string, Uint8Array][]) {
  const form = new FormData()
  for (const [name, bytes] of files) form.append("file", new File([bytes], name))
  const { "content-type": _, ...rest } = headers
  return app.request("/api/chat/files", { method: "POST", headers: rest, body: form })
}

describe("chat attachments", () => {
  it("saves files, shows images inline and hands the paths to the agent", async () => {
    const e = env()
    const headers = await owner(e.app)
    const r = await upload(e.app, headers, [["screen shot.png", PNG], ["bill.pdf", new TextEncoder().encode("%PDF-1.4")]])
    expect(r.status).toBe(200)
    const files = (await r.json()) as { path: string; name: string; image: boolean }[]
    expect(files.map((f) => [f.name, f.image])).toEqual([["screen shot.png", true], ["bill.pdf", false]])
    expect(files[0].path).toMatch(/^chats\/files\/\d{4}-\d{2}-\d{2}-[0-9a-f]{8}\/screen shot\.png$/)

    const view = await e.app.request(`/api/chat/files?path=${encodeURIComponent(files[0].path)}&as=view`, { headers })
    expect(view.headers.get("content-type")).toBe("image/png")
    expect(view.headers.get("x-content-type-options")).toBe("nosniff")
    const pdf = await e.app.request(`/api/chat/files?path=${encodeURIComponent(files[1].path)}&as=view`, { headers })
    expect(pdf.headers.get("content-type")).toBe("application/octet-stream")

    const chat = await e.app.request("/api/chat", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ message: "", files: [files[0].path, "chats/files/../../secrets/auth.db"], locale: "it" }) })
    await chat.text()
    expect(e.prompts[0]).toContain(`[Server: the user attached a file to this message: \`${files[0].path}\``)
    expect(e.prompts[0]).not.toContain("secrets")
    const saved = e.s.store.chats("web")[0]
    expect(saved.messages[0]).toMatchObject({ role: "user", text: "(allegati)", files: [files[0].path] })

    // Deleting the chat deletes its attachments.
    e.s.store.deleteChat(saved.id)
    expect(existsSync(join(e.data, files[0].path))).toBe(false)
  })

  it("serves only files under chats/files", async () => {
    const e = env()
    const headers = await owner(e.app)
    writeFileSync(join(e.data, "chats-secret.txt"), "x")
    for (const path of ["secrets/auth.db", "chats/web-1.json", "chats/files/../../deadlines.toml", "inbox/x/item.json", "chats/files/2026-10-14-abcdef12/../../../profile.toml"]) {
      expect((await e.app.request(`/api/chat/files?path=${encodeURIComponent(path)}`, { headers })).status).toBe(404)
    }
    // A symlink placed in the folder cannot reach outside it.
    const r = await upload(e.app, headers, [["a.png", PNG]])
    const [{ path }] = (await r.json()) as { path: string }[]
    const link = path.replace("a.png", "link.toml")
    symlinkSync(join(e.data, "deadlines.toml"), join(e.data, link))
    expect((await e.app.request(`/api/chat/files?path=${encodeURIComponent(link)}`, { headers })).status).toBe(404)
    expect((await e.app.request("/api/chat/files", { method: "POST", headers: { host: headers.host, origin: headers.origin }, body: new FormData() })).status).toBe(401)
  })

  it("copies attachments into the inbox item the agent files", async () => {
    const e = env()
    const headers = await owner(e.app)
    const [{ path }] = (await (await upload(e.app, headers, [["notice.png", PNG]])).json()) as { path: string }[]
    const answer = `Lo archivio.\n\n\`\`\`inbox\n${JSON.stringify({ title: "TARI", text: "Avviso TARI, vedi foto", files: [path, "secrets/auth.db"] })}\n\`\`\``
    await finishAnswer(answer, "web", "Maria", { reminders: e.s.reminders, inbox: e.s.inbox, jobs: null, notify: false, locale: "it", changes: null, data: e.data })
    const item = e.s.inbox.list().find((i) => i.title === "TARI")!
    expect(item.files).toEqual(["notice.png"])
    expect(readFileSync(join(e.data, "inbox", item.folder, "notice.png"))).toEqual(Buffer.from(PNG))
  })
})
