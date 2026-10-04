import * as React from "react"

import { type LiveJobs, liveJobs } from "@/lib/api"
import { unlessChanged } from "@/lib/utils"

const BUSY_MS = 2_000
const IDLE_MS = 15_000

export const isBusy = (l: LiveJobs | null) => Boolean(l && (l.current || l.waiting.length || l.triage))

/**
 * What the server's jobs are doing, polled: often while something runs or is queued, rarely otherwise,
 * never while the page is hidden. `onFinished` fires when the server goes back to idle (data may have changed).
 */
export function useLiveJobs(onFinished?: () => void): LiveJobs | null {
  const [live, setLive] = React.useState<LiveJobs | null>(null)
  const finished = React.useRef(onFinished)
  React.useEffect(() => {
    finished.current = onFinished
  })

  React.useEffect(() => {
    let timer: number | undefined
    let busy = false
    let stopped = false
    async function poll() {
      window.clearTimeout(timer)
      if (document.hidden) return
      try {
        const l = await liveJobs()
        if (stopped) return
        setLive(unlessChanged(l))
        const now = isBusy(l)
        if (busy && !now) finished.current?.()
        busy = now
      } catch {
        // offline or not paired: try again later
      }
      if (!stopped) timer = window.setTimeout(poll, busy ? BUSY_MS : IDLE_MS)
    }
    const onVisible = () => !document.hidden && void poll()
    document.addEventListener("visibilitychange", onVisible)
    void poll()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])

  return live
}
