import * as React from "react"

import { API_BASE } from "@/lib/api"

/**
 * Server events (`/api/events`): `onFinance` runs when the finance app's synced data changes.
 * EventSource reconnects by itself; after a reconnect `ready` fires and the data is re-read once.
 */
export function useServerEvents(onFinance: () => void) {
  const handler = React.useRef(onFinance)
  React.useEffect(() => {
    handler.current = onFinance
  })
  React.useEffect(() => {
    if (typeof EventSource === "undefined") return
    const source = new EventSource(`${API_BASE}/api/events`, { withCredentials: true })
    let first = true
    const onReady = () => {
      if (!first) handler.current() // changes may have happened while the stream was down
      first = false
    }
    const onChange = () => handler.current()
    source.addEventListener("ready", onReady)
    source.addEventListener("finance", onChange)
    return () => source.close()
  }, [])
}
