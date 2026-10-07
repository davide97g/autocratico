import * as React from "react"
import { caseOpen } from "@autocratico/core"
import {
  AlarmClockIcon,
  CalendarPlusIcon,
  CheckIcon,
  SparklesIcon,
  FolderOpenIcon,
  TriangleAlertIcon,
  ZapIcon,
} from "lucide-react"
import { Area, AreaChart, Bar, BarChart, XAxis } from "recharts"
import { cn } from "cn"

import { CountUp, stagger } from "@/components/motion"
import { PaymentMatchesCard } from "@/components/payment-matches"
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
import { FreshContext } from "@/lib/fresh"
import { areaIcon, areaName, capitalize, parseDate } from "@/lib/format"
import { level, ORDER, SEVERITIES, severity, STYLE } from "@/lib/status"
import { PaymentsCard } from "@/views/payments"
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
  onOpenCase,
  onOpenDeadlines,
  onOpenDeadline,
  onAsk,
}: {
  data: Data
  onOpenCase: (slug: string) => void
  onOpenDeadlines: () => void
  onOpenDeadline: (key: string) => void
  onAsk: (question: string) => void
}) {
  const { t, fmt } = useI18n()
  const fresh = React.useContext(FreshContext)
  const [months, setMonths] = React.useState("6")
  const { agenda, today, incomplete, cases, profile } = data
  const open = agenda.filter((o) => !o.done_on)
  const upcoming = open
    .filter((o) => o.days >= 0)
    .sort((a, b) => a.days - b.days || WEIGHT[severity(a.severity)] - WEIGHT[severity(b.severity)])
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
    <div className="grid grid-cols-1 gap-4 sm:gap-6 @2xl:grid-cols-2 @4xl:grid-cols-12">
      {/* Payments seen in the finance source, waiting for a yes or no */}
      <PaymentMatchesCard onOpen={onOpenDeadline} className="rise-in @2xl:col-span-2 @4xl:col-span-12" />

      {/* Calendar */}
      <Card className="rise-in self-start @2xl:col-span-2 @4xl:col-span-8" style={stagger(0)}>
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
        <CardContent className="flex-1">
          <Timeline agenda={compactAgenda} today={today} months={Number(months)} onOpen={onOpenDeadlines} />
        </CardContent>
        <CardFooter className="bg-transparent">
          <StatusLegend />
        </CardFooter>
      </Card>

      {/* Money to pay */}
      <PaymentsCard agenda={agenda} today={today} onOpen={onOpenDeadline} className="rise-in @2xl:col-span-1 @4xl:col-span-4" style={stagger(1)} />

      {/* Keep an eye on */}
      <Card className="rise-in @4xl:col-span-4" style={stagger(2)}>
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
                onClick={() => onOpenDeadline(o.key)}
                className={cn(
                  "group/row -mx-2 flex items-center gap-3 rounded-lg border-b px-2 py-3 text-left outline-none transition-colors last:border-b-0 hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
                  fresh.has(o.key) && "fresh"
                )}
              >
                <span className={cn("h-8 w-1 shrink-0 rounded-full transition-[height] duration-300 ease-out-expo group-hover/row:h-10", STYLE[l].dot)} />
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
      <Card className="rise-in @4xl:col-span-4" style={stagger(3)}>
        <CardHeader>
          <CardTitle className="text-lg font-medium tracking-tight">{t.overview.load}</CardTitle>
          <CardDescription>{t.overview.loadDescription}</CardDescription>
          <CardAction className="text-3xl font-medium tracking-tight">
            <CountUp value={year.length} />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-5">
          <ChartContainer config={loadConfig} className="aspect-auto h-24 min-h-24 w-full flex-1">
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
      <Card className="rise-in @2xl:col-span-2 @4xl:col-span-4" style={stagger(4)}>
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
        {incomplete.length > 0 && (
          <CardFooter className="mt-auto flex-wrap gap-2 bg-transparent">
            <Button variant="secondary" size="sm" className="group/find" onClick={() => onAsk(t.overview.findDatesPrompt)}>
              <SparklesIcon data-icon="inline-start" className="transition-transform duration-300 group-hover/find:rotate-12" />
              {t.overview.findDates}
            </Button>
            {incomplete.length > 5 && (
              <Button variant="ghost" size="sm" onClick={onOpenDeadlines}>
                {t.overview.seeAll(incomplete.length)}
              </Button>
            )}
          </CardFooter>
        )}
      </Card>

      {/* Cases */}
      <Card className="rise-in @2xl:col-span-2 @4xl:col-span-12" style={stagger(5)}>
        <CardHeader className="flex flex-wrap items-center gap-x-10 gap-y-4 max-sm:gap-y-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-2xl font-medium tracking-tight">{t.overview.cases}</CardTitle>
            <Badge>{openCases.length}</Badge>
          </div>
          <div className="grid w-full grid-cols-2 gap-x-4 gap-y-3 sm:flex sm:w-auto sm:flex-wrap sm:gap-8">
            <Stat icon={TriangleAlertIcon} label={t.overview.stats.overdue} value={count("overdue")} className={STYLE.overdue.solid} />
            <Stat icon={ZapIcon} label={t.overview.stats.urgent} value={count("urgent")} className={STYLE.urgent.solid} />
            <Stat icon={AlarmClockIcon} label={t.overview.stats.soon} value={count("soon")} className={STYLE.soon.solid} />
            <Stat icon={CheckIcon} label={t.overview.stats.done} value={count("done")} className={STYLE.done.solid} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="dark">
            <div className="relative grid gap-6 overflow-hidden rounded-lg bg-background p-5 text-foreground @2xl:grid-cols-3 @2xl:gap-8 @2xl:p-8">
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
      <span className={cn("flex size-9 items-center justify-center rounded-md transition-colors duration-500", value ? className : "bg-muted text-muted-foreground")}>
        <Icon className="size-4" />
      </span>
      <div className="flex flex-col leading-tight">
        <span className="text-xs text-muted-foreground">{label}</span>
        <CountUp value={value} className="font-mono text-lg font-medium" />
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
