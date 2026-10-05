/**
 * Actions the read-only chat agent asks the server to perform, written as fenced blocks at the end
 * of its answer. The server validates them, acts, and removes them from the text shown to the user.
 *
 * ```reminder
 * {"at": "2026-10-03T17:05:00+02:00", "text": "Enter the TARI notice"}
 * ```
 * ```inbox
 * {"title": "TARI 2026", "text": "Notice received, first instalment due 16 October"}
 * ```
 * ```change
 * {"summary": "IMU: one-off fine, no more yearly payments", "ops": [{"op": "close", "id": "imu", "until": "2026-06-16"}]}
 * ```
 * A change block is validated and applied by the server (apps/server/src/changes.ts) as one commit.
 */

export type ReminderAction = { at: string; text: string }
export type InboxAction = { title: string; text: string }
/** Operations are checked by the server: here they are only carried as objects. */
export type ChangeAction = { summary: string; ops: Record<string, unknown>[] }
export type Actions = { reminders: ReminderAction[]; inbox: InboxAction[]; changes: ChangeAction[] }

const BLOCK = /```(reminder|inbox|change)[ \t]*\n([\s\S]*?)```/g
// While streaming: a block that has started but not ended yet.
const OPEN = /```(reminder|inbox|change)[\s\S]*$/

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}

export function extractActions(answer: string): { text: string; actions: Actions } {
  const actions: Actions = { reminders: [], inbox: [], changes: [] }
  const text = answer.replace(BLOCK, (_, kind: string, body: string) => {
    let values: unknown[] = []
    try {
      const parsed = JSON.parse(body)
      values = Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      return ""
    }
    for (const v of values) {
      if (!v || typeof v !== "object") continue
      const o = v as Record<string, unknown>
      if (kind === "change") {
        const ops = Array.isArray(o.ops) ? o.ops.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object") : []
        if (ops.length) actions.changes.push({ summary: str(o.summary, 200), ops })
      } else if (kind === "reminder") {
        const at = str(o.at, 40)
        const what = str(o.text, 300)
        if (at && what) actions.reminders.push({ at, text: what })
      } else {
        const what = str(o.text, 20_000)
        if (what) actions.inbox.push({ title: str(o.title, 200), text: what })
      }
    }
    return ""
  })
  return { text: stripActions(text), actions }
}

/** The answer without action blocks, also mid-stream (an unfinished block is hidden too). */
export function stripActions(answer: string): string {
  return answer.replace(BLOCK, "").replace(OPEN, "").trimEnd()
}

/** What the server did after an answer: one line each, appended by `finishAnswer` (apps/server/src/chat-actions.ts). */
export type Confirmation = { kind: "change" | "reminder" | "inbox" | "warning"; text: string; hash: string | null }

const CONFIRMATION = /^(✏️|⏰|📥|⚠️) (.+)$/u
const KINDS: Record<string, Confirmation["kind"]> = { "✏️": "change", "⏰": "reminder", "📥": "inbox", "⚠️": "warning" }
// "(change 55cb507, undo it from Activity)", "(modifica 55cb507, annullabile da Attività)"
const CHANGE_REF = /\s*\((?:change|modifica) ([0-9a-f]{7,40})\b[^)]*\)$/

/** Splits the server's confirmation lines (the last paragraph, when all its lines are such) from the answer. */
export function splitConfirmations(answer: string): { text: string; confirmations: Confirmation[] } {
  const cut = answer.lastIndexOf("\n\n")
  const tail = answer.slice(cut + 1).trim()
  const lines = tail.split("\n")
  if (!tail || !lines.every((l) => CONFIRMATION.test(l))) return { text: answer, confirmations: [] }
  const confirmations = lines.map((l): Confirmation => {
    const [, emoji, rest] = CONFIRMATION.exec(l)!
    const ref = CHANGE_REF.exec(rest)
    return { kind: KINDS[emoji], text: ref ? rest.slice(0, ref.index) : rest, hash: ref?.[1] ?? null }
  })
  return { text: cut < 0 ? "" : answer.slice(0, cut).trimEnd(), confirmations }
}

/**
 * When a reminder is due, as an ISO instant. Accepts ISO with an offset, or a local date-time
 * (YYYY-MM-DDTHH:MM[:SS]) read in `timeZone`. Null when unreadable, past, or more than a year away.
 */
export function reminderTime(at: string, timeZone: string, now = new Date()): string | null {
  let t: number
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(at)) {
    t = Date.parse(at)
  } else {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(at)
    if (!m) return null
    const [, y, mo, d, h, mi, s] = m.map(Number)
    const guess = Date.UTC(y, mo - 1, d, h, mi, s || 0)
    // Shift by the zone's offset at that moment (twice, to settle across DST changes).
    t = guess - offsetMs(timeZone, new Date(guess))
    t = guess - offsetMs(timeZone, new Date(t))
  }
  if (Number.isNaN(t) || t < now.getTime() - 60_000 || t > now.getTime() + 366 * 86_400_000) return null
  return new Date(t).toISOString()
}

/** Offset of `timeZone` from UTC at `date`, in milliseconds. */
export function offsetMs(timeZone: string, date: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name ?? "")
  if (!m) return 0
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) * 60_000
}

/** "2026-10-03 15:40 Saturday (UTC+02:00)": the current local time, for the agent's context. */
export function localNow(timeZone: string, now = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "long", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  )
  const off = offsetMs(timeZone, now) / 60_000
  const sign = off < 0 ? "-" : "+"
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0")
  const mm = String(Math.abs(off) % 60).padStart(2, "0")
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ${parts.weekday} (UTC${sign}${hh}:${mm})`
}
