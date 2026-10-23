// The Agenda's visual layouts: a week of hours and a month grid, over Google Calendar's copy and the
// register's deadlines. Monochrome like the rest of the app: the calendar's color is a thin bar, red is
// kept for important events and the status colors for deadlines. Clicking an event opens its details;
// clicking an empty hour drafts a request for the agent.
import * as React from "react"
import { addDays } from "@autocratico/core"
import { BellIcon, CalendarDaysIcon, ExternalLinkIcon, MapPinIcon, MessageCircleIcon, StarIcon } from "lucide-react"
import { cn } from "cn"

import { Sensitive } from "@/components/privacy"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useI18n } from "@/i18n"
import type { CalendarEvent, Occurrence } from "@/lib/api"
import { capitalize, parseDate } from "@/lib/format"
import { level, STYLE } from "@/lib/status"

const HOUR = 44
const DAY_MIN = 1440

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
/** The Monday of the week `day` is in. */
export const mondayOf = (day: string) => addDays(day, -((parseDate(day).getDay() + 6) % 7))
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

export type Shown = { e: CalendarEvent; color: string | null; calendar: string | null }

/** The part of a timed event inside `day`, in minutes from midnight; null when it does not touch it. */
function segment(e: CalendarEvent, day: string): { from: number; to: number } | null {
  if (e.all_day) return null
  const d0 = e.start.slice(0, 10), d1 = e.end.slice(0, 10)
  if (day < d0 || day > d1) return null
  const from = day === d0 ? minutes(e.start.slice(11)) : 0
  const to = day === d1 ? minutes(e.end.slice(11)) : DAY_MIN
  return to > from ? { from, to: Math.max(to, from + 20) } : null
}

const coversDay = (e: CalendarEvent, day: string) => e.all_day && e.start <= day && e.end >= day

/** Side by side when they overlap: each event gets a lane and the number of lanes of its cluster. */
function lanes<T extends { from: number; to: number }>(items: T[]): (T & { lane: number; of: number })[] {
  const sorted = [...items].sort((a, b) => a.from - b.from || b.to - a.to)
  const out: (T & { lane: number; of: number })[] = []
  let cluster: (T & { lane: number; of: number })[] = []
  let end = -1
  const close = () => {
    const n = Math.max(1, ...cluster.map((c) => c.lane + 1))
    for (const c of cluster) c.of = n
    out.push(...cluster)
    cluster = []
  }
  for (const it of sorted) {
    if (it.from >= end && cluster.length) close()
    const used = new Set(cluster.filter((c) => c.to > it.from).map((c) => c.lane))
    let lane = 0
    while (used.has(lane)) lane++
    cluster.push({ ...it, lane, of: 1 })
    end = Math.max(end, it.to)
  }
  if (cluster.length) close()
  return out
}

function Bar({ color, important }: { color: string | null; important: boolean }) {
  return (
    <span
      className={cn("absolute inset-y-0 left-0 w-1 rounded-l-md", important ? "bg-status-overdue" : "bg-muted-foreground/60")}
      style={!important && color ? { backgroundColor: color } : undefined}
    />
  )
}

/** A deadline of the register, as a chip on its day. */
function DeadlineChip({ o, onOpen }: { o: Occurrence; onOpen: (key: string) => void }) {
  const l = level(o)
  return (
    <button
      type="button"
      onClick={() => onOpen(o.key)}
      className={cn("flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-[0.7rem] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50", STYLE[l].soft)}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", STYLE[l].dot)} />
      <span className="truncate">{o.title}</span>
    </button>
  )
}

function AllDayChip({ s, onOpen }: { s: Shown; onOpen: (s: Shown) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(s)}
      className={cn(
        "relative flex w-full min-w-0 items-center rounded-md border py-0.5 pr-1.5 pl-2.5 text-left text-[0.7rem] font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
        s.e.important ? "border-status-overdue/30 bg-status-overdue/8 text-status-overdue" : "bg-card",
        !s.e.busy && "border-dashed"
      )}
    >
      <Bar color={s.color} important={s.e.important} />
      <span className="truncate">
        <Sensitive>{s.e.title}</Sensitive>
      </span>
    </button>
  )
}

function useMinuteNow() {
  const [now, setNow] = React.useState(() => new Date())
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

type GridProps = {
  events: Shown[]
  deadlines: Occurrence[]
  today: string
  onOpen: (s: Shown) => void
  onOpenDeadline: (key: string) => void
}

/** Seven days of hours, Monday first. */
export function WeekGrid({ start, events, deadlines, today, onOpen, onOpenDeadline, onSlot }: GridProps & { start: string; onSlot: (day: string, hour: number) => void }) {
  const { fmt, t } = useI18n()
  const now = useMinuteNow()
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const timed = days.map((d) =>
    lanes(
      events.flatMap((s) => {
        const seg = segment(s.e, d)
        return seg ? [{ ...seg, s }] : []
      })
    )
  )
  // 7:00 to 23:00, wider when something starts earlier or ends later
  const all = timed.flat()
  const first = Math.min(7, ...all.map((x) => Math.floor(x.from / 60)))
  const last = Math.max(23, ...all.map((x) => Math.ceil(x.to / 60)))
  const hours = Array.from({ length: last - first }, (_, i) => first + i)
  const top = (m: number) => ((m - first * 60) / 60) * HOUR
  const allDay = days.map((d) => ({ events: events.filter((s) => coversDay(s.e, d)), due: deadlines.filter((o) => o.date === d) }))
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const scroller = React.useRef<HTMLDivElement>(null)
  // Opens on the morning, or on what comes first that day.
  React.useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = top(Math.max(first * 60, Math.min(8 * 60, ...all.map((x) => x.from)) - 30))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start])

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="min-w-[44rem]">
        {/* days */}
        <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] border-b">
          <span />
          {days.map((d) => {
            const date = parseDate(d)
            const isToday = d === today
            return (
              <div key={d} className="flex flex-col items-center gap-0.5 border-l py-2">
                <span className={cn("text-[0.65rem] tracking-wide uppercase", isToday ? "text-foreground" : "text-muted-foreground")}>{fmt.weekday.format(date).replace(".", "")}</span>
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full font-mono text-sm",
                    isToday ? "bg-foreground font-semibold text-background" : d < today ? "text-muted-foreground" : "text-foreground"
                  )}
                >
                  {date.getDate()}
                </span>
              </div>
            )
          })}
        </div>
        {/* all-day events and deadlines */}
        {allDay.some((x) => x.events.length || x.due.length) && (
          <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] border-b bg-muted/30">
            <span className="px-1.5 pt-1.5 text-right font-mono text-[0.6rem] text-muted-foreground">{t.agenda.allDay}</span>
            {allDay.map((x, i) => (
              <div key={days[i]} className="flex min-w-0 flex-col gap-1 border-l p-1">
                {x.due.map((o) => (
                  <DeadlineChip key={o.key} o={o} onOpen={onOpenDeadline} />
                ))}
                {x.events.map((s) => (
                  <AllDayChip key={`${s.e.account}/${s.e.id}`} s={s} onOpen={onOpen} />
                ))}
              </div>
            ))}
          </div>
        )}
        {/* hours */}
        <div ref={scroller} className="max-h-[36rem] overflow-y-auto">
          <div className="relative grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))]" style={{ height: hours.length * HOUR }}>
            <div className="relative">
              {hours.map((h) => (
                <span key={h} className="absolute right-1.5 -translate-y-1/2 font-mono text-[0.6rem] text-muted-foreground" style={{ top: top(h * 60) }}>
                  {h > first && `${String(h).padStart(2, "0")}:00`}
                </span>
              ))}
            </div>
            {days.map((d, i) => (
              <div key={d} className={cn("relative border-l", d === today && "bg-muted/25")}>
                {hours.map((h) => (
                  <button
                    key={h}
                    type="button"
                    aria-label={t.agenda.addAt(capitalize(fmt.weekdayLong.format(parseDate(d))), `${String(h).padStart(2, "0")}:00`)}
                    onClick={() => onSlot(d, h)}
                    className="absolute inset-x-0 border-t border-border/60 outline-none hover:bg-muted/50 focus-visible:bg-muted"
                    style={{ top: top(h * 60), height: HOUR }}
                  />
                ))}
                {timed[i].map(({ s, from, to, lane, of }) => {
                  const h = top(to) - top(from)
                  return (
                    <button
                      key={`${s.e.account}/${s.e.id}`}
                      type="button"
                      onClick={() => onOpen(s)}
                      className={cn(
                        "absolute overflow-hidden rounded-md border py-1 pr-1 pl-2.5 text-left text-xs shadow-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                        s.e.important ? "border-status-overdue/30 bg-status-overdue/10 text-status-overdue hover:bg-status-overdue/15" : "bg-card hover:bg-muted",
                        !s.e.busy && "border-dashed bg-card/70"
                      )}
                      style={{ top: top(from) + 1, height: h - 2, left: `calc(${(lane / of) * 100}% + 2px)`, width: `calc(${100 / of}% - 4px)` }}
                    >
                      <Bar color={s.color} important={s.e.important} />
                      <span className="block truncate leading-tight font-medium">
                        <Sensitive>{s.e.title}</Sensitive>
                      </span>
                      {h > 30 && (
                        <span className={cn("block truncate font-mono text-[0.6rem] leading-tight", s.e.important ? "text-status-overdue/80" : "text-muted-foreground")}>
                          {s.e.start.slice(11)}–{s.e.end.slice(11)}
                        </span>
                      )}
                      {h > 56 && s.e.location && (
                        <span className="block truncate text-[0.6rem] leading-tight text-muted-foreground">
                          <Sensitive>{s.e.location}</Sensitive>
                        </span>
                      )}
                    </button>
                  )
                })}
                {d === today && nowMin >= first * 60 && nowMin <= last * 60 && (
                  <span className="pointer-events-none absolute inset-x-0 z-10 h-px bg-foreground" style={{ top: top(nowMin) }}>
                    <span className="absolute -top-1 -left-1 size-2 rounded-full bg-foreground" />
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const MONTH_ITEMS = 3

/** The month as a wall calendar: six weeks, Monday first, a few items a day. */
export function MonthGrid({ month, events, deadlines, today, onOpen, onOpenDeadline, onDay }: GridProps & { month: string; onDay: (day: string) => void }) {
  const { fmt, t } = useI18n()
  const start = mondayOf(`${month}-01`)
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const weekdays = days.slice(0, 7).map((d) => fmt.weekday.format(parseDate(d)).replace(".", ""))
  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="grid min-w-[44rem] grid-cols-7">
        {weekdays.map((w, i) => (
          <span key={i} className={cn("border-b py-2 text-center text-[0.65rem] tracking-wide text-muted-foreground uppercase", i > 0 && "border-l")}>
            {w}
          </span>
        ))}
        {days.map((d, i) => {
          const inMonth = d.startsWith(month)
          const due = deadlines.filter((o) => o.date === d)
          const evs = events
            .filter((s) => (s.e.all_day ? coversDay(s.e, d) : segment(s.e, d) !== null))
            .sort((a, b) => Number(b.e.all_day) - Number(a.e.all_day) || a.e.start.localeCompare(b.e.start))
          const items = [...due.map((o) => ({ o })), ...evs.map((s) => ({ s }))]
          const extra = items.length - MONTH_ITEMS
          return (
            <div key={d} className={cn("flex min-h-28 min-w-0 flex-col gap-1 p-1.5", i % 7 > 0 && "border-l", i >= 7 && "border-t", !inMonth && "bg-muted/30")}>
              <button
                type="button"
                onClick={() => onDay(d)}
                className={cn(
                  "flex size-6 items-center justify-center self-start rounded-full font-mono text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
                  d === today ? "bg-foreground font-semibold text-background hover:bg-foreground" : inMonth ? "text-foreground" : "text-muted-foreground"
                )}
                aria-label={fmt.long.format(parseDate(d))}
              >
                {parseDate(d).getDate()}
              </button>
              {items.slice(0, extra > 0 ? MONTH_ITEMS - 1 : MONTH_ITEMS).map((it) =>
                "o" in it ? (
                  <DeadlineChip key={it.o.key} o={it.o} onOpen={onOpenDeadline} />
                ) : it.s.e.all_day ? (
                  <AllDayChip key={`${it.s.e.account}/${it.s.e.id}`} s={it.s} onOpen={onOpen} />
                ) : (
                  <button
                    key={`${it.s.e.account}/${it.s.e.id}`}
                    type="button"
                    onClick={() => onOpen(it.s)}
                    className={cn(
                      "flex w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-[0.7rem] outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
                      it.s.e.important && "text-status-overdue"
                    )}
                  >
                    <span
                      className={cn("size-1.5 shrink-0 rounded-full", it.s.e.important ? "bg-status-overdue" : "bg-muted-foreground")}
                      style={!it.s.e.important && it.s.color ? { backgroundColor: it.s.color } : undefined}
                    />
                    <span className="shrink-0 font-mono text-[0.6rem] text-muted-foreground">{it.s.e.start.slice(11)}</span>
                    <span className="truncate font-medium">
                      <Sensitive>{it.s.e.title}</Sensitive>
                    </span>
                  </button>
                )
              )}
              {extra > 0 && (
                <button type="button" onClick={() => onDay(d)} className="self-start rounded-md px-1 text-[0.65rem] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
                  {t.agenda.more(extra + 1)}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** An event's details, with what can be done about it. */
export function EventDialog({
  shown,
  deadline,
  onClose,
  onAsk,
  onOpenDeadline,
}: {
  shown: Shown | null
  deadline: Occurrence | null
  onClose: () => void
  onAsk: (question: string) => void
  onOpenDeadline: (key: string) => void
}) {
  const { t, fmt } = useI18n()
  const e = shown?.e
  const when = (() => {
    if (!e) return ""
    const d0 = parseDate(e.start.slice(0, 10)), d1 = parseDate(e.end.slice(0, 10))
    const day = (d: Date) => `${capitalize(fmt.weekdayLong.format(d))} ${fmt.long.format(d)}`
    if (e.all_day) return e.end !== e.start ? `${day(d0)} – ${day(d1)}` : `${day(d0)} · ${t.agenda.allDayLong}`
    return e.end.slice(0, 10) === e.start.slice(0, 10) ? `${day(d0)} · ${e.start.slice(11)}–${e.end.slice(11)}` : `${day(d0)} ${e.start.slice(11)} – ${day(d1)} ${e.end.slice(11)}`
  })()
  return (
    <Dialog open={shown !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {e && shown && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-start gap-2.5 pr-6">
                <span
                  className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", e.important ? "bg-status-overdue" : "bg-muted-foreground")}
                  style={!e.important && shown.color ? { backgroundColor: shown.color } : undefined}
                />
                <Sensitive>{e.title}</Sensitive>
              </DialogTitle>
              <DialogDescription>{when}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap gap-1.5">
                {e.important && <Badge className={STYLE.overdue.soft}>{t.agenda.important}</Badge>}
                {!e.busy && <Badge variant="outline">{t.agenda.free}</Badge>}
                {e.recurring && <Badge variant="outline">{t.agenda.recurring}</Badge>}
                {e.ours && <Badge variant="secondary">{t.agenda.ours}</Badge>}
              </div>
              {shown.calendar && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <CalendarDaysIcon className="size-4 shrink-0" />
                  <span className="truncate">
                    {e.account} · <Sensitive>{shown.calendar}</Sensitive>
                  </span>
                </p>
              )}
              {e.location && (
                <p className="flex items-start gap-2">
                  <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <Sensitive>{e.location}</Sensitive>
                </p>
              )}
              {e.reminders && e.reminders.length > 0 && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <BellIcon className="size-4 shrink-0" />
                  {t.agenda.reminders(e.reminders.map((r) => r.minutes))}
                </p>
              )}
              {e.description && (
                <p className="rounded-lg bg-muted/50 p-3 whitespace-pre-wrap">
                  <Sensitive>{e.description}</Sensitive>
                </p>
              )}
              {deadline && (
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onOpenDeadline(deadline.key)
                  }}
                  className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-left font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50", STYLE[level(deadline)].soft)}
                >
                  <StarIcon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{t.agenda.deadlineOf(deadline.title)}</span>
                </button>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant="secondary"
                  onClick={() => {
                    onClose()
                    onAsk(t.agenda.askAbout(e.title, when))
                  }}
                >
                  <MessageCircleIcon data-icon="inline-start" />
                  {t.agenda.askAboutLabel}
                </Button>
                {e.link && (
                  <Button variant="ghost" render={<a href={e.link} target="_blank" rel="noopener noreferrer" />} nativeButton={false}>
                    <ExternalLinkIcon data-icon="inline-start" />
                    {t.agenda.openGoogle}
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
