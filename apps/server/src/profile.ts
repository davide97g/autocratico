/**
 * Writes to profile.toml from the web app: the sections edited in onboarding and the person's
 * name (owned by the account). Sections not sent stay as they are; the comment header is kept.
 */
import { existsSync, readFileSync } from "node:fs"

import type { ProfileInput } from "@autocratico/core"
import { dataPaths } from "@autocratico/core/node"
import { parse, stringify, TomlDate } from "smol-toml"

import { locks, writeAtomic } from "./files.ts"

const HEADER = `# Profile. In the web app every value is hidden in privacy mode.
# Never store passwords, PINs, PUKs or access codes here.
# "TODO" = still to fill in. Sections and keys are free-form; only person.name is read by the code.
`

type Row = Record<string, string | number | boolean | null>
type Table = Record<string, unknown>

/** Comment lines at the top of the file, else the default header. */
function header(text: string): string {
  const lines = text.split("\n")
  const end = lines.findIndex((l) => l.trim() !== "" && !l.trimStart().startsWith("#"))
  const head = lines.slice(0, end < 0 ? lines.length : end).join("\n").trimEnd()
  return head ? `${head}\n` : HEADER
}

/** Values as TOML: empty ones left out, ISO dates as dates. */
function row(input: Row, keep: Table = {}): Table {
  const out: Table = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === null || (typeof v === "string" && !v.trim())) continue
    out[k] = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? new TomlDate(v.trim()) : typeof v === "string" ? v.trim() : v
  }
  return { ...keep, ...out }
}

function update(data: string, change: (profile: Table) => void): Promise<void> {
  const file = dataPaths(data).profile
  return locks.run(file, () => {
    const text = existsSync(file) ? readFileSync(file, "utf8") : ""
    const profile = parse(text) as Table
    change(profile)
    // Plain tables first, arrays of tables after: the order people expect to read.
    const ordered: Table = {}
    for (const k of ["person", "work"]) if (profile[k] !== undefined) ordered[k] = profile[k]
    for (const [k, v] of Object.entries(profile)) if (!(k in ordered)) ordered[k] = v
    writeAtomic(file, `${header(text)}\n${stringify(ordered)}\n`)
  })
}

export function writeProfile(data: string, input: ProfileInput): Promise<void> {
  return update(data, (p) => {
    if (input.person) {
      const name = (p.person as Table | undefined)?.name
      // The name belongs to the account (setPersonName): it is never taken from here.
      const { name: _, ...rest } = input.person
      p.person = row(rest, name === undefined ? {} : { name })
    }
    if (input.work) p.work = row(input.work)
    for (const key of ["property", "vehicle"] as const) {
      const rows = input[key]
      if (!rows) continue
      const kept = rows.map((r) => row(r)).filter((r) => Object.keys(r).length)
      if (kept.length) p[key] = kept
      else delete p[key]
    }
  })
}

export function setPersonName(data: string, name: string): Promise<void> {
  return update(data, (p) => {
    const person = (p.person ?? {}) as Table
    p.person = { name, ...Object.fromEntries(Object.entries(person).filter(([k]) => k !== "name")) }
  })
}
