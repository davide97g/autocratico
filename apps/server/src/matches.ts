/**
 * Payments seen in the finance source, proposed as the payment of open occurrences (core/matching.ts).
 * The user confirms each one (web app or Telegram): the occurrence is marked done and remembered as
 * paid by that transaction, so it is not recorded there a second time. A dismissed pair is never
 * proposed again. Kept in finance/matches.json, server-owned; forgotten with the finance source.
 */
import { join } from "node:path"

import { matchPayments, type PaymentMatch } from "@autocratico/core"
import { loadDeadlines } from "@autocratico/core/node"

import type { Finance } from "./finance.ts"
import { locks, readJson, writeJson } from "./files.ts"
import type { Notifier } from "./jobs.ts"
import type { Pulse } from "./pulse.ts"
import type { Store } from "./store.ts"

export type StoredMatch = PaymentMatch & { status: "open" | "accepted" | "dismissed"; at: string }
type MatchesFile = { matches: Record<string, StoredMatch> }

/** Proposals sent in one notification at most; the rest wait in the web app. */
const NOTIFY_MAX = 5

export function matchesFile(data: string): string {
  return join(data, "finance", "matches.json")
}

function read(data: string): Record<string, StoredMatch> {
  return readJson<MatchesFile>(matchesFile(data), { matches: {} }).matches ?? {}
}

/** Occurrence key -> transaction id, for the pairs the user confirmed. */
export function acceptedMatches(data: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of Object.values(read(data))) if (m.status === "accepted") out[m.key] = m.transaction.id
  return out
}

const TEXT = {
  it: {
    found: (n: number) => (n === 1 ? "Pagamento trovato nelle finanze" : `${n} pagamenti trovati nelle finanze`),
    paid: "Segna pagata",
    not: "Non è questo",
  },
  en: {
    found: (n: number) => (n === 1 ? "Payment found in your finances" : `${n} payments found in your finances`),
    paid: "Mark paid",
    not: "Not this one",
  },
}

type Context = {
  data: string
  store: Store
  finance: Finance
  locale: "it" | "en"
  notifier: () => Notifier | null
  pulse?: Pulse
}

export class PaymentMatches {
  readonly #c: Context

  constructor(context: Context) {
    this.#c = context
  }

  get #file() {
    return matchesFile(this.#c.data)
  }

  /** Proposals waiting for an answer whose occurrence is still open. */
  open(): PaymentMatch[] {
    const open = new Set(this.#openKeys())
    return Object.values(read(this.#c.data))
      .filter((m) => m.status === "open" && open.has(m.key))
      .map(({ status: _s, at: _a, ...m }) => m)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
  }

  #openKeys(): string[] {
    return this.#c.store
      .data()
      .agenda.filter((o) => !o.done_on)
      .map((o) => o.key)
  }

  /** Looks for new pairs; notifies the ones never proposed before. Returns them. */
  scan(): Promise<PaymentMatch[]> {
    return locks.run(this.#file, async () => {
      const { finance, store } = this.#c
      const mirror = finance.mirror()
      if (!mirror) return []
      const stored = read(this.#c.data)
      const accepted = Object.values(stored).filter((m) => m.status === "accepted")
      const links = { ...finance.links(), ...Object.fromEntries(accepted.map((m) => [m.key, m.transaction.id])) }
      const skip = new Set(Object.values(stored).filter((m) => m.status === "dismissed").map((m) => m.id))
      const found = matchPayments(loadDeadlines(store.dir), store.data().agenda, mirror, links, store.today(), skip)
      const ids = new Set(found.map((m) => m.id))
      let changed = false
      // Open proposals that no longer hold (paid otherwise, transaction gone, taken by a better pair).
      for (const [id, m] of Object.entries(stored)) {
        if (m.status === "open" && !ids.has(id)) {
          delete stored[id]
          changed = true
        }
      }
      const fresh = found.filter((m) => !stored[m.id])
      for (const m of fresh) stored[m.id] = { ...m, status: "open", at: new Date().toISOString() }
      if (fresh.length) changed = true
      if (changed) {
        writeJson(this.#file, { matches: stored })
        this.#c.pulse?.emit("data")
      }
      if (fresh.length) await this.#notify(fresh)
      return fresh
    })
  }

  async #notify(fresh: PaymentMatch[]) {
    const notifier = this.#c.notifier()
    if (!notifier) return
    const t = TEXT[this.#c.locale]
    const shown = fresh.slice(0, NOTIFY_MAX)
    const lines = [`💳 ${t.found(fresh.length)}`]
    for (const m of shown) {
      const tx = m.transaction
      lines.push(`• ${m.title} (${m.date}) ↔ ${tx.date} ||€ ${tx.amount.toFixed(2)}|| ||${tx.description.slice(0, 60)}||`)
    }
    const buttons = shown.map((m) => [
      { text: `✓ ${t.paid}: ${m.title.slice(0, 28)}`, data: `pay:${m.id}` },
      { text: `✗ ${t.not}`, data: `nopay:${m.id}` },
    ])
    await notifier.notify(lines.join("\n"), buttons)
  }

  /** The user confirms a proposal: the occurrence is marked done, paid by that transaction. */
  accept(id: string): Promise<PaymentMatch | null> {
    return this.#answer(id, "accepted")
  }

  /** The user says it is not the same payment: never proposed again. */
  async dismiss(id: string): Promise<boolean> {
    return (await this.#answer(id, "dismissed")) !== null
  }

  #answer(id: string, status: "accepted" | "dismissed"): Promise<PaymentMatch | null> {
    return locks.run(this.#file, async () => {
      const stored = read(this.#c.data)
      const m = stored[id]
      if (!m || m.status !== "open") return null
      if (status === "accepted") {
        if (!this.#openKeys().includes(m.key)) return null // marked done meanwhile, or the deadline changed
        await this.#c.store.setDone(m.key, true)
      }
      stored[id] = { ...m, status, at: new Date().toISOString() }
      writeJson(this.#file, { matches: stored })
      this.#c.pulse?.emit("data")
      const { status: _s, at: _a, ...match } = m
      return match
    })
  }
}
