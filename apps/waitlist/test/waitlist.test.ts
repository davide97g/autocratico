import { describe, expect, it } from "vitest"

import { createApp, type Deps } from "../src/app.ts"
import type { Signup, Store } from "../src/db.ts"
import { checkDomain, parseEmail, type Resolver } from "../src/email.ts"
import { type Judgment, jevJudge, verdict } from "../src/jev.ts"

const ORIGIN = "https://landing.example"
const CLEAN: Judgment = { placeholder: 0.05, disposable: 0.02, typo: 0.01 }

function memoryStore() {
  const rows: Signup[] = []
  const store: Store = {
    async add(s) {
      if (rows.some((r) => r.email === s.email)) return false
      rows.push(s)
      return true
    },
    async ping() {},
    async close() {},
  }
  return { rows, store }
}

function setup(over: Partial<Deps> = {}) {
  const { rows, store } = memoryStore()
  const app = createApp({ store, judge: async () => CLEAN, origins: [ORIGIN], domainCheck: async () => "ok", ...over })
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    app.request("/api/waitlist", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
  return { app, rows, post }
}

describe("parseEmail", () => {
  it("normalises case, whitespace and international domains", () => {
    expect(parseEmail("  Mario.Rossi@Example.IT ")).toEqual({ email: "mario.rossi@example.it", local: "mario.rossi", domain: "example.it" })
    expect(parseEmail("a@café.fr")?.domain).toBe("xn--caf-dma.fr")
  })

  it("rejects what cannot be an address", () => {
    for (const bad of ["", "nobody", "@x.it", "a@", "a@localhost", "a@x.c", "a..b@x.it", ".a@x.it", "a@-x.it", "a b@x.it", "a@x.123", `${"a".repeat(65)}@x.it`]) {
      expect(parseEmail(bad), bad).toBeNull()
    }
  })
})

describe("checkDomain", () => {
  const err = (code: string) => Object.assign(new Error(code), { code })
  const resolver = (mx: () => Promise<{ exchange: string }[]>, a: () => Promise<string[]>): Resolver => ({
    resolveMx: mx,
    resolve4: a,
    resolve6: async () => {
      throw err("ENODATA")
    },
  })

  it("accepts MX, falls back to address records, refuses null MX and missing domains", async () => {
    expect(await checkDomain("x.it", resolver(async () => [{ exchange: "mx.x.it" }], async () => []))).toBe("ok")
    expect(await checkDomain("x.it", resolver(async () => { throw err("ENODATA") }, async () => ["192.0.2.1"]))).toBe("ok")
    expect(await checkDomain("x.it", resolver(async () => [{ exchange: "" }], async () => ["192.0.2.1"]))).toBe("none")
    expect(await checkDomain("x.it", resolver(async () => { throw err("ENOTFOUND") }, async () => { throw err("ENOTFOUND") }))).toBe("none")
  })

  it("fails open when DNS itself fails", async () => {
    expect(await checkDomain("x.it", resolver(async () => { throw err("ETIMEOUT") }, async () => []))).toBe("unknown")
  })
})

describe("jev", () => {
  it("sends the address as state and reads the nouls", async () => {
    let sent: { state: unknown; questions: Record<string, unknown> } | undefined
    const judge = jevJudge("key", {
      fetch: async (_url, init) => {
        sent = JSON.parse(String(init?.body))
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer key")
        return Response.json({ answers: { placeholder: { type: "noul", noul: 0.9 }, disposable: { type: "noul", noul: 0.1 }, typo: { type: "noul", noul: 0 } } })
      },
    })
    expect(await judge({ email: "asdf@asdf.com", local: "asdf", domain: "asdf.com" })).toEqual({ placeholder: 0.9, disposable: 0.1, typo: 0 })
    expect(sent?.state).toEqual({ email: "asdf@asdf.com", local_part: "asdf", domain: "asdf.com" })
    expect(Object.keys(sent!.questions).sort()).toEqual(["disposable", "placeholder", "typo"])
  })

  it("gives null on errors and malformed answers", async () => {
    const a = { email: "a@b.it", local: "a", domain: "b.it" }
    expect(await jevJudge("k", { fetch: async () => new Response("no", { status: 529 }) })(a)).toBeNull()
    expect(await jevJudge("k", { fetch: async () => Response.json({ answers: { placeholder: { noul: 2 } } }) })(a)).toBeNull()
    expect(await jevJudge("k", { fetch: async () => { throw new TypeError("fetch failed") } })(a)).toBeNull()
  })

  it("rejects only confident judgments", () => {
    expect(verdict(null)).toBe("ok")
    expect(verdict({ ...CLEAN, placeholder: 0.79 })).toBe("ok")
    expect(verdict({ ...CLEAN, placeholder: 0.8 })).toBe("placeholder")
    expect(verdict({ ...CLEAN, disposable: 0.95 })).toBe("disposable")
    expect(verdict({ ...CLEAN, typo: 0.9, placeholder: 0.9 })).toBe("typo")
  })
})

describe("POST /api/waitlist", () => {
  it("stores a good address once and answers the same for duplicates", async () => {
    const { rows, post } = setup()
    const body = { email: "Mario@Example.it", consent: true, locale: "it", source: { utm_source: "x", evil: "y" } }
    expect((await post(body)).status).toBe(201)
    expect((await post(body)).status).toBe(201)
    expect(rows).toEqual([{ email: "mario@example.it", locale: "it", source: { utm_source: "x" }, judgment: CLEAN }])
  })

  it("needs the landing origin and consent", async () => {
    const { rows, post } = setup()
    expect((await post({ email: "a@b.it", consent: true }, { origin: "https://evil.example" })).status).toBe(403)
    expect((await post({ email: "a@b.it", consent: false })).status).toBe(422)
    expect((await post({ email: "a@b.it" })).status).toBe(422)
    expect(rows).toHaveLength(0)
  })

  it("explains rejections", async () => {
    const reason = async (deps: Partial<Deps>, email = "a@b.it") => ((await (await setup(deps).post({ email, consent: true })).json()) as { error: string }).error
    expect(await reason({}, "not-an-email")).toBe("invalid")
    expect(await reason({ domainCheck: async () => "none" })).toBe("domain")
    expect(await reason({ judge: async () => ({ ...CLEAN, placeholder: 0.97 }) })).toBe("placeholder")
    expect(await reason({ judge: async () => ({ ...CLEAN, disposable: 0.97 }) })).toBe("disposable")
    expect(await reason({ judge: async () => ({ ...CLEAN, typo: 0.97 }) })).toBe("typo")
  })

  it("fails open when Jev or DNS cannot answer", async () => {
    const { rows, post } = setup({ judge: async () => null, domainCheck: async () => "unknown" })
    expect((await post({ email: "a@b.it", consent: true })).status).toBe(201)
    expect(rows[0].judgment).toBeNull()
  })

  it("pretends to accept the honeypot", async () => {
    const { rows, post } = setup()
    expect((await post({ email: "a@b.it", consent: true, website: "http://spam" })).status).toBe(201)
    expect(rows).toHaveLength(0)
  })

  it("limits each client and the total", async () => {
    const { post } = setup({ limits: { perClient: 2, total: 3, windowMs: 60_000 } })
    const from = (ip: string) => post({ email: `${ip}@b.it`, consent: true }, { "cf-connecting-ip": ip })
    expect((await from("1")).status).toBe(201)
    expect((await from("1")).status).toBe(201)
    expect((await from("1")).status).toBe(429)
    expect((await from("2")).status).toBe(429)
  })

  it("refuses oversized bodies", async () => {
    const { post } = setup()
    expect((await post({ email: "a@b.it", consent: true, website: "x".repeat(4000) })).status).toBe(413)
  })
})
