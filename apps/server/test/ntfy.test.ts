import { describe, expect, it } from "vitest"

import { loadConfig } from "../src/config.ts"
import { fanOut, Ntfy } from "../src/ntfy.ts"
import { setup } from "./helpers.ts"

function fake() {
  const calls: { url: string; headers: Headers; body: string }[] = []
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers), body: String(init?.body) })
    return new Response("{}")
  }) as typeof fetch
  return { calls, fetcher }
}

describe("ntfy", () => {
  it("sends redacted text, with the token and an Open action for buttons", async () => {
    const f = fake()
    const ntfy = new Ntfy({ url: "https://ntfy.example/autocratico-topic", token: "tk_secret" }, "https://app.example", f.fetcher)
    await ntfy.notify("Bollo auto: ||€ 210,40|| entro domani", [[{ text: "Fatto", data: "done:x" }]])
    expect(f.calls).toHaveLength(1)
    const [c] = f.calls
    expect(c.url).toBe("https://ntfy.example/autocratico-topic")
    expect(c.body).not.toContain("210")
    expect(c.headers.get("authorization")).toBe("Bearer tk_secret")
    expect(c.headers.get("actions")).toBe("view, Open, https://app.example")
    expect(ntfy.host).toBe("ntfy.example")
  })

  it("fans out to every channel, and is off when none is set up", async () => {
    const a = fake()
    const b = fake()
    const both = fanOut([new Ntfy({ url: "https://a.example/t", token: null }, null, a.fetcher), null, new Ntfy({ url: "https://b.example/t", token: null }, null, b.fetcher)])
    await both!.notify("hi", [[{ text: "x", data: "y" }]])
    expect([a.calls.length, b.calls.length]).toEqual([1, 1])
    expect(a.calls[0].headers.get("actions")).toBeNull()
    expect(fanOut([null, null])).toBeNull()
  })

  it("needs a topic URL, and shows only the host in the status", async () => {
    process.env.NTFY_URL = "https://ntfy.sh/"
    expect(() => loadConfig()).toThrow(/topic URL/)
    process.env.NTFY_URL = "https://ntfy.sh/my-long-random-topic"
    try {
      const { app, s } = setup({ ntfy: loadConfig().ntfy })
      expect(s.ntfy?.host).toBe("ntfy.sh")
      expect(app).toBeTruthy()
    } finally {
      delete process.env.NTFY_URL
    }
  })
})
