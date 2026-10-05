/**
 * What changed on the server, for the open web apps (`/api/events`): each topic tells a view to read its data again.
 * The data folder is watched, so edits from the agent, the chat, Telegram, the CLI or a hand-edited file all count;
 * the jobs report their own progress (`jobs`), which lives in memory.
 */
import { type FSWatcher, watch } from "node:fs"
import { sep } from "node:path"

export const TOPICS = ["data", "inbox", "archive", "activity", "jobs", "chats", "reminders"] as const
export type Topic = (typeof TOPICS)[number]

/** Changes close together become one event: the agent writes several files in a row. */
const SETTLE_MS = 250

/** Which topic a path under the data folder belongs to, or null for files nobody shows (secrets, outputs, caches). */
export function topicOf(path: string): Topic | null {
  const parts = path.split(sep).join("/").split("/")
  const [top] = parts
  if (top === ".git") {
    // A new commit moves HEAD's log; objects and the index change far more often and mean nothing on their own.
    return parts[1] === "logs" && parts[2] === "HEAD" ? "activity" : null
  }
  if (["deadlines.toml", "state.json", "profile.toml", "investments.toml", "cases", "catalog"].includes(top)) return "data"
  if (top === "inbox") return "inbox"
  if (top === "archive") return "archive"
  if (top === "chats") return "chats"
  if (top === "reminders.json") return "reminders"
  if (top === "jobs") return "jobs"
  return null
}

export class Pulse {
  readonly #listeners = new Set<(topic: Topic) => void>()
  readonly #timers = new Map<Topic, NodeJS.Timeout>()
  #watcher: FSWatcher | null = null

  on(listener: (topic: Topic) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  emit(topic: Topic) {
    if (this.#timers.has(topic)) return
    this.#timers.set(
      topic,
      setTimeout(() => {
        this.#timers.delete(topic)
        for (const l of this.#listeners) l(topic)
      }, SETTLE_MS)
    )
  }

  /** Watch the data folder. Without recursive watching (old kernels, some network mounts) the views fall back to polling. */
  watch(dir: string) {
    if (this.#watcher) return
    try {
      this.#watcher = watch(dir, { recursive: true, persistent: false }, (_event, file) => {
        const topic = file ? topicOf(String(file)) : null
        if (topic) this.emit(topic)
      })
      this.#watcher.on("error", (e) => {
        console.error(`pulse: ${e.message}`)
        this.stop()
      })
    } catch (e) {
      console.error(`pulse: not watching ${dir}: ${(e as Error).message}`)
    }
  }

  stop() {
    this.#watcher?.close()
    this.#watcher = null
    for (const t of this.#timers.values()) clearTimeout(t)
    this.#timers.clear()
  }
}
