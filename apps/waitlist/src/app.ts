// Public, unauthenticated endpoint: everything in the body comes from strangers.
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { z } from "zod"

import type { Store } from "./db.ts"
import { type DomainCheck, checkDomain, parseEmail } from "./email.ts"
import { type Judge, verdict } from "./jev.ts"

export interface Deps {
  store: Store
  judge: Judge | null
  /** Origins allowed to post (the landing page). */
  origins: string[]
  domainCheck?: (domain: string) => Promise<DomainCheck>
  limits?: { perClient: number; total: number; windowMs: number }
  now?: () => number
}

const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref"] as const

const Body = z.object({
  email: z.string().max(320),
  consent: z.literal(true),
  /** Honeypot: hidden from people, filled by naive bots. */
  website: z.string().max(200).optional(),
  locale: z.string().max(16).optional(),
  source: z.record(z.string(), z.string().max(120)).optional(),
})

export type Rejection = "invalid" | "domain" | "placeholder" | "disposable" | "typo"

/** Fixed-window counters: per client (Cloudflare's client IP header) and overall, to cap Jev spend. */
function limiter(perClient: number, total: number, windowMs: number, now: () => number) {
  let start = now()
  let all = 0
  const seen = new Map<string, number>()
  return (client: string) => {
    if (now() - start >= windowMs) {
      start = now()
      all = 0
      seen.clear()
    }
    const n = (seen.get(client) ?? 0) + 1
    seen.set(client, n)
    all++
    return n <= perClient && all <= total
  }
}

export function createApp(deps: Deps) {
  const app = new Hono()
  const allowed = new Set(deps.origins)
  const domainCheck = deps.domainCheck ?? ((d: string) => checkDomain(d))
  const { perClient, total, windowMs } = deps.limits ?? { perClient: 5, total: 300, windowMs: 10 * 60_000 }
  const allow = limiter(perClient, total, windowMs, deps.now ?? Date.now)

  app.get("/healthz", async (c) => {
    try {
      await deps.store.ping()
      return c.text("ok\n")
    } catch {
      return c.text("db down\n", 503)
    }
  })

  app.post("/api/waitlist", bodyLimit({ maxSize: 2048, onError: (c) => c.json({ error: "invalid" }, 413) }), async (c) => {
    const origin = c.req.header("origin")
    if (!origin || !allowed.has(origin)) return c.json({ error: "forbidden" }, 403)

    const client = c.req.header("cf-connecting-ip") ?? c.req.header("x-real-ip") ?? "local"
    if (!allow(client)) return c.json({ error: "rate" }, 429)

    const parsed = Body.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: "invalid" satisfies Rejection }, 422)
    const body = parsed.data
    // Bots get the same answer as people, so they have nothing to learn from.
    if (body.website) return c.json({ ok: true }, 201)

    const address = parseEmail(body.email)
    if (!address) return c.json({ error: "invalid" satisfies Rejection }, 422)
    if ((await domainCheck(address.domain)) === "none") return c.json({ error: "domain" satisfies Rejection }, 422)

    const judgment = deps.judge ? await deps.judge(address) : null
    const v = verdict(judgment)
    if (v !== "ok") {
      console.info(`[waitlist] rejected (${v}) @${address.domain}`)
      return c.json({ error: v satisfies Rejection }, 422)
    }

    const source: Record<string, string> = {}
    for (const k of UTM) if (body.source?.[k]) source[k] = body.source[k]
    try {
      const added = await deps.store.add({ email: address.email, locale: body.locale ?? null, source, judgment })
      console.info(`[waitlist] ${added ? "added" : "already there"} @${address.domain}${judgment ? "" : " (not judged)"}`)
    } catch (e) {
      console.error(`[waitlist] store failed: ${(e as Error).message}`)
      return c.json({ error: "server" }, 503)
    }
    // Same answer for new and known addresses: the form must not reveal who signed up.
    return c.json({ ok: true }, 201)
  })

  return app
}
