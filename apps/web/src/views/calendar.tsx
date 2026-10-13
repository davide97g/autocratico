// Layouts of the Overview calendar, chosen per device (Prefs.calendar). Every one shows the dates
// explicitly and keeps overdue deadlines in view: order first, color for urgency.
import * as React from "react"
import { cn } from "cn"

import { Sensitive } from "@/components/privacy"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useI18n } from "@/i18n"
import type { Occurrence } from "@/lib/api"
import { areaIcon, areaName, capitalize, parseDate } from "@/lib/format"
import type { CalendarLayout } from "@/lib/prefs"
import { level, ORDER, STYLE } from "@/lib/status"
import { Timeline } from "@/views/timeline"

type Props = {
  agenda: Occurrence[]
  today: string
  months: number
  onOpen: (o: Occurrence) => void
}

const DAY = 86_400_000

/** Open items up to the end of the window, overdue ones included, in date order. */
function pick(agenda: Occurrence[], today: string, months: number) {
  const end = parseDate(today)
  end.setMonth(end.getMonth() + months)
  return agenda
    .filter((o) => !o.done_on && parseDate(o.date) <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || ORDER.indexOf(level(a)) - ORDER.indexOf(level(b)))
}

function monthStarts(today: string, months: number) {
  const base = parseDate(today)
  return Array.from({ length: months }, (_, i) => new Date(base.getFullYear(), base.getMonth() + i, 1))
}

/** Date tile: day number on the status color, weekday and month under it. */
function DateTile({ o, className }: { o: Occurrence; className?: string }) {
  const { fmt } = useI18n()
  const d = parseDate(o.date)
  const l = level(o)
  return (
    <span className={cn("flex w-11 shrink-0 flex-col items-center overflow-hidden rounded-md border bg-card", className)}>
      <span className={cn("w-full py-0.5 text-center font-mono text-sm font-semibold", STYLE[l].solid)}>
        <Sensitive when={o.sensitive}>{d.getDate()}</Sensitive>
      </span>
      <span className="py-0.5 text-[0.6rem] tracking-wide text-muted-foreground uppercase">{fmt.monthShort.format(d).replace(".", "")}</span>
    </span>
  )
}

function Row({ o, onOpen, showArea = true }: { o: Occurrence; onOpen: (o: Occurrence) => void; showArea?: boolean }) {
  const { t, fmt } = useI18n()
  const l = level(o)
  return (
    <button
      type="button"
      onClick={() => onOpen(o)}
      className="group/row -mx-1.5 flex items-center gap-3 rounded-md px-1.5 py-1.5 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <DateTile o={o} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{o.title}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {showArea && (
            <>
              {React.createElement(areaIcon(o.area), { className: "size-3" })}
              <span className="truncate">{areaName(t, o.area)}</span>
              <span>·</span>
            </>
          )}
          <span className={cn("whitespace-nowrap", (l === "overdue" || l === "urgent") && "font-medium text-foreground")}>
            {t.relativeDays(o.days)}
          </span>
          <span className="hidden whitespace-nowrap @md/tl:inline">· {capitalize(fmt.weekday.format(parseDate(o.date)))}</span>
        </span>
      </span>
    </button>
  )
}

/* ---------- A. Months in columns ---------- */

function MonthsView({ agenda, today, months, onOpen }: Props) {
  const { t, fmt } = useI18n()
  const items = pick(agenda, today, months)
  const starts = monthStarts(today, months)
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  const first = key(starts[0])
  return (
    <div className="grid grid-cols-1 gap-3 @md/tl:grid-cols-2 @2xl/tl:grid-cols-3">
      {starts.map((m, i) => {
        const own = items.filter((o) => (i === 0 ? o.date.slice(0, 7) <= first : o.date.startsWith(key(m))))
        return (
          <section key={key(m)} className={cn("flex flex-col rounded-lg border p-3", i === 0 && "border-foreground/30 bg-muted/30")}>
            <header className="mb-1.5 flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">
                {capitalize(fmt.monthYear.format(m))}
                {i === 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{t.overview.inProgress}</span>}
              </h3>
              <span className="font-mono text-xs text-muted-foreground">{own.length}</span>
            </header>
            {own.length === 0 ? (
              <p className="py-3 text-xs text-muted-foreground">{t.overview.calendarView.nothingDue}</p>
            ) : (
              <div className="flex flex-col">
                {own.slice(0, 5).map((o) => (
                  <Row key={o.key} o={o} onOpen={onOpen} />
                ))}
                {own.length > 5 && <span className="pt-1 pl-14 text-xs text-muted-foreground">{t.overview.calendarView.more(own.length - 5)}</span>}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

/* ---------- B. Axis with today and a zoomed first month ---------- */

const LANE = 30

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

function AxisView({ agenda, today, months, onOpen }: Props) {
  const { t, fmt } = useI18n()
  const [ref, W] = useWidth<HTMLDivElement>()
  const start = parseDate(today).getTime()
  const endDate = parseDate(today)
  endDate.setMonth(endDate.getMonth() + months)
  const total = (endDate.getTime() - start) / DAY
  // The next 30 days get 40% of the width: that is where things crowd and where order matters most.
  const ZOOM_DAYS = 30
  const ZOOM = 0.4
  const OVERDUE = 0.06 // a strip on the left for what is already late
  const x = (iso: string) => {
    const d = (parseDate(iso).getTime() - start) / DAY
    if (d < 0) return 0
    const f = d <= ZOOM_DAYS ? (d / ZOOM_DAYS) * ZOOM : ZOOM + ((d - ZOOM_DAYS) / (total - ZOOM_DAYS)) * (1 - ZOOM)
    return (OVERDUE + f * (1 - OVERDUE)) * W
  }
  const items = pick(agenda, today, months)

  const areas = [...new Set(items.map((o) => o.area))]
  const rows = areas.map((area) => {
    // Labels sit to the right of their dot; a label that would collide goes to the next lane.
    const ends: number[] = []
    const placed = items
      .filter((o) => o.area === area)
      .map((o) => {
        const px = o.days < 0 ? 4 : x(o.date)
        const w = Math.min(150, 34 + o.title.length * 6)
        const flip = px + w > W
        const from = flip ? px - w : px
        let lane = ends.findIndex((e) => e < from - 4)
        if (lane === -1) lane = ends.length
        ends[lane] = from + w
        return { o, px, w, lane, flip }
      })
    return { area, placed, lanes: Math.max(1, ends.length) }
  })

  const ticks: { x: number; label: string; strong: boolean }[] = []
  if (W) {
    for (let d = 7; d < ZOOM_DAYS; d += 7) {
      const dt = new Date(start + d * DAY)
      ticks.push({ x: x(dt.toISOString().slice(0, 10)), label: fmt.dayMonth.format(dt), strong: false })
    }
    const m = parseDate(today)
    m.setDate(1)
    m.setMonth(m.getMonth() + 1)
    while (m <= endDate) {
      const iso = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-01`
      if ((m.getTime() - start) / DAY > ZOOM_DAYS - 3) ticks.push({ x: x(iso), label: fmt.monthShort.format(m), strong: true })
      m.setMonth(m.getMonth() + (months > 6 ? 2 : 1))
    }
  }
  const todayX = OVERDUE * W
  const zoomX = x(new Date(start + ZOOM_DAYS * DAY).toISOString().slice(0, 10))

  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3">
      <div />
      <div ref={ref} className="relative mb-2 h-5 text-[0.65rem] text-muted-foreground">
        <span className="absolute -translate-x-1/2 font-medium text-foreground" style={{ left: todayX }}>
          {t.overview.calendarView.today}
        </span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: (todayX + zoomX) / 2 }}>
          {t.overview.calendarView.next30}
        </span>
      </div>
      {rows.map(({ area, placed, lanes }, i) => {
        const h = lanes * LANE + 10
        return (
          <React.Fragment key={area}>
            <div className={cn("flex items-center text-xs text-muted-foreground", i > 0 && "border-t border-dashed")} style={{ minHeight: h }}>
              {areaName(t, area)}
            </div>
            <div className={cn("relative", i > 0 && "border-t border-dashed")} style={{ height: h }}>
              {/* backgrounds: overdue strip, zoomed month, today line */}
              <div className="absolute inset-y-0 left-0 bg-status-overdue/6" style={{ width: todayX }} />
              <div className="absolute inset-y-0 bg-muted/50" style={{ left: todayX, width: zoomX - todayX }} />
              <div className="absolute inset-y-0 w-px bg-foreground" style={{ left: todayX }} />
              {ticks.map((tk) => (
                <div key={tk.label} className={cn("absolute inset-y-0 w-px", tk.strong ? "bg-border" : "bg-border/50")} style={{ left: tk.x }} />
              ))}
              {placed.map(({ o, px, w, lane, flip }) => {
                const l = level(o)
                return (
                  <Tooltip key={o.key}>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={() => onOpen(o)}
                          className={cn(
                            "absolute flex h-6 items-center gap-1.5 text-xs font-medium outline-none hover:z-10 focus-visible:ring-3 focus-visible:ring-ring/50",
                            flip && "flex-row-reverse"
                          )}
                          style={{ left: flip ? px - w + 5 : px - 5, top: lane * LANE + 8, width: w }}
                        />
                      }
                    >
                      <span className={cn("size-2.5 shrink-0 rounded-full ring-2 ring-card", STYLE[l].dot)} />
                      <span className={cn("truncate rounded-sm bg-card/90 px-1", flip && "text-right")}>{o.title}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <Sensitive when={o.sensitive}>{fmt.long.format(parseDate(o.date))}</Sensitive> · {t.relativeDays(o.days)}
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
          </React.Fragment>
        )
      })}
      <div />
      <div className="relative mt-1 h-6 border-t">
        {ticks.map((tk) => (
          <span
            key={tk.label}
            className={cn("absolute top-1.5 -translate-x-1/2 text-[0.65rem] whitespace-nowrap", tk.strong ? "text-foreground" : "text-muted-foreground")}
            style={{ left: tk.x }}
          >
            {tk.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ---------- C. Horizons: now, this month, next months, later ---------- */

function HorizonsView({ agenda, today, months, onOpen }: Props) {
  const { t } = useI18n()
  const c = t.overview.calendarView
  const items = pick(agenda, today, months)
  const buckets = [
    { title: c.now, hint: c.nowHint, test: (d: number) => d <= 7, tone: "bg-status-overdue" },
    { title: c.withinMonth, hint: c.withinMonthHint, test: (d: number) => d > 7 && d <= 30, tone: "bg-status-urgent" },
    { title: c.nextMonths, hint: c.nextMonthsHint, test: (d: number) => d > 30 && d <= 90, tone: "bg-status-soon" },
    // A three-month window ends where "next months" does.
    ...(months > 3 ? [{ title: c.later, hint: c.laterHint(months), test: (d: number) => d > 90, tone: "bg-muted-foreground" }] : []),
  ]
  return (
    <div className="grid grid-cols-1 gap-3 @md/tl:grid-cols-2">
      {buckets.map((b, i) => {
        const own = items.filter((o) => b.test(o.days))
        return (
          <section key={b.title} className={cn("rounded-lg border p-3", i === 0 && "bg-muted/30")}>
            <header className="mb-1.5 flex items-center gap-2">
              <span className={cn("h-4 w-1 rounded-full", b.tone)} />
              <h3 className="text-sm font-medium">{b.title}</h3>
              <span className="text-xs text-muted-foreground">{b.hint}</span>
              <span className="ml-auto font-mono text-xs text-muted-foreground">{own.length}</span>
            </header>
            {own.length === 0 ? (
              <p className="py-3 text-xs text-muted-foreground">{c.nothing}</p>
            ) : (
              <div className="flex flex-col">
                {own.slice(0, 5).map((o) => (
                  <Row key={o.key} o={o} onOpen={onOpen} />
                ))}
                {own.length > 5 && <span className="pt-1 pl-14 text-xs text-muted-foreground">{t.overview.calendarView.more(own.length - 5)}</span>}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

/* ---------- D. Month grids (wall calendar) with the month's list ---------- */

function GridView({ agenda, today, months, onOpen }: Props) {
  const { t, fmt } = useI18n()
  const items = pick(agenda, today, months)
  const starts = monthStarts(today, months)
  const todayIso = today
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  const weekdays = Array.from({ length: 7 }, (_, i) => fmt.weekday.format(new Date(2024, 0, 1 + i)).slice(0, 1).toUpperCase())
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-5 @md/tl:grid-cols-3 @2xl/tl:grid-cols-4">
      {starts.map((m) => {
        const lead = (m.getDay() + 6) % 7
        const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()
        const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => new Date(m.getFullYear(), m.getMonth(), i + 1))]
        return (
          <section key={iso(m)}>
            <h3 className="mb-2 text-sm font-medium">{capitalize(fmt.monthYear.format(m))}</h3>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[0.6rem] text-muted-foreground">
              {weekdays.map((w, i) => (
                <span key={i}>{w}</span>
              ))}
              {cells.map((d, i) => {
                if (!d) return <span key={`e${i}`} />
                const day = iso(d)
                const own = items.filter((o) => o.date === day)
                const worst = own.map(level).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))[0]
                const past = day < todayIso
                const cell = (
                  <span
                    className={cn(
                      "relative flex aspect-square items-center justify-center rounded-sm font-mono text-[0.65rem]",
                      past && "opacity-40",
                      day === todayIso && "ring-1 ring-foreground",
                      worst === "planned" ? "bg-muted font-semibold text-foreground ring-1 ring-foreground/25 ring-inset" : worst ? cn(STYLE[worst].solid, "font-semibold") : "text-foreground/70"
                    )}
                  >
                    {d.getDate()}
                    {own.length > 1 && <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-foreground ring-1 ring-card" />}
                  </span>
                )
                if (!own.length) return <React.Fragment key={day}>{cell}</React.Fragment>
                return (
                  <Tooltip key={day}>
                    <TooltipTrigger render={<button type="button" onClick={() => onOpen(own[0])} className="outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />}>
                      {cell}
                    </TooltipTrigger>
                    <TooltipContent className="flex-col items-start gap-0.5">
                      {own.map((o) => (
                        <span key={o.key}>
                          {o.title} · {t.relativeDays(o.days)}
                        </span>
                      ))}
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
          </section>
        )
      })}
      {items.some((o) => o.days < 0) && (
        <p className="col-span-full text-xs text-status-overdue">
          {t.overview.calendarView.overdue}: {items.filter((o) => o.days < 0).map((o) => o.title).join(", ")}
        </p>
      )}
    </div>
  )
}

export function Calendar({ layout, ...props }: Props & { layout: CalendarLayout }) {
  return (
    <div className="@container/tl">
      {layout === "months" && <MonthsView {...props} />}
      {layout === "horizons" && <HorizonsView {...props} />}
      {/* Too narrow for a timeline (phones): the same deadlines by month. */}
      {layout === "axis" && (
        <>
          <div className="hidden @lg/tl:block">
            <AxisView {...props} />
          </div>
          <div className="@lg/tl:hidden">
            <MonthsView {...props} />
          </div>
        </>
      )}
      {layout === "grid" && <GridView {...props} />}
      {layout === "areas" && <Timeline {...props} />}
    </div>
  )
}
