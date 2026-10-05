import * as React from "react"

import { API_BASE } from "@/lib/api"

/** What the server announces on `/api/events` (apps/server/src/pulse.ts, plus the finance mirror). */
export type Topic = "data" | "inbox" | "archive" | "activity" | "jobs" | "chats" | "reminders" | "finance"
const TOPICS: Topic[] = ["data", "inbox", "archive", "activity", "jobs", "chats", "reminders", "finance"]

export type Connection = "connecting" | "live" | "offline"

type Listener = (topic: Topic) => void

/**
 * One EventSource for the whole app, opened by the first subscriber and closed with the last one.
 * EventSource reconnects by itself; after a reconnect every listener hears all its topics once,
 * since anything may have changed while the stream was down.
 */
const listeners = new Map<Listener, Set<Topic>>()
const connectionListeners = new Set<() => void>()
let source: EventSource | null = null
let connection: Connection = "connecting"
let everReady = false

function setConnection(c: Connection) {
  if (c === connection) return
  connection = c
  for (const l of connectionListeners) l()
}

function dispatch(topic: Topic) {
  for (const [l, topics] of listeners) if (topics.has(topic)) l(topic)
}

function open() {
  if (source || typeof EventSource === "undefined") {
    if (typeof EventSource === "undefined") setConnection("offline")
    return
  }
  const s = new EventSource(`${API_BASE}/api/events`, { withCredentials: true })
  source = s
  s.addEventListener("ready", () => {
    setConnection("live")
    if (everReady) for (const [l, topics] of listeners) for (const t of topics) l(t)
    everReady = true
  })
  s.addEventListener("error", () => setConnection(s.readyState === EventSource.CLOSED ? "offline" : "connecting"))
  for (const t of TOPICS) s.addEventListener(t, () => dispatch(t))
}

function close() {
  source?.close()
  source = null
  everReady = false
  setConnection("connecting")
}

function subscribe(listener: Listener, topics: Topic[]) {
  listeners.set(listener, new Set(topics))
  open()
  return () => {
    listeners.delete(listener)
    if (!listeners.size) close()
  }
}

/** Whether the live stream is up: views poll as a fallback while it is not. */
export function useConnection(): Connection {
  return React.useSyncExternalStore(
    (notify) => {
      connectionListeners.add(notify)
      return () => connectionListeners.delete(notify)
    },
    () => connection
  )
}

/** Runs `handler` whenever the server says one of `topics` changed. */
export function useServerEvents(topics: Topic | Topic[], handler: (topic: Topic) => void) {
  const ref = React.useRef(handler)
  React.useEffect(() => {
    ref.current = handler
  })
  const key = (Array.isArray(topics) ? topics : [topics]).join(",")
  React.useEffect(() => subscribe((t) => ref.current(t), key.split(",") as Topic[]), [key])
}

/**
 * `refresh` when one of `topics` changes, and every `fallbackMs` while the live stream is down
 * (an old proxy that buffers the stream, or no recursive file watching on the server).
 */
export function useLiveRefresh(topics: Topic | Topic[], refresh: () => void, fallbackMs = 20_000) {
  useServerEvents(topics, refresh)
  const live = useConnection() === "live"
  React.useEffect(() => {
    if (live) return
    const id = window.setInterval(() => !document.hidden && refresh(), fallbackMs)
    return () => window.clearInterval(id)
  }, [live, refresh, fallbackMs])
}
