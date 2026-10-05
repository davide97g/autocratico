import * as React from "react"

import type { Data, Occurrence } from "@/lib/api"

/** Occurrences that just changed on the server (the agent, the chat, another device): they flash once. */
export const FreshContext = React.createContext<ReadonlySet<string>>(new Set())

export const useFresh = (key: string) => React.useContext(FreshContext).has(key)

const signature = (o: Occurrence) => JSON.stringify([o.title, o.date, o.amount, o.done_on, o.severity, o.notes, o.case])

/** Keys of the occurrences that are new or different in `after`. */
export function changedKeys(before: Data, after: Data): string[] {
  const old = new Map(before.agenda.map((o) => [o.key, signature(o)]))
  return after.agenda.filter((o) => old.get(o.key) !== signature(o)).map((o) => o.key)
}
