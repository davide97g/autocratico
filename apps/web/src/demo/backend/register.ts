// The register as the server reads and edits it: /api/data, documents behind a case, changes asked in
// the chat (the same operations as apps/server/src/changes.ts), occurrences marked done.
import {
  agenda,
  type ChangeAction,
  type Data,
  type Deadline,
  documentRefs,
  incomplete,
  parseCase,
  parseCatalogEntry,
  SEVERITIES,
} from "@autocratico/core"

import { deadline } from "./seed"
import { commit, type DemoState, state } from "./state"
import { today } from "./util"

export type Lang = "it" | "en"

/** The visitor's language, as the web app keeps it (the chat sends its own). */
export function lang(): Lang {
  try {
    const v = localStorage.getItem("autocratico.locale")
    if (v === "en" || v === "it") return v
  } catch {
    // storage unavailable
  }
  return "it"
}

/** Files a list of references points at: files as they are, folders expanded. */
export function documents(s: DemoState, refs: readonly string[]): string[] {
  const all = Object.keys(s.docs)
  const out: string[] = []
  for (const ref of refs) {
    const clean = ref.replace(/\/+$/, "")
    if (s.docs[clean]) out.push(clean)
    else
      for (const p of all.filter((p) => p.startsWith(`${clean}/`)).sort())
        out.push(p)
  }
  return [...new Set(out)]
}

export function data(s = state()): Data {
  const T = today()
  return {
    today: T,
    agenda: agenda(s.deadlines, { done: s.done }, T),
    incomplete: incomplete(s.deadlines),
    cases: s.cases
      .map((c) => ({
        ...parseCase(c.slug, c.md),
        documents: documents(s, documentRefs(c.md)),
      }))
      .sort((a, b) => b.slug.localeCompare(a.slug)),
    profile: s.profile,
    catalog: s.catalog
      .map((c) => parseCatalogEntry(c.name, c.md))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

/** Marks one occurrence done (today) or not done; null when the key is not in the agenda. */
export function setDone(key: string, done: boolean): string | null | undefined {
  const s = state()
  if (!data(s).agenda.some((o) => o.key === key)) return undefined
  if (done) s.done[key] = s.done[key] ?? today()
  else delete s.done[key]
  return s.done[key] ?? null
}

// ---------- changes asked in the chat ----------

export class ChangeError extends Error {}

const ID = /^[a-z0-9][a-z0-9-]{0,79}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
const KEY = /^[a-z0-9][a-z0-9-]*@\d{4}-\d{2}-\d{2}$/

function describe(op: Record<string, unknown>): string {
  if (op.op === "add") return `add ${(op.deadline as { id?: string })?.id}`
  if (op.op === "update")
    return `update ${op.id}: ${Object.keys((op.set as object) ?? {}).join(", ")}`
  if (op.op === "close")
    return `close ${op.id}${op.until ? ` (until ${op.until})` : ""}`
  if (op.op === "reopen") return `reopen ${op.id}`
  return `${op.op} ${op.key}`
}

function patch(d: Deadline, set: Record<string, unknown>) {
  for (const [k, v] of Object.entries(set)) {
    if (k === "date") d.date = v === "TODO" ? null : (v as string)
    else if (k === "amount") {
      d.amount = typeof v === "number" ? v : null
      if (v === "TODO") d.payment = true
    } else if (k === "amounts")
      d.amounts = v ? { ...d.amounts, ...(v as Record<string, number>) } : {}
    else if (k === "severity")
      d.severity = (v as Deadline["severity"]) ?? "medium"
    else if (k === "until") d.until = (v as string | null) ?? null
    else if (k === "repeat") d.repeat = (v as string | null) ?? "none"
    else if (k === "remind_days") d.remind_days = (v as number[] | null) ?? []
    else if (k === "sensitive") d.sensitive = Boolean(v)
    else if (k === "title" || k === "area") d[k] = String(v)
    else if (k === "case" || k === "notes" || k === "source")
      (d as Record<string, unknown>)[k] =
        k === "case"
          ? ((v as string | null) ?? null)
          : ((v as string | null) ?? "")
    else throw new ChangeError(`unknown field: ${k}`)
  }
  d.payment =
    d.payment || d.amount !== null || Object.keys(d.amounts).length > 0
}

/** One change block as one commit, all of it or nothing (like the server). */
export function applyChange(
  c: ChangeAction,
  via: string
): { hash: string | null; summary: string } {
  const s = state()
  const deadlines: Deadline[] = JSON.parse(JSON.stringify(s.deadlines))
  const done = { ...s.done }
  const T = today()
  for (const op of c.ops) {
    switch (op.op) {
      case "add": {
        const d = op.deadline as Record<string, unknown>
        if (typeof d?.id !== "string" || !ID.test(d.id))
          throw new ChangeError("ids are lowercase kebab-case")
        if (deadlines.some((x) => x.id === d.id))
          throw new ChangeError(`${d.id} already exists`)
        if (
          typeof d.title !== "string" ||
          typeof d.area !== "string" ||
          typeof d.date !== "string"
        )
          throw new ChangeError("title, area and date are required")
        const { id, title, area, date, ...rest } = d as {
          id: string
          title: string
          area: string
          date: string
        }
        const x = deadline({
          id,
          title,
          area,
          date: date === "TODO" ? null : date,
        })
        patch(x, rest)
        deadlines.push(x)
        break
      }
      case "update":
      case "close":
      case "reopen": {
        const d = deadlines.find((x) => x.id === op.id)
        if (!d) throw new ChangeError(`no deadline with id ${String(op.id)}`)
        if (op.op === "update")
          patch(d, (op.set as Record<string, unknown>) ?? {})
        else if (op.op === "close")
          d.until =
            typeof op.until === "string" && DAY.test(op.until) ? op.until : T
        else d.until = null
        if (!SEVERITIES.includes(d.severity))
          throw new ChangeError("invalid severity")
        break
      }
      case "done":
      case "undone": {
        const key = String(op.key)
        if (!KEY.test(key))
          throw new ChangeError("occurrence keys are <id>@YYYY-MM-DD")
        const known = agenda(deadlines, { done }, T).some((o) => o.key === key)
        if (!known) throw new ChangeError(`no occurrence ${key}`)
        if (op.op === "done") done[key] = done[key] ?? T
        else delete done[key]
        break
      }
      default:
        throw new ChangeError(`unknown operation: ${String(op.op)}`)
    }
  }
  const summary = c.summary || c.ops.map(describe).join("; ")
  const made = commit(
    `Chat: ${summary}`,
    () => {
      s.deadlines = deadlines
      s.done = done
    },
    {
      body: `${c.ops.map((o) => `- ${describe(o)}`).join("\n")}\n\nAsked in the ${via} chat.`,
    }
  )
  return { hash: made?.hash ?? null, summary }
}
