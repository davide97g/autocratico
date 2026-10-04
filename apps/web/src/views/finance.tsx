import * as React from "react"
import {
  addDays,
  addMonths,
  byCategory,
  futureByMonth,
  futureExpenses,
  type Granularity,
  GRANULARITIES,
  nextPeriod,
  periodStart,
  portfolio,
  trend,
} from "@autocratico/core"
import { ChartLineIcon, ChevronLeftIcon, ChevronRightIcon, LandmarkIcon, RadioIcon, RefreshCwIcon, SettingsIcon } from "lucide-react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, ReferenceLine, XAxis, YAxis } from "recharts"
import { cn } from "cn"

import { Sensitive, usePrivacy } from "@/components/privacy"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useI18n } from "@/i18n"
import { type Data, type FinanceData, syncFinance } from "@/lib/api"
import { capitalize, parseDate } from "@/lib/format"

const CHART_MARGIN = { left: 0, right: 0, top: 8, bottom: 0 }
const TICK = { fontSize: 11, fill: "var(--muted-foreground)" }
const FUTURE_MONTHS = 12
/** Categories shown by name; the rest add up to "Other". */
const TOP_CATEGORIES = 7
/** Periods in the trend chart, and how many before the selected one make its average. */
const WINDOW: Record<Granularity, number> = { week: 16, month: 12, year: 10 }
const AVERAGE: Record<Granularity, number> = { week: 12, month: 12, year: 3 }

type Fmt = ReturnType<typeof useI18n>["fmt"]

/** `n` periods after (or before, when negative) the one starting on `start`. */
function shift(start: string, g: Granularity, n: number): string {
  return g === "week" ? addDays(start, 7 * n) : addMonths(start, g === "year" ? 12 * n : n)
}

const lastDay = (start: string, g: Granularity) => addDays(nextPeriod(start, g), -1)

function periodLabel(start: string, g: Granularity, fmt: Fmt): string {
  if (g === "year") return start.slice(0, 4)
  if (g === "month") return capitalize(fmt.monthYear.format(parseDate(start)))
  const end = addDays(start, 6)
  return `${fmt.dayMonth.format(parseDate(start))} – ${fmt.dayMonth.format(parseDate(end))} ${end.slice(0, 4)}`
}

function tickLabel(start: string, g: Granularity, fmt: Fmt): string {
  if (g === "year") return start.slice(0, 4)
  if (g === "month") return capitalize(fmt.monthShortYear.format(parseDate(start)))
  return fmt.dayMonth.format(parseDate(start))
}

/** Tooltip rows with the series' color, name and amount in euro. */
function moneyTooltip(fmt: Fmt, labels: Record<string, string>, dots: Record<string, string>) {
  return (
    <ChartTooltipContent
      className="min-w-44"
      formatter={(value, _name, item) => (
        <div className="flex w-full items-center gap-2">
          <span className={cn("size-2.5 shrink-0 rounded-xs", dots[String(item.dataKey)])} />
          <span className="text-muted-foreground">{labels[String(item.dataKey)]}</span>
          <span className="ml-auto pl-4 font-mono font-medium text-foreground tabular-nums">{fmt.euro.format(Number(value))}</span>
        </div>
      )}
    />
  )
}

function Legend({ items }: { items: { label: string; dot: string }[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-2">
          <span className={cn("shrink-0 rounded-xs", i.dot)} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "in" | "out" }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-2xl font-medium tracking-tight", tone === "in" && "text-money-in", tone === "out" && "text-money-out")}>{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

/** Expenses, earnings and investments: the finance app's data as synced, the register's payments, the brokers' snapshots. */
export function Finance({
  data,
  finance,
  onReload,
  onOpenDeadline,
  onOpenSettings,
}: {
  data: Data
  finance: FinanceData | null
  onReload: () => void
  onOpenDeadline: (key: string) => void
  onOpenSettings: () => void
}) {
  if (!finance) {
    return (
      <div className="grid gap-6 @4xl:grid-cols-3">
        <Skeleton className="h-72 rounded-xl @4xl:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-12">
      {finance.mirror ? (
        <Synced data={data} finance={finance} onReload={onReload} onOpenDeadline={onOpenDeadline} />
      ) : (
        <NotConnected onOpenSettings={onOpenSettings} className="@4xl:col-span-12" />
      )}
      <InvestmentsCard finance={finance} className="@4xl:col-span-12" />
    </div>
  )
}

/** The cards fed by the finance app, driven by one selected period (a week, a month or a year). */
function Synced({ data, finance, onReload, onOpenDeadline }: { data: Data; finance: FinanceData; onReload: () => void; onOpenDeadline: (key: string) => void }) {
  const today = finance.today
  const mirror = finance.mirror!
  const [g, setG] = React.useState<Granularity>("month")
  const [selected, setSelected] = React.useState(() => periodStart(today, "month"))
  const first = periodStart(mirror.transactions[0]?.date ?? today, g)
  const last = periodStart(today, g)

  const changeG = (next: Granularity) => {
    setG(next)
    // Keep the same moment: the week, month or year holding the selected period's start (never in the future).
    const start = periodStart(selected, next)
    setSelected(start > periodStart(today, next) ? periodStart(today, next) : start)
  }

  return (
    <>
      <PeriodCard
        finance={finance}
        g={g}
        selected={selected}
        first={first}
        last={last}
        onG={changeG}
        onSelect={setSelected}
        onReload={onReload}
        className="@4xl:col-span-12"
      />
      <TrendCard finance={finance} g={g} selected={selected} first={first} last={last} onSelect={setSelected} className="@4xl:col-span-12" />
      <CategoriesCard finance={finance} g={g} selected={selected} className="@4xl:col-span-6" />
      <FutureCard data={data} finance={finance} onOpenDeadline={onOpenDeadline} className="@4xl:col-span-6" />
    </>
  )
}

function NotConnected({ onOpenSettings, className }: { onOpenSettings: () => void; className?: string }) {
  const { t } = useI18n()
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-medium tracking-tight">
          <ChartLineIcon className="size-4" />
          {t.views.finance}
        </CardTitle>
        <CardDescription>{t.finance.notConnected}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="secondary" onClick={onOpenSettings}>
          <SettingsIcon data-icon="inline-start" />
          {t.finance.openSettings}
        </Button>
      </CardContent>
    </Card>
  )
}

/** The selected period, with arrows to move through it, and its totals against the periods before it. */
function PeriodCard({
  finance,
  g,
  selected,
  first,
  last,
  onG,
  onSelect,
  onReload,
  className,
}: {
  finance: FinanceData
  g: Granularity
  selected: string
  first: string
  last: string
  onG: (g: Granularity) => void
  onSelect: (start: string) => void
  onReload: () => void
  className?: string
}) {
  const { t, fmt, locale } = useI18n()
  const [syncing, setSyncing] = React.useState(false)
  const mirror = finance.mirror!
  const current = React.useMemo(() => trend(mirror.transactions, g, selected, lastDay(selected, g))[0], [mirror, g, selected])
  const average = React.useMemo(() => {
    const before = trend(mirror.transactions, g, shift(selected, g, -AVERAGE[g]), addDays(selected, -1)).filter((b) => b.expense || b.earning)
    const mean = (k: "expense" | "earning") => (before.length ? before.reduce((s, b) => s + b[k], 0) / before.length : null)
    return { n: before.length, expense: mean("expense"), earning: mean("earning") }
  }, [mirror, g, selected])
  const saved = current.earning > 0 ? current.net / current.earning : null
  const synced = new Date(mirror.synced_at).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
  const avgHint = (v: number | null) =>
    v === null ? undefined : (
      <>
        {capitalize(t.finance.average(average.n, t.finance.units[g]))}: <Sensitive>{fmt.euro.format(v)}</Sensitive>
      </>
    )

  async function sync() {
    setSyncing(true)
    try {
      await syncFinance()
      onReload()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => onSelect(shift(selected, g, -1))} disabled={selected <= first} aria-label={t.finance.previous} title={t.finance.previous}>
            <ChevronLeftIcon />
          </Button>
          <CardTitle className="min-w-40 text-center text-lg font-medium tracking-tight">{periodLabel(selected, g, fmt)}</CardTitle>
          <Button variant="outline" size="icon-sm" onClick={() => onSelect(shift(selected, g, 1))} disabled={selected >= last} aria-label={t.finance.next} title={t.finance.next}>
            <ChevronRightIcon />
          </Button>
          {selected !== last && (
            <Button variant="ghost" size="sm" onClick={() => onSelect(last)}>
              {t.finance.current}
            </Button>
          )}
        </div>
        <CardDescription className="flex items-center gap-2">
          <Badge variant={finance.live ? "secondary" : "outline"}>
            {finance.live && <RadioIcon data-icon="inline-start" />}
            {finance.live ? t.finance.live : t.finance.hourly}
          </Badge>
          {t.finance.syncedAt(synced)}
          <Button variant="ghost" size="icon-xs" onClick={sync} disabled={syncing} aria-label={t.finance.sync} title={t.finance.sync}>
            <RefreshCwIcon className={cn(syncing && "animate-spin")} />
          </Button>
        </CardDescription>
        <CardAction className="@max-md:col-start-1 @max-md:row-span-1 @max-md:row-start-3 @max-md:mt-3 @max-md:justify-self-start">
          <ToggleGroup value={[g]} onValueChange={(v) => v[0] && onG(v[0] as Granularity)} className="rounded-lg bg-muted p-1" aria-label={t.finance.period}>
            {GRANULARITIES.map((o) => (
              <ToggleGroupItem key={o} value={o} size="sm" className="rounded-md px-3 aria-pressed:bg-card">
                {t.finance.granularity[o]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-6 @2xl:grid-cols-4">
        <Stat label={t.finance.spent} value={<Sensitive>{fmt.euro.format(current.expense)}</Sensitive>} hint={avgHint(average.expense)} />
        <Stat label={t.finance.earned} value={<Sensitive>{fmt.euro.format(current.earning)}</Sensitive>} hint={avgHint(average.earning)} />
        <Stat label={t.finance.net} value={<Sensitive>{fmt.euro.format(current.net)}</Sensitive>} tone={current.net < 0 ? "out" : current.net > 0 ? "in" : undefined} />
        <Stat
          label={t.finance.saved}
          value={saved === null ? "—" : <Sensitive>{fmt.percent.format(saved)}</Sensitive>}
          tone={saved === null ? undefined : saved < 0 ? "out" : "in"}
        />
      </CardContent>
    </Card>
  )
}

/** Expenses and earnings around the selected period, the net as a line; a bar opens its period. */
function TrendCard({
  finance,
  g,
  selected,
  first,
  last,
  onSelect,
  className,
}: {
  finance: FinanceData
  g: Granularity
  selected: string
  first: string
  last: string
  onSelect: (start: string) => void
  className?: string
}) {
  const { t, fmt } = useI18n()
  const { enabled: privacy } = usePrivacy()
  const mirror = finance.mirror!
  const rows = React.useMemo(() => {
    const n = WINDOW[g]
    // The selected period with some context after it, without going past now or (when possible) before the first data.
    let end = shift(selected, g, Math.floor(n / 3))
    if (end > last) end = last
    let from = shift(end, g, -(n - 1))
    if (from < first) {
      from = first
      end = shift(first, g, n - 1) > last ? last : shift(first, g, n - 1)
    }
    return trend(mirror.transactions, g, from, lastDay(end, g)).map((b) => ({ ...b, label: tickLabel(b.start, g, fmt) }))
  }, [mirror, g, selected, first, last, fmt])
  const config = React.useMemo(
    () =>
      ({
        expense: { label: t.finance.expenses, color: "var(--money-out)" },
        earning: { label: t.finance.earnings, color: "var(--money-in)" },
        net: { label: t.finance.net, color: "var(--foreground)" },
      }) satisfies ChartConfig,
    [t]
  )
  const labels = { expense: t.finance.expenses, earning: t.finance.earnings, net: t.finance.net }
  const dots = { expense: "bg-money-out", earning: "bg-money-in", net: "bg-foreground" }
  const open = (row: unknown) => {
    const start = (row as { payload?: { start?: string } })?.payload?.start
    if (start) onSelect(start)
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg font-medium tracking-tight">{t.finance.trend}</CardTitle>
        <CardDescription>
          {t.finance.trendDescription} · {t.finance.selectHint}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ChartContainer config={config} className="aspect-auto h-72 w-full">
          <ComposedChart data={rows} margin={CHART_MARGIN} barGap={2} barCategoryGap="20%">
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            {!privacy && <ChartTooltip content={moneyTooltip(fmt, labels, dots)} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />}
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} minTickGap={8} />
            <YAxis hide={privacy} tickLine={false} axisLine={false} tick={TICK} width={56} tickFormatter={(v: number) => fmt.euroShort.format(v)} />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Bar dataKey="expense" fill="var(--color-expense)" radius={[3, 3, 0, 0]} maxBarSize={28} className="cursor-pointer" onClick={open}>
              {rows.map((r) => (
                <Cell key={r.start} fillOpacity={r.start === selected ? 1 : 0.45} />
              ))}
            </Bar>
            <Bar dataKey="earning" fill="var(--color-earning)" radius={[3, 3, 0, 0]} maxBarSize={28} className="cursor-pointer" onClick={open}>
              {rows.map((r) => (
                <Cell key={r.start} fillOpacity={r.start === selected ? 1 : 0.45} />
              ))}
            </Bar>
            <Line dataKey="net" stroke="var(--color-net)" strokeWidth={1.5} dot={{ r: 2.5, fill: "var(--color-net)" }} activeDot={{ r: 4 }} type="linear" />
          </ComposedChart>
        </ChartContainer>
        <Legend
          items={[
            { label: t.finance.expenses, dot: "size-2.5 bg-money-out" },
            { label: t.finance.earnings, dot: "size-2.5 bg-money-in" },
            { label: t.finance.net, dot: "h-0.5 w-3 bg-foreground" },
          ]}
        />
      </CardContent>
    </Card>
  )
}

/** Where the money went in the selected period, biggest categories first. */
function CategoriesCard({ finance, g, selected, className }: { finance: FinanceData; g: Granularity; selected: string; className?: string }) {
  const { t, fmt } = useI18n()
  const { enabled: privacy } = usePrivacy()
  const [budgetOnly, setBudgetOnly] = React.useState(false)
  const mirror = finance.mirror!
  const rows = React.useMemo(() => {
    const exclude = new Set(budgetOnly ? mirror.categories.filter((c) => c.excludeFromBudget).map((c) => c.id) : [])
    const names = new Map(mirror.categories.map((c) => [c.id, c.name]))
    const all = byCategory(mirror.transactions, selected, lastDay(selected, g), exclude)
    const top = all.slice(0, TOP_CATEGORIES).map((c) => ({ name: names.get(c.category) ?? c.category, total: c.total }))
    const rest = all.slice(TOP_CATEGORIES).reduce((s, c) => s + c.total, 0)
    return rest > 0 ? [...top, { name: t.finance.other, total: Math.round(rest * 100) / 100 }] : top
  }, [mirror, g, selected, budgetOnly, t])
  const total = rows.reduce((s, r) => s + r.total, 0)
  const config = React.useMemo(() => ({ total: { label: t.finance.expenses, color: "var(--money-out)" } }) satisfies ChartConfig, [t])

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg font-medium tracking-tight">{t.finance.categories}</CardTitle>
        <CardDescription>{t.finance.categoriesDescription(periodLabel(selected, g, fmt))}</CardDescription>
        <CardAction className="text-2xl font-medium tracking-tight">
          <Sensitive>{fmt.euro.format(total)}</Sensitive>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={budgetOnly} onCheckedChange={setBudgetOnly} />
          {t.finance.excludeBudget}
        </label>
        {rows.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">{t.finance.noData}</p>
        ) : (
          <ChartContainer config={config} className={cn("aspect-auto w-full", rows.length <= 3 ? "h-36" : rows.length <= 5 ? "h-56" : "h-80")}>
            <BarChart data={rows} layout="vertical" margin={{ left: 0, right: privacy ? 8 : 72, top: 0, bottom: 0 }} barCategoryGap="22%">
              {!privacy && <ChartTooltip content={moneyTooltip(fmt, { total: t.finance.expenses }, { total: "bg-money-out" })} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />}
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={{ ...TICK, fill: "var(--foreground)" }} width={120} />
              <Bar dataKey="total" fill="var(--color-total)" radius={[0, 4, 4, 0]} maxBarSize={26}>
                {!privacy && (
                  <LabelList dataKey="total" position="right" className="fill-foreground font-mono" fontSize={11} formatter={(v: unknown) => fmt.euro.format(Number(v))} />
                )}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

/** The next twelve months: the finance app's recurring expenses and the register's payments, by source. */
function FutureCard({ data, finance, onOpenDeadline, className }: { data: Data; finance: FinanceData; onOpenDeadline: (key: string) => void; className?: string }) {
  const { t, fmt } = useI18n()
  const { enabled: privacy } = usePrivacy()
  const today = finance.today
  const items = React.useMemo(
    () => futureExpenses(data.agenda, finance.mirror?.recurring ?? [], finance.deadlines, today, FUTURE_MONTHS),
    [data.agenda, finance, today]
  )
  const months = React.useMemo(
    () => futureByMonth(items, today, FUTURE_MONTHS).map((m) => ({ ...m, label: capitalize(fmt.monthShort.format(parseDate(`${m.month}-01`))) })),
    [items, today, fmt]
  )
  const total = months.reduce((s, m) => s + m.finance + m.known + m.estimate, 0)
  const config = React.useMemo(
    () =>
      ({
        finance: { label: t.finance.recurring, color: "var(--chart-2)" },
        known: { label: t.finance.known, color: "var(--money-out)" },
        estimate: { label: t.finance.estimated, color: "var(--money-out-muted)" },
      }) satisfies ChartConfig,
    [t]
  )
  const labels = { finance: t.finance.recurring, known: t.finance.known, estimate: t.finance.estimated }
  const dots = { finance: "bg-chart-2", known: "bg-money-out", estimate: "bg-money-out-muted" }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg font-medium tracking-tight">{t.finance.future}</CardTitle>
        <CardDescription>{t.finance.futureDescription(FUTURE_MONTHS)}</CardDescription>
        <CardAction className="text-2xl font-medium tracking-tight">
          ≈ <Sensitive>{fmt.euro.format(total)}</Sensitive>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-col gap-4">
        <ChartContainer config={config} className="aspect-auto h-36 w-full">
          <BarChart data={months} margin={CHART_MARGIN} barCategoryGap="18%">
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            {!privacy && <ChartTooltip content={moneyTooltip(fmt, labels, dots)} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />}
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} interval={0} />
            <YAxis hide={privacy} tickLine={false} axisLine={false} tick={TICK} width={48} tickFormatter={(v: number) => fmt.euroShort.format(v)} />
            <Bar dataKey="finance" stackId="a" fill="var(--color-finance)" />
            <Bar dataKey="known" stackId="a" fill="var(--color-known)" />
            <Bar dataKey="estimate" stackId="a" fill="var(--color-estimate)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartContainer>
        <Legend
          items={[
            { label: t.finance.recurring, dot: "size-2.5 bg-chart-2" },
            { label: t.finance.known, dot: "size-2.5 bg-money-out" },
            { label: t.finance.estimated, dot: "size-2.5 bg-money-out-muted" },
          ]}
        />
        <div className="-mx-1 flex max-h-80 flex-col overflow-y-auto px-1">
          {items.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{t.finance.noFuture}</p>
          ) : (
            items.slice(0, 40).map((i) => {
              const row = (
                <>
                  <span className={cn("h-7 w-1 shrink-0 rounded-full", i.source === "finance" ? "bg-chart-2" : i.basis === "known" ? "bg-money-out" : "bg-money-out-muted")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{i.label}</span>
                    <span className="block text-xs text-muted-foreground">{fmt.dayMonth.format(parseDate(i.date))}</span>
                  </span>
                  <Badge variant="outline">{t.finance.sources[i.source]}</Badge>
                  <span className="w-24 shrink-0 text-right font-mono text-xs">
                    {i.amount === null || i.basis === "unknown" ? (
                      "—"
                    ) : (
                      <>
                        {i.basis === "estimate" && "≈ "}
                        <Sensitive>{fmt.euro.format(i.amount)}</Sensitive>
                      </>
                    )}
                  </span>
                </>
              )
              return i.deadline ? (
                <button
                  key={i.key}
                  type="button"
                  onClick={() => onOpenDeadline(i.key)}
                  className="flex shrink-0 items-center gap-3 border-b py-2.5 text-left outline-none last:border-b-0 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {row}
                </button>
              ) : (
                <div key={i.key} className="flex shrink-0 items-center gap-3 border-b py-2.5 last:border-b-0">
                  {row}
                </div>
              )
            })
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** Portfolio value over time from the brokers' snapshots, and what it holds now. */
function InvestmentsCard({ finance, className }: { finance: FinanceData; className?: string }) {
  const { t, fmt } = useI18n()
  const { enabled: privacy } = usePrivacy()
  const p = React.useMemo(() => portfolio(finance.investments), [finance.investments])
  const history = React.useMemo(() => p.history.map((h) => ({ label: fmt.dayMonth.format(parseDate(h.date)), total: h.total })), [p, fmt])
  const gain = p.cost !== null ? p.costedValue - p.cost : null
  const up = gain === null || gain >= 0
  const config = React.useMemo(() => ({ total: { label: t.finance.value, color: up ? "var(--money-in)" : "var(--money-out)" } }) satisfies ChartConfig, [t, up])
  const last = p.history.at(-1)?.date

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-medium tracking-tight">
          <LandmarkIcon className="size-4" />
          {t.finance.investments}
        </CardTitle>
        <CardDescription>
          {t.finance.investmentsDescription}
          {last && ` · ${t.finance.asOf(fmt.long.format(parseDate(last)))}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {p.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.finance.noInvestments}</p>
        ) : (
          <div className="grid gap-6 @4xl:grid-cols-12">
            <div className="flex flex-col gap-5 @4xl:col-span-7">
              <div className="grid grid-cols-3 gap-4">
                <Stat label={t.finance.value} value={<Sensitive>{fmt.euro.format(p.total)}</Sensitive>} />
                <Stat label={t.finance.cash} value={<Sensitive>{fmt.euro.format(p.cash)}</Sensitive>} />
                {gain !== null && (
                  <Stat
                    label={t.finance.gain}
                    value={<Sensitive>{fmt.euro.format(gain)}</Sensitive>}
                    hint={p.cost ? <Sensitive>{fmt.percent.format(gain / p.cost)}</Sensitive> : undefined}
                    tone={gain < 0 ? "out" : "in"}
                  />
                )}
              </div>
              <ChartContainer config={config} className="aspect-auto h-44 w-full">
                <AreaChart data={history} margin={CHART_MARGIN}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  {!privacy && <ChartTooltip content={moneyTooltip(fmt, { total: t.finance.value }, { total: up ? "bg-money-in" : "bg-money-out" })} cursor={false} />}
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} minTickGap={12} />
                  <YAxis hide={privacy} tickLine={false} axisLine={false} tick={TICK} width={56} domain={["auto", "auto"]} tickFormatter={(v: number) => fmt.euroShort.format(v)} />
                  <Area dataKey="total" stroke="var(--color-total)" fill="var(--color-total)" fillOpacity={0.12} strokeWidth={2} type="monotone" />
                </AreaChart>
              </ChartContainer>
            </div>
            <div className="flex flex-col @4xl:col-span-5">
              <span className="mb-2 text-xs text-muted-foreground">{t.finance.holdings}</span>
              {p.holdings.map((h) => {
                const delta = h.cost !== null ? h.value - h.cost : null
                return (
                  <div key={`${h.broker}:${h.isin ?? h.name}`} className="flex items-center gap-3 border-b py-2.5 last:border-b-0">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{h.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {h.broker}
                        {h.isin && ` · ${h.isin}`}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end font-mono text-xs">
                      <Sensitive>{fmt.euro.format(h.value)}</Sensitive>
                      {delta !== null && (
                        <span className={cn(delta < 0 ? "text-money-out" : "text-money-in")}>
                          <Sensitive>
                            {delta >= 0 ? "+" : ""}
                            {fmt.euro.format(delta)}
                          </Sensitive>
                        </span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
