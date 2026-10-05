import * as React from "react"

import { type LiveJobs, liveJobs } from "@/lib/api"
import { useConnection, useServerEvents } from "@/lib/events"
import { unlessChanged } from "@/lib/utils"

/** Polling while the live stream is down (fast while something runs), and a slow safety net while it is up. */
const BUSY_MS = { live: 15_000, polling: 2_000 }
const IDLE_MS = { live: 60_000, polling: 15_000 }

export const isBusy = (l: LiveJobs | null) => Boolean(l && (l.current || l.waiting.length || l.triage))

/**
 * What the server's jobs are doing: read again whenever the server announces a change (`jobs` event),
 * polled as a fallback, never while the page is hidden. `onFinished` fires when the server goes back to idle
 * (data may have changed).
 */
export function useLiveJobs(onFinished?: () => void): LiveJobs | null {
  const [live, setLive] = React.useState<LiveJobs | null>(null)
  const finished = React.useRef(onFinished)
  React.useEffect(() => {
    finished.current = onFinished
  })
  const mode = useConnection() === "live" ? "live" : "polling"
  const poll = React.useRef<() => void>(() => undefined)

  React.useEffect(() => {
    let timer: number | undefined
    let busy = false
    let stopped = false
    let inFlight = false
    let again = false
    async function run() {
      window.clearTimeout(timer)
      if (document.hidden) return
      // A change announced while a request is out: read once more when it is back.
      if (inFlight) {
        again = true
        return
      }
      inFlight = true
      try {
        const l = await liveJobs()
        if (stopped) return
        setLive(unlessChanged(l))
        const now = isBusy(l)
        if (busy && !now) finished.current?.()
        busy = now
      } catch {
        // offline or not paired: try again later
      } finally {
        inFlight = false
      }
      if (again && !stopped) {
        again = false
        return void run()
      }
      if (!stopped) timer = window.setTimeout(run, busy ? BUSY_MS[mode] : IDLE_MS[mode])
    }
    poll.current = () => void run()
    const onVisible = () => !document.hidden && void run()
    document.addEventListener("visibilitychange", onVisible)
    void run()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [mode])

  useServerEvents("jobs", () => poll.current())
  return live
}
