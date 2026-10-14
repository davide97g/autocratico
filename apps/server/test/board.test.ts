import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { SANDBOX_CSP } from "@autocratico/core"
import { finishAnswer } from "../src/chat-actions.ts"
import { tools } from "../src/claude.ts"
import { topicOf } from "../src/pulse.ts"
import { LOCAL_WRITE, owner, setup } from "./helpers.ts"

const widget = {
  id: "my-car",
  title: "Car",
  size: "small",
  spec: {
    root: "main",
    elements: {
      main: { type: "Stack", children: ["count"] },
      count: { type: "Metric", props: { label: "Car deadlines", value: { count: { from: "deadlines", areas: ["car"], days: 365 } } } },
    },
  },
}

function put(app: ReturnType<typeof setup>["app"], headers: Record<string, string>, body: unknown, id = "my-car") {
  return app.request(`/api/board/widgets/${id}`, { method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) })
}

describe("board", () => {
  it("adds, updates, moves and removes widgets, one commit each", async () => {
    const e = setup()
    await e.s.repo.init()
    const headers = await owner(e.app)
    await e.s.repo.commit("settle") // after the commit the setup started in the background
    // example/ ships two widgets
    expect(((await (await e.app.request("/api/board", { headers })).json()) as { widgets: { id: string }[] }).widgets.map((w) => w.id)).toEqual(["payments-6-months", "car"])

    let r = await put(e.app, headers, widget)
    expect(r.status).toBe(200)
    const first = (await r.json()) as { added: boolean; hash: string }
    expect(first.added).toBe(true)
    expect(first.hash).toMatch(/^[0-9a-f]+$/)
    r = await put(e.app, headers, { ...widget, id: "second", title: "Second" }, "second")
    r = await put(e.app, headers, { ...widget, title: "My car" })
    expect(((await r.json()) as { added: boolean }).added).toBe(false)

    const move = await e.app.request("/api/board/widgets/second/move", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ index: 0 }) })
    expect(move.status).toBe(200)
    const board = JSON.parse(readFileSync(join(e.data, "board.json"), "utf8"))
    expect(board.widgets.map((w: { id: string; title: string }) => `${w.id}:${w.title}`)).toEqual(["second:Second", "payments-6-months:Payments, next 6 months", "car:Car", "my-car:My car"])

    expect((await e.app.request("/api/board/widgets/my-car", { method: "DELETE", headers })).status).toBe(200)
    expect((await e.app.request("/api/board/widgets/my-car", { method: "DELETE", headers })).status).toBe(409)
    const subjects = (await e.s.repo.log(10)).map((c) => c.subject)
    expect(subjects.slice(0, 5)).toEqual(["Board: remove my-car", "Board: move second", "Board: update my-car", "Board: add second", "Board: add my-car"])
  })

  it("checks widgets against the catalog, whatever the client sends", async () => {
    const e = setup()
    const headers = await owner(e.app)
    const bad = { ...widget, spec: { root: "main", elements: { main: { type: "Html", props: { html: "<script>" } } } } }
    expect((await put(e.app, headers, bad)).status).toBe(400)
    expect((await put(e.app, headers, widget, "other")).status).toBe(400)
    expect((await put(e.app, LOCAL_WRITE, widget)).status).toBe(401)
  })

  it("keeps the agent's proposals for the web chat and points Telegram to the web app", async () => {
    const e = setup()
    const deps = { reminders: e.s.reminders, inbox: e.s.inbox, jobs: null, notify: false, locale: "en" as const, changes: null }
    const answer = `Here it is.\n\n\`\`\`widget\n${JSON.stringify(widget)}\n\`\`\``
    const web = await finishAnswer(answer, "web", "Maria", deps)
    expect(web).toMatch(/^Here it is\.\n\n```widget\n\{"id":"my-car","title":"Car","size":"small","kind":"spec","spec":/)
    expect(await finishAnswer(answer, "telegram", "Maria", deps)).toBe("Here it is.\n\n🧩 Widget proposed: Car. Open this chat in the web app to see it and add it to the Board.")
    const broken = await finishAnswer('Ok\n\n```widget\n{"id": "x", "title": "X", "spec": {"root": "a", "elements": {"a": {"type": "Iframe"}}}}\n```', "web", "Maria", deps)
    expect(broken).toMatch(/^Ok\n\n⚠️ Widget not valid: a: unknown type "Iframe"/)
  })

  it("is server-owned: the background agent cannot write it, the research agent cannot read it", () => {
    const triage = tools("triage", "/data")
    expect(triage.denied).toContain("Write(//data/board.json)")
    expect(triage.denied).toContain("Edit(//data/board.json)")
    expect(tools("research", "/data").denied).toContain("Read(//data/board.json)")
    expect(topicOf("board.json")).toBe("board")
  })

  it("saves custom widgets after checking their code, and serves the sandbox with its own CSP", async () => {
    const e = setup()
    const headers = await owner(e.app)
    const custom = { id: "heat", title: "Heat", size: "medium", kind: "custom", data: { due: { from: "deadlines", days: 365 } }, code: "ac.onUpdate(() => ac.render('<p>' + ac.data.due.length + '</p>'))" }
    expect((await put(e.app, headers, custom, "heat")).status).toBe(200)
    const saved = JSON.parse(readFileSync(join(e.data, "board.json"), "utf8")).widgets.at(-1)
    expect(saved).toMatchObject({ id: "heat", kind: "custom", data: { due: { from: "deadlines", days: 365 } } })
    const leaky = await put(e.app, headers, { ...custom, code: 'fetch("/api/data")' }, "heat")
    expect(leaky.status).toBe(400)
    expect(((await leaky.json()) as { error: string }).error).toMatch(/^code: no network/)

    // The page itself is part of the web build: here only its headers matter.
    const r = await e.app.request("/sandbox/widget.html", { headers })
    if (r.status === 200) {
      expect(r.headers.get("content-security-policy")).toBe(SANDBOX_CSP)
      expect(r.headers.get("x-frame-options")).toBe("SAMEORIGIN")
    }
    // Everything else keeps the app's own CSP.
    const page = await e.app.request("/", { headers })
    expect(page.headers.get("content-security-policy")).toContain("frame-ancestors 'none'")
  })
})
