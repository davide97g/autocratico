/** One-off reminders set from the chat, stored in data/reminders.json (server-owned), sent on Telegram when due. */
import { randomBytes } from "node:crypto"
import { join } from "node:path"

import { type Reminder, reminderTime } from "@autocratico/core"

import { locks, readJson, writeJson } from "./files.ts"

const KEEP_SENT_DAYS = 30

export class Reminders {
  readonly file: string
  readonly #timeZone: string

  constructor(data: string, timeZone: string) {
    this.file = join(data, "reminders.json")
    this.#timeZone = timeZone
  }

  #read(): Reminder[] {
    return readJson<{ reminders: Reminder[] }>(this.file, { reminders: [] }).reminders
  }

  #write(list: Reminder[]) {
    const cutoff = Date.now() - KEEP_SENT_DAYS * 86_400_000
    writeJson(this.file, { reminders: list.filter((r) => !r.sent || Date.parse(r.sent) > cutoff) })
  }

  /** Pending reminders, soonest first. */
  pending(): Reminder[] {
    return this.#read()
      .filter((r) => !r.sent)
      .sort((a, b) => (a.at < b.at ? -1 : 1))
  }

  get(id: string): Reminder | null {
    return this.#read().find((r) => r.id === id) ?? null
  }

  /** Add a reminder; `at` may be local time (deadlines' zone) or ISO with offset. Null when the time is not valid. */
  add(at: string, text: string, source: string): Promise<Reminder | null> {
    const when = reminderTime(at, this.#timeZone)
    if (!when || !text.trim()) return Promise.resolve(null)
    return locks.run(this.file, () => {
      const r: Reminder = {
        id: randomBytes(4).toString("hex"),
        at: when,
        text: text.trim().slice(0, 300),
        created: new Date().toISOString(),
        source,
        sent: null,
      }
      this.#write([...this.#read(), r])
      return r
    })
  }

  cancel(id: string): Promise<Reminder | null> {
    return locks.run(this.file, () => {
      const list = this.#read()
      const r = list.find((x) => x.id === id && !x.sent) ?? null
      if (r) this.#write(list.filter((x) => x !== r))
      return r
    })
  }

  /** Take the reminders that are due, marking them sent. */
  takeDue(now = new Date()): Promise<Reminder[]> {
    return locks.run(this.file, () => {
      const list = this.#read()
      const due = list.filter((r) => !r.sent && Date.parse(r.at) <= now.getTime())
      if (!due.length) return []
      const sent = now.toISOString()
      for (const r of due) r.sent = sent
      this.#write(list)
      return due
    })
  }

  /** Local date and time for messages, e.g. "ven 3 ott, 17:05". */
  format(at: string, locale: "it" | "en"): string {
    return new Intl.DateTimeFormat(locale === "it" ? "it-IT" : "en-GB", {
      timeZone: this.#timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(at))
  }
}
