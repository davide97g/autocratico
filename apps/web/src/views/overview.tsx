import * as React from "react"
import { caseOpen } from "@autocratico/core"
import {
  AlarmClockIcon,
  ArrowUpRightIcon,
  CalendarPlusIcon,
  CheckIcon,
  FolderOpenIcon,
  TriangleAlertIcon,
  ZapIcon,
} from "lucide-react"
import { Area, AreaChart, Bar, BarChart, XAxis } from "recharts"
import { cn } from "cn"

import { Sensitive } from "@/components/privacy"
import { SeverityIcon, StatusBadge, StatusLegend } from "@/components/status"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useI18n } from "@/i18n"
import type { Data, Occurrence } from "@/lib/api"
import { areaIcon, areaName, capitalize, parseDate } from "@/lib/format"
import { level, ORDER, SEVERITIES, severity, STYLE } from "@/lib/status"
import { Timeline } from "@/views/timeline"

function perMonth(items: Occurrence[], today: string, months: number, format: Intl.DateTimeFormat) {
  const base = parseDate(today)
  return Array.from({ length: months }, (_, i) => {
    const m = new Date(base.getFullYear(), base.getMonth() + i, 1)
    const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`
    return {
      month: capitalize(format.format(m)),
      deadlines: items.filter((o) => o.date.startsWith(key)).length,
    }
  })
}

function profileFields(profile: Data["profile"]) {
  const values = Object.values(profile).flatMap((s) =>
    Array.isArray(s) ? s.flatMap((r) => Object.values(r)) : Object.values(s)
  )
  return { filled: values.filter((v) => v !== "TODO" && v !== "" && v != null).length, total: values.length }
}

// Dot color for missing dates: the more severe, the more visible.
const SEVERITY_DOT = { high: "bg-status-urgent", medium: "bg-status-soon", low: "bg-muted-foreground" } as const
const WEIGHT = { high: 0, medium: 1, low: 2 } as const
// Chart props as constants: Recharts copies them into its store whenever their identity changes.
const CHART_MARGIN = { left: 0, right: 0, top: 4, bottom: 0 }
const TICK = { fontSize: 10, fill: "var(--muted-foreground)" }

function SquareIcon({ icon: Icon, className }: { icon: React.ElementType; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground",
        className
      )}
    >
      <Icon className="size-4" />
    </span>
  )
}

export const Overview = React.memo(function Overview({
  data,
  onDone,
  onOpenCase,
  onOpenDeadlines,
}: {
  data: Data
  onDone: (o: Occurrence, done: boolean) => void
  onOpenCase: (slug: string) => void
  onOpenDeadlines: () => void
}) {
  const { t, fmt } = useI18n()
  const [months, setMonths] = React.useState("6")
  const { agenda, today, incomplete, cases, profile } = data
  const open = agenda.filter((o) => !o.done_on)
  const upcoming = open
    .filter((o) => o.days >= 0)
    .sort((a, b) => a.days - b.days || WEIGHT[severity(a.severity)] - WEIGHT[severity(b.severity)])
  const next = upcoming[0]
  // Memoized: a new array would make the charts replay their animation (and the calendar lay out again).
  const { compactAgenda, year, load } = React.useMemo(() => {
    // Monthly deadlines crowd the calendar and the charts: only the next one is shown.
    const monthlySeen = new Set<string>()
    const compactAgenda = agenda.filter((o) => {
      if (o.repeat !== "monthly" || o.done_on || o.days < 0) return true
      if (monthlySeen.has(o.id)) return false
      monthlySeen.add(o.id)
      return true
    })
    const year = compactAgenda.filter((o) => !o.done_on && o.days >= 0 && o.days <= 365)
    return { compactAgenda, year, load: perMonth(year, today, 12, fmt.monthShort) }
  }, [agenda, today, fmt])
  const count = (l: string) => agenda.filter((o) => level(o) === l).length
  const byArea = [...new Set(year.map((o) => o.area))]
    .map((a) => ({ a, n: year.filter((o) => o.area === a).length }))
    .sort((x, y) => y.n - x.n)
  const { filled, total } = profileFields(profile)
  const caseUrgency = (slug: string) => Math.min(...upcoming.filter((o) => o.case === slug).map((o) => o.days), Infinity)
  const openCases = cases
    .filter(caseOpen)
    .sort((a, b) => caseUrgency(a.slug) - caseUrgency(b.slug))
  const highlighted = compactAgenda
    .filter((o) => !o.done_on)
    .sort((a, b) => ORDER.indexOf(level(a)) - ORDER.indexOf(level(b)) || a.days - b.days)
    .slice(0, 5)
  const missing = [...incomplete].sort(
    (a, b) => SEVERITIES.indexOf(severity(a.severity)) - SEVERITIES.indexOf(severity(b.severity))
  )
  const loadConfig = React.useMemo(
    () => ({ deadlines: { label: t.overview.chartLabel, color: "var(--primary)" } }) satisfies ChartConfig,
    [t]
  )
  const barsConfig = React.useMemo(
    () => ({ deadlines: { label: t.overview.chartLabel, color: "var(--foreground)" } }) satisfies ChartConfig,
    [t]
  )

  return (
    <div className="grid grid-cols-1 gap-6 @2xl:grid-cols-2 @4xl:grid-cols-12">
      {/* Calendar */}
      <Card className="@2xl:col-span-2 @4xl:col-span-8">
        <CardHeader>
          <CardTitle className="text-lg font-medium tracking-tight">{t.overview.calendar}</CardTitle>
          <CardDescription className="col-start-1">{t.overview.calendarDescription(Number(months))}</CardDescription>
          <CardAction className="@max-md:col-start-1 @max-md:row-span-1 @max-md:row-start-3 @max-md:mt-3 @max-md:justify-self-start">
            <ToggleGroup
              value={[months]}
              onValueChange={(v) => v[0] && setMonths(v[0])}
              className="rounded-lg bg-muted p-1"
              aria-label={t.overview.window}
            >
              {["3", "6", "12"].map((m) => (
                <ToggleGroupItem key={m} value={m} size="sm" className="rounded-md px-3 aria-pressed:bg-card">
                  {t.overview.months(Number(m))}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Timeline agenda={compactAgenda} today={today} months={Number(months)} onOpen={onOpenDeadlines} />
        </CardContent>
        <CardFooter className="bg-transparent">
          <StatusLegend />
        </CardFooter>
      </Card>

      {/* Next task */}
      <div className="dark @2xl:col-span-1 @4xl:col-span-4">
        <Card className="relative h-full min-h-96 bg-background ring-0">
          <CardHeader className="relative z-10">
            <CardTitle className="flex items-center gap-2">
              <ArrowUpRightIcon className="size-4" />
              {t.overview.next}
            </CardTitle>
            {next && (
              <CardAction>
                <StatusBadge level={level(next)} />
              </CardAction>
            )}
          </CardHeader>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-16 flex justify-center">
            <div className="chrome-halo absolute size-52" />
            <div className="chrome-orb size-36" />
          </div>
          {next ? (
            <CardContent className="relative z-10 mt-auto flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <div className="text-5xl font-medium tracking-tight">
                  <Sensitive when={next.sensitive}>{fmt.dayMonth.format(parseDate(next.date))}</Sensitive>
                </div>
                <div className="text-base font-medium">{next.title}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {t.relativeDays(next.days)} · {areaName(t, next.area)}
                  <SeverityIcon value={next.severity} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => onDone(next, true)}>
                  <CheckIcon data-icon="inline-start" />
                  {t.overview.markDone}
                </Button>
                {next.case && (
                  <Button variant="outline" size="sm" onClick={() => onOpenCase(next.case!)}>
                    {t.overview.openCase}
                  </Button>
                )}
              </div>
            </CardContent>
          ) : (
            <CardContent className="relative z-10 mt-auto text-sm text-muted-foreground">
              {t.overview.nothingScheduled}
            </CardContent>
          )}
        </Card>
      </div>

      {/* Keep an eye on */}
      <Card className="@4xl:col-span-4">
        <CardHeader>
          <CardTitle className="text-lg font-medium tracking-tight">{t.overview.watch}</CardTitle>
          <CardDescription>{t.overview.watchDescription}</CardDescription>
          <CardAction>
            <ZapIcon className="size-4 text-muted-foreground" />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col">
          {highlighted.map((o) => {
            const l = level(o)
            return (
              <button
                key={o.key}
                type="button"
                onClick={onOpenDeadlines}
                className="flex items-center gap-3 border-b py-3 text-left outline-none last:border-b-0 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className={cn("h-8 w-1 shrink-0 rounded-full", STYLE[l].dot)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{o.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    <Sensitive when={o.sensitive}>{fmt.dayMonth.format(parseDate(o.date))}</Sensitive> · {areaName(t, o.area)}
                  </span>
                </span>
                <StatusBadge level={l} days={o.days} />
              </button>
            )
          })}
        </CardContent>
      </Card>

      {/* This year's load */}
      <Card className="@4xl:col-span-4">
        <CardHeader>
          <CardTitle className="text-lg font-medium tracking-tight">{t.overview.load}</CardTitle>
          <CardDescription>{t.overview.loadDescription}</CardDescription>
          <CardAction className="text-3xl font-medium tracking-tight">{year.length}</CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <ChartContainer config={loadConfig} className="aspect-auto h-24 w-full">
            <AreaChart data={load} margin={CHART_MARGIN}>
              <defs>
                <linearGradient id="load-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-deadlines)" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="var(--color-deadlines)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <ChartTooltip content={<ChartTooltipContent hideIndicator />} cursor={false} />
              <XAxis dataKey="month" hide />
              <Area dataKey="deadlines" type="monotone" stroke="var(--color-deadlines)" strokeWidth={1.5} fill="url(#load-fill)" />
            </AreaChart>
          </ChartContainer>
          <ul className="flex flex-col gap-3 text-sm">
            {byArea.slice(0, 4).map(({ a, n }) => (
              <li key={a} className="flex items-center gap-3">
                <span className="flex-1">{areaName(t, a)}</span>
                <span className="font-mono text-xs text-muted-foreground">{Math.round((n / year.length) * 100)}%</span>
                <span className="w-6 text-right font-mono">{n}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Dates to add */}
      <Card className="@2xl:col-span-2 @4xl:col-span-4">
        <CardHeader>
          <CardTitle className="text-lg font-medium tracking-tight">{t.overview.missing}</CardTitle>
          <CardDescription>{t.overview.missingDescription}</CardDescription>
          <CardAction>
            <SquareIcon icon={CalendarPlusIcon} />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col">
          {missing.slice(0, 5).map((m) => {
            const Icon = areaIcon(m.area)
            return (
              <div key={m.id} className="flex items-center gap-3 border-b py-3 last:border-b-0">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{m.title}</span>
                <span className={cn("size-2 rounded-full", SEVERITY_DOT[severity(m.severity)])} />
                <SeverityIcon value={m.severity} />
              </div>
            )
          })}
        </CardContent>
        {incomplete.length > 5 && (
          <CardFooter className="bg-transparent">
            <Button variant="ghost" size="sm" onClick={onOpenDeadlines}>
              {t.overview.seeAll(incomplete.length)}
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* Cases */}
      <Card className="@2xl:col-span-2 @4xl:col-span-12">
        <CardHeader className="flex flex-wrap items-center gap-x-10 gap-y-4">
          <div className="flex items-center gap-2">
            <CardTitle className="text-2xl font-medium tracking-tight">{t.overview.cases}</CardTitle>
            <Badge>{openCases.length}</Badge>
          </div>
          <div className="flex flex-wrap gap-8">
            <Stat icon={TriangleAlertIcon} label={t.overview.stats.overdue} value={count("overdue")} className={STYLE.overdue.solid} />
            <Stat icon={ZapIcon} label={t.overview.stats.urgent} value={count("urgent")} className={STYLE.urgent.solid} />
            <Stat icon={AlarmClockIcon} label={t.overview.stats.soon} value={count("soon")} className={STYLE.soon.solid} />
            <Stat icon={CheckIcon} label={t.overview.stats.done} value={count("done")} className={STYLE.done.solid} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="dark">
            <div className="relative grid gap-8 overflow-hidden rounded-lg bg-background p-6 text-foreground @2xl:grid-cols-3 @2xl:p-8">
              <div aria-hidden className="silk pointer-events-none absolute -inset-10" />
              {openCases.slice(0, 1).map((c) => (
                <Block
                  key={c.slug}
                  title={c.title}
                  subtitle={c.status || t.overview.inProgress}
                  value={c.total ? (c.done / c.total) * 100 : 0}
                  label={`${c.done}/${c.total}`}
                  onOpen={() => onOpenCase(c.slug)}
                />
              ))}
              <Block
                title={t.overview.profile}
                subtitle={t.overview.profileDescription}
                value={total ? (filled / total) * 100 : 0}
                label={`${filled}/${total}`}
              />
              <div className="relative flex flex-col gap-3">
                <div className="text-sm font-medium">{t.overview.next12}</div>
                <ChartContainer config={barsConfig} className="aspect-auto h-28 w-full">
                  <BarChart data={load} margin={CHART_MARGIN}>
                    <ChartTooltip content={<ChartTooltipContent hideIndicator />} cursor={false} />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      tick={TICK}
                      interval={1}
                    />
                    <Bar dataKey="deadlines" fill="var(--color-deadlines)" radius={2} />
                  </BarChart>
                </ChartContainer>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
})

function Stat({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ElementType
  label: string
  value: number
  className: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn("flex size-9 items-center justify-center rounded-md", value ? className : "bg-muted text-muted-foreground")}>
        <Icon className="size-4" />
      </span>
      <div className="flex flex-col leading-tight">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-mono text-lg font-medium">{value}</span>
      </div>
    </div>
  )
}

function Block({
  title,
  subtitle,
  value,
  label,
  onOpen,
}: {
  title: string
  subtitle: string
  value: number
  label: string
  onOpen?: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="relative flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <Progress value={value}>
        <ProgressLabel className="text-xs text-muted-foreground">{t.overview.progress}</ProgressLabel>
        <ProgressValue className="ml-auto font-mono text-xs">{() => label}</ProgressValue>
      </Progress>
      {onOpen && (
        <Button variant="secondary" size="sm" className="mt-auto self-start" onClick={onOpen}>
          <FolderOpenIcon data-icon="inline-start" />
          {t.overview.openCase}
        </Button>
      )}
    </div>
  )
}
