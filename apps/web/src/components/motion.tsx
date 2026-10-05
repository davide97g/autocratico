import * as React from "react"
import { cn } from "cn"

import { useReducedMotion } from "@/lib/prefs"

const easeOutExpo = (x: number) => (x === 1 ? 1 : 1 - 2 ** (-10 * x))

/** A number that rolls from its previous value to the new one (from 0 the first time). */
export function CountUp({
  value,
  duration = 900,
  format = (n) => String(Math.round(n)),
  className,
}: {
  value: number
  duration?: number
  /** How a value on the way is written (integers by default). */
  format?: (n: number) => string
  className?: string
}) {
  const reduced = useReducedMotion()
  const [shown, setShown] = React.useState(reduced ? value : 0)
  const from = React.useRef(reduced ? value : 0)

  React.useEffect(() => {
    if (reduced) {
      from.current = value
      return
    }
    const start = performance.now()
    const begin = from.current
    let frame = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const v = begin + (value - begin) * easeOutExpo(p)
      from.current = v
      setShown(v)
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration, reduced])

  return (
    <span className={cn("tabular-nums", className)} aria-label={format(value)}>
      <span aria-hidden>{format(reduced ? value : shown)}</span>
    </span>
  )
}

/** Text with a light running across it: something is in progress (the agent thinking, a job running). */
export function ShinyText({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("shiny-text", className)}>{children}</span>
}

/** Staggered entrance for the n-th item of a list (`rise-in` in index.css). */
export const stagger = (i: number): React.CSSProperties => ({ "--i": Math.min(i, 12) }) as React.CSSProperties
