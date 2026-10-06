// What changed, for the open views: the same topics the server's /api/events stream sends (pulse.ts).
export type Topic =
  | "data"
  | "inbox"
  | "archive"
  | "activity"
  | "jobs"
  | "chats"
  | "reminders"
  | "finance"
  | "usage"

type Listener = (topic: Topic) => void

const listeners = new Set<Listener>()
const timers = new Map<Topic, number>()

export function subscribe(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Debounced per topic, like the server: a burst of writes is one event. */
export function emit(topic: Topic) {
  if (timers.has(topic)) return
  timers.set(
    topic,
    window.setTimeout(() => {
      timers.delete(topic)
      for (const l of listeners) l(topic)
    }, 120)
  )
}
