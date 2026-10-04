/** Money to pay over the next months, from the agenda's known and estimated amounts. */
import { addMonths } from "./dates.ts"
import type { Occurrence } from "./schema.ts"

export type Payments = {
  /** Last day counted: `months` after today. */
  end: string
  /** Payments not done by `end`, overdue ones included, by date. */
  items: Occurrence[]
  /** Sum of the known amounts, and of the estimated ones. */
  known: number
  estimated: number
  /** Of the two sums, what is already overdue. */
  overdue: number
  /** Payments with no amount to go by: not in the sums. */
  unknown: number
}

const cents = (n: number) => Math.round(n * 100) / 100

export function payments(agenda: Occurrence[], today: string, months: number): Payments {
  const end = addMonths(today, months)
  const items = agenda.filter((o) => o.amount_basis !== null && !o.done_on && o.date <= end)
  const sum = (list: Occurrence[]) => cents(list.reduce((s, o) => s + (o.amount ?? 0), 0))
  return {
    end,
    items,
    known: sum(items.filter((o) => o.amount_basis === "known")),
    estimated: sum(items.filter((o) => o.amount_basis === "estimate")),
    overdue: sum(items.filter((o) => o.days < 0)),
    unknown: items.filter((o) => o.amount_basis === "unknown").length,
  }
}
