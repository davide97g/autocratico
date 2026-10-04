/**
 * Corrections to the register asked for in the chat (```change blocks, see core/actions.ts),
 * carried out by the server: the chat agent itself stays read-only.
 *
 * - Only the owner reaches the chat (web session or paired Telegram chat), so a change block is
 *   the user's own request, confirmed in the conversation. Emails and documents never get here.
 * - Each block becomes one commit in the data folder's history, with only the files it touched:
 *   Activity lists it and Undo reverts it.
 * - Nothing is deleted: a deadline that ended gets `until` and stays in the file.
 * - deadlines.toml is edited in place, keeping comments and layout, then parsed again: when the
 *   result is not exactly the requested change, nothing is written.
 */
import { readFileSync } from "node:fs"

import { type ChangeAction, jsonable, parseDeadlines, parseToml, SEVERITIES } from "@autocratico/core"
import { dataPaths } from "@autocratico/core/node"
import { stringify, TomlDate } from "smol-toml"
import { z } from "zod"

import { locks, writeAtomic } from "./files.ts"
import type { DataRepo } from "./git.ts"
import type { Store } from "./store.ts"

/** A request that cannot be applied; the message is shown to the user. */
export class ChangeError extends Error {}

const Id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/, "ids are lowercase kebab-case")
const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "dates are YYYY-MM-DD")
  .refine((s) => new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), "not a real date")
const Key = z.string().regex(/^[a-z0-9][a-z0-9-]*@\d{4}-\d{2}-\d{2}$/, "occurrence keys are <id>@YYYY-MM-DD")

const FIELDS = {
  title: z.string().trim().min(1).max(200),
  area: z.string().trim().min(1).max(40),
  date: z.union([Day, z.literal("TODO")]),
  repeat: z.string().trim().max(40),
  until: Day,
  severity: z.enum(SEVERITIES),
  remind_days: z.array(z.number().int().min(0).max(400)).max(10),
  amount: z.union([z.number().nonnegative(), z.literal("TODO")]),
  amounts: z.record(Day, z.number().nonnegative()).refine((a) => Object.keys(a).length <= 120, "too many amounts"),
  sensitive: z.boolean(),
  case: z.string().max(120),
  notes: z.string().max(2000),
  source: z.string().max(300),
}
/** The order of keys in a new deadline, as in the file's schema. */
const ORDER = ["id", "title", "area", "severity", "date", "repeat", "until", "remind_days", "amount", "amounts", "sensitive", "case", "notes", "source"]

const NewDeadline = z.object({ id: Id, ...FIELDS }).partial().required({ id: true, title: true, area: true, date: true }).strict()
// null removes a field (back to its default); title, area and date always stay.
const Patch = z
  .object({
    ...FIELDS,
    repeat: FIELDS.repeat.nullable(),
    until: FIELDS.until.nullable(),
    severity: FIELDS.severity.nullable(),
    remind_days: FIELDS.remind_days.nullable(),
    amount: FIELDS.amount.nullable(),
    // merged into the recorded ones: a date set to null is removed
    amounts: z.record(Day, z.number().nonnegative().nullable()).nullable(),
    sensitive: FIELDS.sensitive.nullable(),
    case: FIELDS.case.nullable(),
    notes: FIELDS.notes.nullable(),
    source: FIELDS.source.nullable(),
  })
  .partial()
  .strict()
  .refine((s) => Object.keys(s).length > 0, "nothing to change")

export const ChangeOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), deadline: NewDeadline }),
  z.object({ op: z.literal("update"), id: Id, set: Patch }),
  z.object({ op: z.literal("close"), id: Id, until: Day.optional() }),
  z.object({ op: z.literal("reopen"), id: Id }),
  z.object({ op: z.literal("done"), key: Key }),
  z.object({ op: z.literal("undone"), key: Key }),
])
export type ChangeOp = z.infer<typeof ChangeOp>

type Table = Record<string, unknown>

/** A JSON value as TOML: ISO dates become dates. */
function toml(key: string, v: unknown): unknown {
  return (key === "date" || key === "until") && typeof v === "string" && v !== "TODO" ? new TomlDate(v) : v
}

/** `amounts` as an inline table, by date: `{ "YYYY-MM-DD" = euro, ... }`. */
function amountsLine(amounts: Record<string, number>): string {
  const entries = Object.keys(amounts)
    .sort()
    .map((k) => `"${k}" = ${Number.isInteger(amounts[k]) ? amounts[k].toFixed(1) : String(amounts[k])}`)
  return `amounts = { ${entries.join(", ")} }`
}

/** Objects with sorted keys, so two tables compare by content. */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon)
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Table)[k])]))
  return v
}

const HEADER = /^\s*\[/
const DEADLINE = /^\s*\[\[\s*deadline\s*\]\]\s*(#.*)?$/

/** Lines [start, end) of the [[deadline]] table whose id is `id`. */
function block(lines: string[], id: string): [number, number] {
  for (let h = 0; h < lines.length; h++) {
    if (!DEADLINE.test(lines[h])) continue
    let end = h + 1
    while (end < lines.length && !HEADER.test(lines[end])) end++
    for (let i = h + 1; i < end; i++) {
      const m = /^\s*id\s*=\s*(["'])(.*?)\1\s*(#.*)?$/.exec(lines[i])
      if (m && m[2] === id) return [h, end]
    }
    h = end - 1
  }
  throw new ChangeError(`no deadline with id "${id}"`)
}

/** The line after the last one of a `key = value` that starts at `i` (multi-line strings and arrays). */
function valueEnd(lines: string[], i: number): number {
  const value = lines[i].slice(lines[i].indexOf("=") + 1).trim()
  for (const q of ['"""', "'''"]) {
    if (!value.startsWith(q)) continue
    if (value.indexOf(q, 3) >= 0) return i + 1
    let j = i + 1
    while (j < lines.length && !lines[j].includes(q)) j++
    return j + 1
  }
  if (value.startsWith("[")) {
    let depth = 0
    for (let j = i; j < lines.length; j++) {
      const text = j === i ? value : lines[j]
      for (const ch of text.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, "")) {
        if (ch === "[") depth++
        else if (ch === "]") depth--
      }
      if (depth <= 0) return j + 1
    }
  }
  return i + 1
}

/** Set (or remove, with null) keys of one deadline, touching only their lines. */
function setKeys(text: string, id: string, values: Table): string {
  const lines = text.split("\n")
  for (const [key, value] of Object.entries(values)) {
    const [start, end] = block(lines, id)
    const at = lines.slice(start + 1, end).findIndex((l) => new RegExp(`^\\s*${key}\\s*=`).test(l))
    const line =
      value === null ? [] : key === "amounts" ? [amountsLine(value as Record<string, number>)] : stringify({ [key]: value }).trimEnd().split("\n")
    if (at >= 0) {
      const i = start + 1 + at
      lines.splice(i, valueEnd(lines, i) - i, ...line)
    } else if (line.length) {
      // After the table's last value, before the blank lines and comments that open the next section.
      let last = end - 1
      while (last > start && (!lines[last].trim() || lines[last].trimStart().startsWith("#"))) last--
      lines.splice(last + 1, 0, ...line)
    }
  }
  return lines.join("\n")
}

function describe(op: ChangeOp): string {
  switch (op.op) {
    case "add":
      return `add ${op.deadline.id}`
    case "update":
      return `update ${op.id}: ${Object.keys(op.set).join(", ")}`
    case "close":
      return `close ${op.id}${op.until ? ` (until ${op.until})` : ""}`
    case "reopen":
      return `reopen ${op.id}`
    default:
      return `${op.op} ${op.key}`
  }
}

export class Changes {
  readonly #store: Store
  readonly #repo: DataRepo
  readonly #file: string

  constructor(store: Store, repo: DataRepo) {
    this.#store = store
    this.#repo = repo
    this.#file = dataPaths(store.dir).deadlines
  }

  /** Check and apply one change block; returns its commit (null when git is not available). */
  async apply(change: ChangeAction, via: string): Promise<{ hash: string | null; summary: string }> {
    const ops = change.ops.map((o, i) => {
      const r = ChangeOp.safeParse(o)
      if (!r.success) throw new ChangeError(`operation ${i + 1}: ${r.error.issues[0]?.message ?? "invalid"}`)
      return r.data
    })
    if (!ops.length) throw new ChangeError("no operations")
    const today = this.#store.today()
    const touched: string[] = []
    const marks: { key: string; done: boolean }[] = []

    await locks.run(this.#file, () => {
      const before = readFileSync(this.#file, "utf8")
      const ids = new Set(parseDeadlines(before).map((d) => d.id))
      const expected = ((parseToml(before, "deadlines.toml").deadline ?? []) as Table[]).map((t) => ({ ...t }))
      let text = before
      for (const op of ops) {
        if (op.op === "done" || op.op === "undone") {
          if (!ids.has(op.key.split("@")[0])) throw new ChangeError(`no deadline with id "${op.key.split("@")[0]}"`)
          marks.push({ key: op.key, done: op.op === "done" })
          continue
        }
        if (op.op === "add") {
          if (ids.has(op.deadline.id)) throw new ChangeError(`a deadline with id "${op.deadline.id}" already exists`)
          const row: Table = {}
          for (const k of ORDER) {
            const v = (op.deadline as Table)[k]
            if (v !== undefined) row[k] = toml(k, v)
          }
          // amounts inline, so the table stays one [[deadline]] block (stringify would open a subtable)
          const { amounts, ...rest } = row
          const lines = [stringify({ deadline: [rest] }).trimEnd(), ...(amounts ? [amountsLine(amounts as Record<string, number>)] : [])]
          text = `${text.trimEnd()}\n\n${lines.join("\n")}\n`
          expected.push(row)
          ids.add(op.deadline.id)
          continue
        }
        const target = expected.find((t) => t.id === op.id)
        if (!target) throw new ChangeError(`no deadline with id "${op.id}"`)
        const set: Table = op.op === "close" ? { until: op.until ?? today } : op.op === "reopen" ? { until: null } : { ...op.set }
        if (set.amounts) {
          const merged = { ...((target.amounts as Record<string, number> | undefined) ?? {}) }
          for (const [on, v] of Object.entries(set.amounts as Record<string, number | null>)) {
            if (v === null) delete merged[on]
            else merged[on] = v
          }
          set.amounts = Object.keys(merged).length ? merged : null
        }
        const values: Table = {}
        for (const [k, v] of Object.entries(set)) {
          values[k] = v === null ? null : toml(k, v)
          if (v === null) delete target[k]
          else target[k] = values[k]
        }
        text = setKeys(text, op.id, values)
      }
      if (text === before) return
      parseDeadlines(text) // repeat, severity, dates and ids still valid
      const actual = parseToml(text, "deadlines.toml").deadline ?? []
      if (JSON.stringify(canon(jsonable(actual))) !== JSON.stringify(canon(jsonable(expected)))) {
        throw new ChangeError("deadlines.toml could not be edited safely: nothing was changed")
      }
      writeAtomic(this.#file, text)
      touched.push("deadlines.toml")
    })

    for (const m of marks) await this.#store.setDone(m.key, m.done)
    if (marks.length) touched.push("state.json")

    const summary = change.summary.replace(/\s+/g, " ").trim() || ops.map(describe).join("; ")
    const message = `Chat: ${summary}\n\n${ops.map((o) => `- ${describe(o)}`).join("\n")}\n\nAsked in the ${via} chat.`
    return { hash: await this.#repo.commitPaths(message, touched), summary }
  }
}
