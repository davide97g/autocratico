import * as React from "react"
import { addDays } from "@autocratico/core"
import { CalendarDaysIcon, CalendarPlusIcon, ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, MapPinIcon, MessageCircleIcon, SettingsIcon, XIcon } from "lucide-react"
import { cn } from "cn"

import { EventDialog, iso, mondayOf, MonthGrid, type Shown, WeekGrid } from "@/components/agenda-grid"
import { Sensitive } from "@/components/privacy"
import { RowsSkeleton } from "@/components/skeletons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useI18n } from "@/i18n"
import { answerProposal, type CalendarAgenda, calendarAgenda, type CalendarEvent, type CalendarProposal, type Data, type Occurrence } from "@/lib/api"
import { useLiveRefresh } from "@/lib/events"
import { capitalize, parseDate } from "@/lib/format"
import { type AgendaLayout, usePrefs } from "@/lib/prefs"
import { level, STYLE } from "@/lib/status"
import { unlessChanged } from "@/lib/utils"

type Props = {
  data: Data
  onOpenDeadline: (key: string) => void
  onAsk: (question: string) => void
  /** Puts a request in the chat's field, for the user to finish. */
  onDraft: (text: string) => void
  onOpenSettings: () => void
}

type Span = 7 | 30 | 90
type Item = { kind: "event"; e: CalendarEvent; color: string | null } | { kind: "deadline"; o: Occurrence }

/** The days an event covers inside [from, to]: an all-day event of several days shows on each. */
function daysOf(e: CalendarEvent, from: string, to: string): string[] {
  const first = e.start.slice(0, 10)
  // A timed event ending at midnight belongs to the day it started.
  const last = e.all_day || e.end.slice(11) !== "00:00" ? e.end.slice(0, 10) : first
  const out: string[] = []
  const d = parseDate(first < from ? from : first)
  for (let i = 0; i < 62; i++) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    if (iso > last || iso > to) break
    out.push(iso)
    d.setDate(d.getDate() + 1)
  }
  return out
}

function EventRow({ e, color, onOpen }: { e: CalendarEvent; color: string | null; onOpen: () => void }) {
  const { t } = useI18n()
  return (
    <li className="-mx-1.5 flex cursor-pointer items-start gap-3 rounded-md px-1.5 py-2 hover:bg-muted/60" onClick={onOpen}>
      <span className="w-14 shrink-0 pt-0.5 font-mono text-xs whitespace-nowrap text-muted-foreground">{e.all_day ? t.agenda.allDay : e.start.slice(11)}</span>
      <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-muted-foreground" style={color ? { backgroundColor: color } : undefined} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
          <span className="wrap-anywhere">
            <Sensitive>{e.title}</Sensitive>
          </span>
          {e.important && <Badge className={cn("shrink-0", STYLE.overdue.soft)}>{t.agenda.important}</Badge>}
          {!e.busy && <Badge variant="outline">{t.agenda.free}</Badge>}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {!e.all_day && <span>{t.agenda.until(e.end.slice(0, 10) === e.start.slice(0, 10) ? e.end.slice(11) : e.end.replace("T", " "))}</span>}
          {e.location && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPinIcon className="size-3 shrink-0" />
              <span className="truncate">
                <Sensitive>{e.location}</Sensitive>
              </span>
            </span>
          )}
          {e.reminders && e.reminders.length > 0 && <span>{t.agenda.reminders(e.reminders.map((r) => r.minutes))}</span>}
          {e.ours && <span>{t.agenda.ours}</span>}
        </span>
      </span>
      {e.link && (
        <Button variant="ghost" size="icon-sm" render={<a href={e.link} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()} />} nativeButton={false} aria-label={t.agenda.openGoogle}>
          <ExternalLinkIcon />
        </Button>
      )}
    </li>
  )
}

function DeadlineRow({ o, onOpen }: { o: Occurrence; onOpen: (key: string) => void }) {
  const { t } = useI18n()
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(o.key)}
        className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-start gap-3 rounded-md px-1.5 py-2 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="w-14 shrink-0 pt-0.5 font-mono text-xs whitespace-nowrap text-muted-foreground">{t.agenda.deadline}</span>
        <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-sm", STYLE[level(o)].dot)} />
        <span className="min-w-0 flex-1 text-sm wrap-anywhere">{o.title}</span>
      </button>
    </li>
  )
}

function Proposal({ p, onAnswered }: { p: CalendarProposal; onAnswered: () => void }) {
  const { t, fmt } = useI18n()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const answer = (a: "add" | "dismiss") => {
    setBusy(true)
    setError(null)
    answerProposal(p.id, a)
      .then(onAnswered, (e: Error) => setError(e.message))
      .finally(() => setBusy(false))
  }
  const day = capitalize(fmt.weekdayLong.format(parseDate(p.start.slice(0, 10))))
  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-start gap-3">
        <CalendarPlusIcon className="mt-0.5 size-4 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium wrap-anywhere">
            <Sensitive>{p.title}</Sensitive>
          </span>
          <span className="text-xs text-muted-foreground">
            {day} {fmt.long.format(parseDate(p.start.slice(0, 10)))}
            {!p.all_day && ` · ${p.start.slice(11)}–${p.end.slice(11)}`}
            {p.location && (
              <>
                {" · "}
                <Sensitive>{p.location}</Sensitive>
              </>
            )}
          </span>
          {p.description && (
            <span className="line-clamp-2 text-xs text-muted-foreground">
              <Sensitive>{p.description}</Sensitive>
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <Button size="sm" disabled={busy} onClick={() => answer("add")}>
            <CalendarPlusIcon data-icon="inline-start" />
            {t.agenda.add}
          </Button>
          <Button size="icon-sm" variant="ghost" disabled={busy} onClick={() => answer("dismiss")} aria-label={t.agenda.dismiss}>
            <XIcon />
          </Button>
        </div>
      </div>
      {error && <p className="text-xs text-status-overdue">{error}</p>}
    </li>
  )
}

/** Google Calendar's copy and the register's deadlines: a week of hours, a month, or a list of days. */
export function Agenda({ data, onOpenDeadline, onAsk, onDraft, onOpenSettings }: Props) {
  const { t, fmt } = useI18n()
  const { prefs, set } = usePrefs()
  const layout = prefs.agenda
  const today = data.today
  const [anchor, setAnchor] = React.useState(today)
  const [agenda, setAgenda] = React.useState<CalendarAgenda | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [span, setSpan] = React.useState<Span>(30)
  const [deadlines, setDeadlines] = React.useState(true)
  const [open, setOpen] = React.useState<Shown | null>(null)

  // The days on screen: the week of the anchor, the six weeks of its month, or from today on.
  const month = anchor.slice(0, 7)
  const range =
    layout === "week"
      ? { from: mondayOf(anchor), to: addDays(mondayOf(anchor), 6) }
      : layout === "month"
        ? { from: mondayOf(`${month}-01`), to: addDays(mondayOf(`${month}-01`), 41) }
        : { from: today, to: addDays(today, span) }
  const refresh = React.useCallback(() => {
    calendarAgenda(range).then((a) => setAgenda(unlessChanged(a)), (e: Error) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to])
  React.useEffect(refresh, [refresh])
  // The sync, the agent's blocks and Telegram's buttons all write calendar/: the server says when.
  useLiveRefresh("calendar", refresh, 120_000)

  const colors = new Map((agenda?.accounts ?? []).flatMap((a) => a.calendars.map((c) => [`${a.name}/${c.id}`, c] as const)))
  const shown: Shown[] = (agenda?.events ?? []).map((e) => {
    const c = colors.get(`${e.account}/${e.calendar}`)
    return { e, color: c?.color ?? null, calendar: c?.title ?? null }
  })
  const due = deadlines ? data.agenda.filter((o) => !o.done_on && o.date >= range.from && o.date <= range.to) : []
  const connected = agenda?.accounts.some((a) => a.state === "connected") ?? false
  const step = (n: number) => setAnchor((a) => (layout === "week" ? addDays(a, 7 * n) : iso(new Date(parseDate(a).getFullYear(), parseDate(a).getMonth() + n, 1))))
  const title =
    layout === "week"
      ? `${fmt.dayMonth.format(parseDate(range.from))} – ${fmt.long.format(parseDate(range.to))}`
      : capitalize(fmt.monthYear.format(parseDate(`${month}-01`)))
  // The event's deadline, by its id: the next open occurrence, else the last one.
  const deadlineOf = (id: string | null) => {
    if (!id) return null
    const all = data.agenda.filter((o) => o.id === id)
    return all.find((o) => !o.done_on && o.date >= today) ?? all.at(-1) ?? null
  }
  const slot = (day: string, hour: number) =>
    onDraft(t.agenda.draftAt(`${capitalize(fmt.weekdayLong.format(parseDate(day)))} ${fmt.long.format(parseDate(day))}`, `${String(hour).padStart(2, "0")}:00`))

  // The list: day by day, from today.
  const days = new Map<string, Item[]>()
  const put = (day: string, item: Item) => days.set(day, [...(days.get(day) ?? []), item])
  if (layout === "list") {
    for (const s of shown) for (const d of daysOf(s.e, today, range.to)) put(d, { kind: "event", e: s.e, color: s.color })
    for (const o of due) put(o.date, { kind: "deadline", o })
  }
  const order = [...days.keys()].sort()
  const tomorrow = addDays(today, 1)

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {agenda && agenda.proposals.length > 0 && (
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="text-lg font-medium tracking-tight">{t.agenda.proposals}</CardTitle>
            <CardDescription>{t.agenda.proposalsDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {agenda.proposals.map((p) => (
                <Proposal key={p.id} p={p} onAnswered={refresh} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-2xl font-medium tracking-tight">{layout === "list" ? t.agenda.next : title}</CardTitle>
          <CardDescription>{connected ? t.agenda.description : t.agenda.descriptionDeadlines}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup value={[layout]} onValueChange={(v) => v[0] && set("agenda", v[0] as AgendaLayout)} className="rounded-md bg-muted p-0.5">
              {(["week", "month", "list"] as const).map((k) => (
                <ToggleGroupItem key={k} value={k} size="sm" className="h-8 rounded-sm px-3 text-xs aria-pressed:bg-card">
                  {t.agenda.layouts[k]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {layout === "list" ? (
              <ToggleGroup value={[String(span)]} onValueChange={(v) => v[0] && setSpan(Number(v[0]) as Span)} className="rounded-md bg-muted p-0.5">
                {([7, 30, 90] as const).map((n) => (
                  <ToggleGroupItem key={n} value={String(n)} size="sm" className="h-8 rounded-sm px-3 text-xs aria-pressed:bg-card">
                    {t.agenda.days(n)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            ) : (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setAnchor(today)} disabled={range.from <= today && range.to >= today && (layout === "week" || anchor.slice(0, 7) === today.slice(0, 7))}>
                  {t.agenda.today}
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => step(-1)} aria-label={t.agenda.previous}>
                  <ChevronLeftIcon />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => step(1)} aria-label={t.agenda.following}>
                  <ChevronRightIcon />
                </Button>
              </div>
            )}
            <ToggleGroup value={deadlines ? ["on"] : []} onValueChange={(v) => setDeadlines(v.includes("on"))} className="rounded-md bg-muted p-0.5">
              <ToggleGroupItem value="on" size="sm" className="h-8 rounded-sm px-3 text-xs aria-pressed:bg-card">
                {t.agenda.withDeadlines}
              </ToggleGroupItem>
            </ToggleGroup>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => onAsk(t.agenda.askWeek)}>
                <MessageCircleIcon data-icon="inline-start" />
                {t.agenda.askWeekLabel}
              </Button>
              {connected && (
                <Button variant="secondary" size="sm" onClick={() => onDraft(t.agenda.askAdd)}>
                  <CalendarPlusIcon data-icon="inline-start" />
                  {t.agenda.askAddLabel}
                </Button>
              )}
            </div>
          </div>
          {agenda && !connected && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 p-3 text-sm">
              <CalendarDaysIcon className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 text-muted-foreground">{t.agenda.notConnected}</span>
              <Button variant="secondary" size="sm" onClick={onOpenSettings}>
                <SettingsIcon data-icon="inline-start" />
                {t.agenda.connect}
              </Button>
            </div>
          )}
          {agenda?.accounts.filter((a) => a.error).map((a) => (
            <p key={a.name} className="text-sm text-status-overdue">
              {a.name}: {a.error}
            </p>
          ))}
          {error && <p className="text-sm text-status-overdue">{error}</p>}
          {!agenda && !error && <RowsSkeleton rows={6} />}
          {agenda && layout === "week" && (
            <WeekGrid start={range.from} events={shown} deadlines={due} today={today} onOpen={setOpen} onOpenDeadline={onOpenDeadline} onSlot={slot} />
          )}
          {agenda && layout === "month" && (
            <MonthGrid
              month={month}
              events={shown}
              deadlines={due}
              today={today}
              onOpen={setOpen}
              onOpenDeadline={onOpenDeadline}
              onDay={(d) => {
                setAnchor(d)
                set("agenda", "week")
              }}
            />
          )}
          {agenda && layout === "list" && order.length === 0 && <p className="text-sm text-muted-foreground">{t.agenda.empty}</p>}
          {layout === "list" && (
            <div className="flex flex-col gap-4">
              {order.map((day) => {
                const items = days.get(day)!
                const events = items.filter((i): i is Extract<Item, { kind: "event" }> => i.kind === "event").sort((a, b) => Number(b.e.all_day) - Number(a.e.all_day) || a.e.start.localeCompare(b.e.start))
                const dueToday = items.filter((i): i is Extract<Item, { kind: "deadline" }> => i.kind === "deadline")
                const d = parseDate(day)
                return (
                  <section key={day} className="flex flex-col">
                    <h3 className="flex items-baseline gap-2 border-b pb-1.5 text-sm font-medium">
                      {day === today ? t.agenda.today : day === tomorrow ? t.agenda.tomorrow : capitalize(fmt.weekdayLong.format(d))}
                      <span className="font-normal text-muted-foreground">{fmt.long.format(d)}</span>
                    </h3>
                    <ul className="flex flex-col">
                      {dueToday.map(({ o }) => (
                        <DeadlineRow key={o.key} o={o} onOpen={onOpenDeadline} />
                      ))}
                      {events.map(({ e, color }) => (
                        <EventRow key={`${e.account}/${e.id}`} e={e} color={color} onOpen={() => setOpen(shown.find((s) => s.e === e) ?? null)} />
                      ))}
                    </ul>
                  </section>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <EventDialog shown={open} deadline={deadlineOf(open?.e.deadline ?? null)} onClose={() => setOpen(null)} onAsk={onDraft} onOpenDeadline={onOpenDeadline} />
    </div>
  )
}
