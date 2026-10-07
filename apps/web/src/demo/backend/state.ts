// The demo's whole register, in memory and in sessionStorage: it survives a reload and ends with the tab.
// Every change goes through `commit()`, which records what it touched, so Activity shows a real patch
// and Undo puts back exactly what changed (like the data folder's git history on the server).
import type {
  AccountSession,
  Chat,
  Commit,
  Deadline,
  Device,
  FinanceMirror,
  GmailSetup,
  InboxItem,
  InvestmentSnapshot,
  JobRun,
  Profile,
  Reminder,
  Usage,
} from "@autocratico/core"

import { emit, type Topic } from "./bus"
import { profileToml, unifiedDiff, deadlineToml } from "./toml"
import { nowIso, shortHash } from "./util"

/** A made-up document, drawn when it is opened (no binaries in the repo, nothing fetched). */
export type DocSpec =
  | {
      kind: "scan"
      title: string
      lines: string[]
      issuer: string
      tone?: "paper" | "card" | "photo"
    }
  | { kind: "pdf"; title: string; lines: string[] }
  /** A file the visitor added: kept as a data URL while it fits in the tab's storage. */
  | { kind: "upload"; name: string; mime: string; data: string | null }

/** An inbox item with its text; `arrival` names the scripted email it is (jobs.ts). */
export type DemoInbox = InboxItem & { content: string; arrival?: string }
export type DemoEmail = {
  /** archive/email/<folder> */
  path: string
  title: string
  from: string
  date: string
  account: string
  text: string
  /** Attachments, data-relative paths. */
  files: string[]
  thread: string
}
export type DemoCase = { slug: string; md: string }
export type DemoCatalog = { name: string; md: string }
export type TelegramChat = { id: number; name: string; paired: string }

/** What a commit touched, before and after: null = it did not exist. */
export type Touched = {
  deadlines: Record<string, [Deadline | null, Deadline | null]>
  done: Record<string, [string | null, string | null]>
  cases: Record<string, [string | null, string | null]>
  profile: [Profile, Profile] | null
}
export type DemoCommit = Commit & { touched: Touched; patch: string }

export type DemoState = {
  v: 1
  created: string
  name: string
  deadlines: Deadline[]
  done: Record<string, string>
  profile: Profile
  cases: DemoCase[]
  catalog: DemoCatalog[]
  inbox: DemoInbox[]
  emails: DemoEmail[]
  docs: Record<string, DocSpec>
  chats: Chat[]
  commits: DemoCommit[]
  runs: JobRun[]
  reminders: Reminder[]
  usage: Usage
  mirror: FinanceMirror
  /** Occurrence key -> transaction id, for paid occurrences recorded in the finance source. */
  links: Record<string, string>
  investments: InvestmentSnapshot[]
  financeConnected: boolean
  devices: Device[]
  telegram: TelegramChat[]
  gmail: GmailSetup
  sessions: AccountSession[]
  /** Scripted arrivals already played (jobs.ts). */
  arrived: string[]
}

const KEY = "autocratico.demo"

let current: DemoState | null = null
let saveTimer: number | undefined

export function load(): DemoState | null {
  if (current) return current
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as DemoState
    if (s?.v !== 1) return null
    current = s
    return s
  } catch {
    return null
  }
}

export function start(s: DemoState) {
  current = s
  saveNow()
}

export function state(): DemoState {
  if (!current) throw new Error("demo not started")
  return current
}

function saveNow() {
  if (!current) return
  try {
    sessionStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Over the tab's quota (big uploads): keep their names, drop their contents, try once more.
    for (const d of Object.values(current.docs))
      if (d.kind === "upload") d.data = null
    try {
      sessionStorage.setItem(KEY, JSON.stringify(current))
    } catch {
      // storage unavailable: the demo keeps running in memory only
    }
  }
}

/** Writes soon, and tells the open views which parts changed (as the server's pulse does). */
export function changed(...topics: Topic[]) {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(saveNow, 200)
  for (const t of topics) emit(t)
}

export function reset() {
  current = null
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // nothing to remove
  }
}

// ---------- commits ----------

const clone = <T>(v: T): T =>
  v === undefined ? v : JSON.parse(JSON.stringify(v))

type Snapshot = {
  deadlines: Map<string, Deadline>
  done: Record<string, string>
  cases: Map<string, string>
  profile: string
}

function snapshot(s: DemoState): Snapshot {
  return {
    deadlines: new Map(s.deadlines.map((d) => [d.id, clone(d)])),
    done: { ...s.done },
    cases: new Map(s.cases.map((c) => [c.slug, c.md])),
    profile: JSON.stringify(s.profile),
  }
}

function compare(before: Snapshot, s: DemoState): Touched {
  const t: Touched = { deadlines: {}, done: {}, cases: {}, profile: null }
  const after = snapshot(s)
  for (const id of new Set([
    ...before.deadlines.keys(),
    ...after.deadlines.keys(),
  ])) {
    const a = before.deadlines.get(id) ?? null
    const b = after.deadlines.get(id) ?? null
    if (JSON.stringify(a) !== JSON.stringify(b)) t.deadlines[id] = [a, b]
  }
  for (const k of new Set([
    ...Object.keys(before.done),
    ...Object.keys(after.done),
  ])) {
    const a = before.done[k] ?? null
    const b = after.done[k] ?? null
    if (a !== b) t.done[k] = [a, b]
  }
  for (const slug of new Set([...before.cases.keys(), ...after.cases.keys()])) {
    const a = before.cases.get(slug) ?? null
    const b = after.cases.get(slug) ?? null
    if (a !== b) t.cases[slug] = [a, b]
  }
  if (before.profile !== after.profile)
    t.profile = [JSON.parse(before.profile), clone(s.profile)]
  return t
}

function filesOf(t: Touched, extra: string[]): string[] {
  const files: string[] = []
  if (Object.keys(t.deadlines).length) files.push("deadlines.toml")
  if (Object.keys(t.done).length) files.push("state.json")
  if (t.profile) files.push("profile.toml")
  for (const slug of Object.keys(t.cases)) files.push(`cases/${slug}/README.md`)
  return [...files, ...extra.filter((f) => !files.includes(f))]
}

function patchOf(
  hash: string,
  date: string,
  message: string,
  t: Touched,
  extra: string[]
): string {
  const parts: string[] = []
  const add = (file: string, a: string, b: string, created = false) => {
    const body = unifiedDiff(a, b)
    if (!body) return
    parts.push(
      `diff --git a/${file} b/${file}`,
      created ? "new file mode 100644\n--- /dev/null" : `--- a/${file}`,
      `+++ b/${file}`,
      body
    )
  }
  const ids = Object.keys(t.deadlines)
  if (ids.length) {
    add(
      "deadlines.toml",
      ids
        .map((id) =>
          t.deadlines[id][0] ? deadlineToml(t.deadlines[id][0]!) : ""
        )
        .join("\n"),
      ids
        .map((id) =>
          t.deadlines[id][1] ? deadlineToml(t.deadlines[id][1]!) : ""
        )
        .join("\n")
    )
  }
  const keys = Object.keys(t.done).sort()
  if (keys.length) {
    const line = (k: string, v: string | null) =>
      v ? `    "${k}": "${v}",` : ""
    add(
      "state.json",
      keys.map((k) => line(k, t.done[k][0])).join("\n"),
      keys.map((k) => line(k, t.done[k][1])).join("\n")
    )
  }
  if (t.profile)
    add("profile.toml", profileToml(t.profile[0]), profileToml(t.profile[1]))
  for (const [slug, [a, b]] of Object.entries(t.cases))
    add(`cases/${slug}/README.md`, a ?? "", b ?? "", a === null)
  // Filed emails and documents: added as they are, their contents are in the Archive.
  for (const f of extra)
    parts.push(
      `diff --git a/${f} b/${f}`,
      "new file mode 100644",
      /\.(md|txt)$/.test(f) ? "(text in the Archive)" : `Binary files /dev/null and b/${f} differ`
    )
  const files = filesOf(t, extra)
  const stat = files.map((f) => ` ${f} | ${extra.includes(f) ? (/\.(md|txt)$/.test(f) ? "new" : "Bin") : "changed"}`).join("\n")
  return `${hash} ${date}\n${message}\n\n${stat}\n ${files.length} file${files.length === 1 ? "" : "s"} changed\n\n${parts.join("\n")}`
}

/**
 * Runs `mutate` as one commit: what it touched is recorded for the patch and for Undo.
 * Returns null when nothing changed (no empty commits, as with git).
 */
export function commit(
  subject: string,
  mutate: () => void,
  opts: { body?: string; files?: string[]; date?: string; s?: DemoState } = {}
): DemoCommit | null {
  const s = opts.s ?? state()
  const before = snapshot(s)
  mutate()
  const touched = compare(before, s)
  const extra = opts.files ?? []
  if (
    !Object.keys(touched.deadlines).length &&
    !Object.keys(touched.done).length &&
    !Object.keys(touched.cases).length &&
    !touched.profile &&
    !extra.length
  )
    return null
  const hash = shortHash()
  const date = opts.date ?? nowIso()
  const message = opts.body ? `${subject}\n\n${opts.body}` : subject
  const c: DemoCommit = {
    hash,
    date,
    subject,
    files: filesOf(touched, extra),
    touched,
    patch: patchOf(hash, date, message, touched, extra),
  }
  s.commits.unshift(c)
  if (!opts.s) changed("activity", "data")
  return c
}

/** Undo one commit with a new one: what it touched goes back as it was. */
export function revert(hash: string): DemoCommit | null {
  const s = state()
  const c = s.commits.find((x) => x.hash === hash)
  if (!c) return null
  return commit(
    `Revert "${c.subject}"`,
    () => {
      for (const [id, [before]] of Object.entries(c.touched.deadlines)) {
        const i = s.deadlines.findIndex((d) => d.id === id)
        if (before && i >= 0) s.deadlines[i] = clone(before)
        else if (before) s.deadlines.push(clone(before))
        else if (i >= 0) s.deadlines.splice(i, 1)
      }
      for (const [k, [before]] of Object.entries(c.touched.done)) {
        if (before) s.done[k] = before
        else delete s.done[k]
      }
      for (const [slug, [before]] of Object.entries(c.touched.cases)) {
        const i = s.cases.findIndex((x) => x.slug === slug)
        if (before !== null && i >= 0) s.cases[i] = { slug, md: before }
        else if (before !== null) s.cases.push({ slug, md: before })
        else if (i >= 0) s.cases.splice(i, 1)
      }
      if (c.touched.profile) s.profile = clone(c.touched.profile[0])
    },
    { body: `This reverts commit ${c.hash}.` }
  )
}
