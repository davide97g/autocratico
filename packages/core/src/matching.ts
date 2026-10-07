/**
 * Payments seen in the finance source matched to open occurrences of the register: a bank debit for the
 * condominium fee, the loan instalment, the waste tax. Only proposals: the user confirms each one.
 */
import { addDays, daysBetween } from "./dates.ts"
import type { Deadline, FinanceMirror, Occurrence, PaymentMatch } from "./schema.ts"

/** Occurrences this far back are still looked at (a debit noticed late, an overdue payment). */
export const MATCH_BACK_DAYS = 60
/** A transaction may come this many days before the occurrence (paid early) or after it (late, value date). */
const EARLY_DAYS = 25
const LATE_DAYS = 10
/** An estimated amount still matches within this share. */
const ESTIMATE_TOLERANCE = 0.15

// Words of bank descriptions that say nothing about what was paid.
const STOP = new Set(
  "addebito bonifico pagamento pagam favore disposizione ordine carta debito credito sepa direct rata rate bancomat pos operazione spesa spese euro eur verso presso della delle dello degli payment transfer card from with your".split(" ")
)

function words(text: string): Set<string> {
  const plain = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  return new Set(plain.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w)))
}

function sameAmount(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= Math.max(0.5, a * tolerance)
}

/** A short stable id for an occurrence-transaction pair (FNV-1a), for buttons and URLs. */
export function matchId(key: string, transaction: string): string {
  let h = 0x811c9dc5
  for (const ch of `${key}|${transaction}`) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, "0")
}

/**
 * Proposals for open payments (occurrences with an amount, known, estimated or "TODO") due from
 * MATCH_BACK_DAYS ago to LATE_DAYS ahead, among expenses not yet linked to an occurrence. A pair counts
 * when the transaction is the deadline's recurring template, or when the amount fits and the category or
 * the description agrees; each occurrence and each transaction is used at most once, best pairs first.
 */
export function matchPayments(
  deadlines: Deadline[],
  agenda: Occurrence[],
  mirror: FinanceMirror,
  links: Record<string, string>,
  today: string,
  /** Pairs the user said are not the same payment (by matchId). */
  skip: ReadonlySet<string> = new Set()
): PaymentMatch[] {
  const byId = new Map(deadlines.map((d) => [d.id, d]))
  const linked = new Set(Object.values(links))
  const open = agenda.filter(
    (o) => !o.done_on && o.amount_basis !== null && !links[o.key] && o.date >= addDays(today, -MATCH_BACK_DAYS) && o.date <= addDays(today, LATE_DAYS)
  )
  const expenses = mirror.transactions.filter((t) => t.type === "expense" && !linked.has(t.id) && t.date <= today)
  const pairs: { score: number; match: PaymentMatch }[] = []
  for (const o of open) {
    const d = byId.get(o.id)
    if (!d) continue
    const known = words(`${d.title} ${d.notes} ${d.id.replace(/-/g, " ")}`)
    for (const t of expenses) {
      if (t.date < addDays(o.date, -EARLY_DAYS) || t.date > addDays(o.date, LATE_DAYS) || skip.has(matchId(o.key, t.id))) continue
      const reasons: PaymentMatch["reasons"] = []
      if (d.finance_recurring && t.recurringId === d.finance_recurring) reasons.push("recurring")
      const amountFits = o.amount !== null && sameAmount(o.amount, t.amount, o.amount_basis === "known" ? 0.01 : ESTIMATE_TOLERANCE)
      if (amountFits) reasons.push("amount")
      if (d.finance_category && t.category === d.finance_category) reasons.push("category")
      const shared = [...words(t.description)].filter((w) => known.has(w)).length
      if (shared) reasons.push("words")
      const fits =
        reasons.includes("recurring") ||
        (amountFits && (reasons.includes("category") || reasons.includes("words") || (o.amount_basis === "known" && Math.abs(daysBetween(o.date, t.date)) <= 5))) ||
        (o.amount === null && reasons.includes("category") && reasons.includes("words"))
      if (!fits) continue
      const score =
        (reasons.includes("recurring") ? 100 : 0) +
        (amountFits ? (o.amount_basis === "known" ? 60 : 30) : 0) +
        (reasons.includes("category") ? 20 : 0) +
        Math.min(shared, 3) * 10 -
        Math.abs(daysBetween(o.date, t.date)) / 2
      pairs.push({
        score,
        match: {
          id: matchId(o.key, t.id),
          key: o.key,
          title: o.title,
          date: o.date,
          amount: o.amount,
          amount_basis: o.amount_basis,
          reasons,
          transaction: { id: t.id, date: t.date, amount: t.amount, description: t.description },
        },
      })
    }
  }
  const usedKeys = new Set<string>()
  const usedTransactions = new Set<string>()
  const out: PaymentMatch[] = []
  for (const { match } of pairs.sort((a, b) => b.score - a.score)) {
    if (usedKeys.has(match.key) || usedTransactions.has(match.transaction.id)) continue
    usedKeys.add(match.key)
    usedTransactions.add(match.transaction.id)
    out.push(match)
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}
