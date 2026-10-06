import * as React from "react"
import { cn } from "cn"

import { Sensitive } from "@/components/privacy"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useI18n } from "@/i18n"
import type { Occurrence } from "@/lib/api"
import { areaName, parseDate } from "@/lib/format"
import { level, ORDER, severity, STYLE } from "@/lib/status"

const LANE_HEIGHT = 40

function useWidth<T extends HTMLElement>() {
  const ref = React.useRef<T>(null)
  const [w, setW] = React.useState(0)
  React.useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

type Placed = { o: Occurrence; x: number; w: number; lane: number; flipped: boolean }

/** Lay pills out in lanes so they never overlap. */
function layout(items: Occurrence[], start: number, end: number, W: number): Placed[] {
  const laneEnds: number[] = []
  return items.map((o) => {
    const x = ((parseDate(o.date).getTime() - start) / (end - start)) * W
    const w = Math.min(160, 44 + o.title.length * 6.6)
    const flipped = x + w > W
    const from = Math.max(0, flipped ? x - w : x)
    let lane = laneEnds.findIndex((f) => f < from - 6)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = from + w
    return { o, x: from, w, lane, flipped }
  })
}

export function Timeline({
  agenda,
  today,
  months,
  onOpen,
}: {
  agenda: Occurrence[]
  today: string
  months: number
  onOpen: (o: Occurrence) => void
}) {
  const { t, fmt } = useI18n()
  const [ref, W] = useWidth<HTMLDivElement>()
  const start = parseDate(today).getTime()
  const endDate = parseDate(today)
  endDate.setMonth(endDate.getMonth() + months)
  const end = endDate.getTime()

  const inWindow = agenda.filter((o) => {
    const time = parseDate(o.date).getTime()
    return time >= start && time <= end
  })

  // Most urgent area on top: by the level of its most pressing deadline, then by how soon it falls.
  const rank = (o: Occurrence) => ORDER.indexOf(level(o)) * 100_000 + o.days
  const rows = [...new Set(inWindow.map((o) => o.area))]
    .map((area) => {
      const own = inWindow.filter((o) => o.area === area)
      return { area, urgency: Math.min(...own.map(rank)), items: W ? layout(own, start, end, W) : [] }
    })
    .sort((a, b) => a.urgency - b.urgency)

  const ticks: { x: number; label: string }[] = []
  const tick = parseDate(today)
  tick.setDate(1)
  tick.setMonth(tick.getMonth() + 1)
  while (W && tick.getTime() <= end) {
    ticks.push({ x: ((tick.getTime() - start) / (end - start)) * W, label: fmt.monthShort.format(tick) })
    tick.setMonth(tick.getMonth() + (months > 6 ? 2 : 1))
  }

  return (
    // Each row is as tall as its lanes, so busy areas get room and quiet ones stay compact.
    <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-2 @md:grid-cols-[5.5rem_minmax(0,1fr)] @md:gap-x-4">
      {rows.map(({ area, items }, i) => {
        const height = Math.max(1, ...items.map((p) => p.lane + 1)) * LANE_HEIGHT + 8
        return (
          <React.Fragment key={area}>
            <div
              className={cn("flex items-center truncate text-xs text-muted-foreground @md:text-sm", i > 0 && "border-t border-dashed")}
              style={{ minHeight: height }}
            >
              {areaName(t, area)}
            </div>
            <div className={cn("flex items-center", i > 0 && "border-t border-dashed")} style={{ minHeight: height }}>
            <div className="relative w-full" style={{ height }}>
              {items.map(({ o, x, w, lane, flipped }) => {
                const l = level(o)
                return (
                  <Tooltip key={o.key}>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={() => onOpen(o)}
                          className={cn(
                            "absolute flex h-8 items-center gap-2 rounded-md bg-primary pr-2.5 pl-1 text-xs font-medium text-primary-foreground transition-transform outline-none hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/50",
                            flipped && "flex-row-reverse pr-1 pl-2.5",
                            l === "done" && "bg-muted text-muted-foreground"
                          )}
                          style={{ left: x, top: lane * LANE_HEIGHT + 8, width: w }}
                        />
                      }
                    >
                      <span
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-sm font-mono text-[0.65rem] font-semibold",
                          STYLE[l].solid
                        )}
                      >
                        <Sensitive when={o.sensitive}>{parseDate(o.date).getDate()}</Sensitive>
                      </span>
                      <span className="truncate">{o.title}</span>
                    </TooltipTrigger>
                    <TooltipContent className="flex-col items-start gap-1 py-2">
                      <span className="font-medium">{o.title}</span>
                      <span className="flex items-center gap-1.5 text-background/70">
                        <span className={cn("size-1.5 shrink-0 rounded-full", STYLE[l].solid)} />
                        <span className="whitespace-nowrap">
                          {t.status[l]} · <Sensitive when={o.sensitive}>{fmt.long.format(parseDate(o.date))}</Sensitive> ·{" "}
                          {t.relativeDays(o.days)} · {t.severity[severity(o.severity)]}
                        </span>
                      </span>
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
            </div>
          </React.Fragment>
        )
      })}

      <div />
      <div ref={ref} className="relative mt-3 h-6 border-t">
        {ticks.map((tk) => (
          <span key={tk.label} className="absolute top-2 -translate-x-1/2 text-xs text-muted-foreground" style={{ left: tk.x }}>
            {tk.label}
          </span>
        ))}
      </div>
    </div>
  )
}
