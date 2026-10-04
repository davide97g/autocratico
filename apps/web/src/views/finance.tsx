import * as React from "react"
import {
  addDays,
  addMonths,
  byCategory,
  futureByMonth,
  futureExpenses,
  type Granularity,
  GRANULARITIES,
  periodStart,
  portfolio,
  trend,
} from "@autocratico/core"
import { ChartLineIcon, LandmarkIcon, RadioIcon, RefreshCwIcon, SettingsIcon } from "lucide-react"
import { Area, AreaChart, Bar, BarChart, ComposedChart, Line, XAxis, YAxis } from "recharts"
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

const CHART_MARGIN = { left: 0, right: 0, top: 4, bottom: 0 }
const TICK = { fontSize: 10, fill: "var(--muted-foreground)" }
const FUTURE_MONTHS = 12
const PERIODS = ["month", "3m", "12m"] as const
type Period = (typeof PERIODS)[number]
/** Categories shown by name; the rest add up to "Other". */
const TOP_CATEGORIES = 7

function Toggle<T extends string>({ value, options, label, onChange, labels }: { value: T; options: readonly T[]; label: string; onChange: (v: T) => void; labels: Record<string, string> }) {
  return (
    <ToggleGroup value={[value]} onValueChange={(v) => v[0] && onChange(v[0] as T)} className="rounded-lg bg-muted p-1" aria-label={label}>
      {options.map((o) => (
        <ToggleGroupItem key={o} value={o} size="sm" className="rounded-md px-3 aria-pressed:bg-card">
          {labels[o]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function Stat({ label, value, hint, negative }: { label: string; value: React.ReactNode; hint?: React.ReactNode; negative?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-2xl font-medium tracking-tight", negative && "text-status-overdue")}>{value}</span>
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
  const mirror = finance.mirror
  return (
    <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-12">
      {mirror ? (
        <>
          <MonthCard finance={finance} onReload={onReload} className="@4xl:col-span-12" />
          <TrendCard finance={finance} className="@4xl:col-span-12" />
          <CategoriesCard finance={finance} className="@4xl:col-span-6" />
          <FutureCard data={data} finance={finance} onOpenDeadline={onOpenDeadline} className="@4xl:col-span-6" />
        </>
      ) : (
        <NotConnected onOpenSettings={onOpenSettings} className="@4xl:col-span-12" />
      )}
      <InvestmentsCard finance={finance} className="@4xl:col-span-12" />
    </div>
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

/** This month against the average of the twelve before, and the sync state. */
function MonthCard({ finance, onReload, className }: { finance: FinanceData; onReload: () => void; className?: string }) {
  const { t, fmt, locale } = useI18n()
  const [syncing, setSyncing] = React.useState(false)
  const mirror = finance.mirror!
  const today = finance.today
  const months = React.useMemo(() => trend(mirror.transactions, "month", `${addMonths(today, -12).slice(0, 7)}-01`, today), [mirror, today])
  const current = months.at(-1)!
  const past = months.slice(0, -1).filter((m) => m.expense || m.earning)
  const avg = (key: "expense" | "earning") => (past.length ? past.reduce((s, m) => s + m[key], 0) / past.length : 0)
  const saved = current.earning > 0 ? current.net / current.earning : null
  const synced = new Date(mirror.synced_at).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

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
        <CardTitle className="text-lg font-medium tracking-tight">{capitalize(fmt.monthYear.format(parseDate(today)))}</CardTitle>
        <CardDescription>{t.finance.syncedAt(synced)}</CardDescription>
        <CardAction className="flex items-center gap-2">
          <Badge variant={finance.live ? "secondary" : "outline"}>
            {finance.live && <RadioIcon data-icon="inline-start" />}
            {finance.live ? t.finance.live : t.finance.hourly}
          </Badge>
          <Button variant="ghost" size="icon-sm" onClick={sync} disabled={syncing} aria-label={t.finance.sync} title={t.finance.sync}>
            <RefreshCwIcon className={cn(syncing && "animate-spin")} />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-6 @2xl:grid-cols-4">
        <Stat label={t.finance.spent} value={<Sensitive>{fmt.euro.format(current.expense)}</Sensitive>} hint={<>{t.finance.average}: <Sensitive>{fmt.euro.format(avg("expense"))}</Sensitive></>} />
        <Stat label={t.finance.earned} value={<Sensitive>{fmt.euro.format(current.earning)}</Sensitive>} hint={<>{t.finance.average}: <Sensitive>{fmt.euro.format(avg("earning"))}</Sensitive></>} />
        <Stat
          label={t.finance.net}
          value={<Sensitive>{fmt.euro.format(current.net)}</Sensitive>}
          negative={current.net < 0}
        />
        <Stat label={t.finance.saved} value={saved === null ? "—" : <Sensitive>{fmt.percent.format(saved)}</Sensitive>} />
      </CardContent>
    </Card>
  )
}

/** Expenses and earnings per week, month or year, with the net as a line. */
function TrendCard({ finance, className }: { finance: FinanceData; className?: string }) {
  const { t, fmt } = useI18n()
  const { enabled: privacy } = usePrivacy()
  const [g, setG] = React.useState<Granularity>("month")
  const mirror = finance.mirror!
  const today = finance.today
  const bars = React.useMemo(() => {
    const first = mirror.transactions[0]?.date ?? today
    const from =
      g === "week" ? addDays(periodStart(today, "week"), -7 * 25) : g === "month" ? `${addMonths(today, -23).slice(0, 7)}-01` : periodStart(first < `${Number(today.slice(0, 4)) - 9}-01-01` ? `${Number(today.slice(0, 4)) - 9}-01-01` : first, "year")
    const label = (start: string) =>
      g === "week" ? fmt.dayMonth.format(parseDate(start)) : g === "month" ? capitalize(fmt.monthShortYear.format(parseDate(start))) : fmt.year.format(parseDate(start))
    return trend(mirror.transactions, g, from, today).map((b) => ({ label: label(b.start), expense: b.expense, earning: b.earning, net: b.net }))
  }, [mirror, today, g, fmt])
  const config = React.useMemo(
    () =>
      ({
        expense: { label: t.finance.expenses, color: "var(--foreground)" },
        earning: { label: t.finance.earnings, color: "var(--chart-2)" },
        net: { label: t.finance.net, color: "var(--status-done)" },
      }) satisfies ChartConfig,
    [t]
  )

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg font-medium tracking-tight">{t.finance.trend}</CardTitle>
        <CardDescription>{t.finance.trendDescription}</CardDescription>
        <CardAction className="@max-md:col-start-1 @max-md:row-span-1 @max-md:row-start-3 @max-md:mt-3 @max-md:justify-self-start">
          <Toggle value={g} options={GRANULARITIES} label={t.finance.trend} onChange={setG} labels={t.finance.granularity} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ChartContainer config={config} className="aspect-auto h-64 w-full">
          <ComposedChart data={bars} margin={CHART_MARGIN}>
            {!privacy && <ChartTooltip content={<ChartTooltipContent />} cursor={false} />}
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} minTickGap={12} />
            <Bar dataKey="expense" fill="var(--color-expense)" radius={[2, 2, 0, 0]} />
            <Bar dataKey="earning" fill="var(--color-earning)" radius={[2, 2, 0, 0]} />
            <Line dataKey="net" stroke="var(--color-net)" strokeWidth={2} dot={false} type="monotone" />
          </ComposedChart>
        </ChartContainer>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-xs bg-foreground" />
            {t.finance.expenses}
          </span>
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-xs bg-chart-2" />
            {t.finance.earnings}
          </span>
          <span className="flex items-center gap-2">
            <span className="h-0.5 w-3 rounded-full bg-status-done" />
            {t.finance.net}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

/** Where the money went in the period, biggest categories first. */
function CategoriesCard({ finance, className }: { finance: FinanceData; className?: string }) {
  const { t, fmt } = useI18n()
  const { enabled: privacy } = usePrivacy()
  const [period, setPeriod] = React.useState<Period>("month")
  const [budgetOnly, setBudgetOnly] = React.useState(false)
  const mirror = finance.mirror!
  const today = finance.today
  const rows = React.useMemo(() => {
    const month = `${today.slice(0, 7)}-01`
    const from = period === "month" ? month : addMonths(month, period === "3m" ? -2 : -11)
    const exclude = new Set(budgetOnly ? mirror.categories.filter((c) => c.excludeFromBudget).map((c) => c.id) : [])
    const names = new Map(mirror.categories.map((c) => [c.id, c.name]))
    const all = byCategory(mirror.transactions, from, today, exclude)
    const top = all.slice(0, TOP_CATEGORIES).map((c) => ({ name: names.get(c.category) ?? c.category, total: c.total }))
    const rest = all.slice(TOP_CATEGORIES).reduce((s, c) => s + c.total, 0)
    return rest > 0 ? [...top, { name: t.finance.other, total: Math.round(rest * 100) / 100 }] : top
  }, [mirror, today, period, budgetOnly, t])
  const total = rows.reduce((s, r) => s + r.total, 0)
  const config = React.useMemo(() => ({ total: { label: t.finance.expenses, color: "var(--foreground)" } }) satisfies ChartConfig, [t])

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg font-medium tracking-tight">{t.finance.categories}</CardTitle>
        <CardDescription>{t.finance.categoriesDescription}</CardDescription>
        <CardAction className="text-2xl font-medium tracking-tight">
          <Sensitive>{fmt.euro.format(total)}</Sensitive>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Toggle value={period} options={PERIODS} label={t.finance.categories} onChange={setPeriod} labels={t.finance.periods} />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={budgetOnly} onCheckedChange={setBudgetOnly} />
            {t.finance.excludeBudget}
          </label>
        </div>
        {rows.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">—</p>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-72 w-full">
            <BarChart data={rows} layout="vertical" margin={CHART_MARGIN}>
              {!privacy && <ChartTooltip content={<ChartTooltipContent hideLabel={false} />} cursor={false} />}
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={TICK} width={110} />
              <Bar dataKey="total" fill="var(--color-total)" radius={[0, 2, 2, 0]} />
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
        known: { label: t.finance.known, color: "var(--foreground)" },
        estimate: { label: t.finance.estimated, color: "var(--chart-3)" },
        finance: { label: t.finance.recurring, color: "var(--chart-2)" },
      }) satisfies ChartConfig,
    [t]
  )

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
        <ChartContainer config={config} className="aspect-auto h-28 w-full">
          <BarChart data={months} margin={CHART_MARGIN}>
            {!privacy && <ChartTooltip content={<ChartTooltipContent />} cursor={false} />}
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} interval={1} />
            <Bar dataKey="known" stackId="a" fill="var(--color-known)" />
            <Bar dataKey="estimate" stackId="a" fill="var(--color-estimate)" />
            <Bar dataKey="finance" stackId="a" fill="var(--color-finance)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ChartContainer>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-xs bg-foreground" />
            {t.finance.known}
          </span>
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-xs bg-chart-3" />
            {t.finance.estimated}
          </span>
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-xs bg-chart-2" />
            {t.finance.recurring}
          </span>
        </div>
        <div className="-mx-1 flex max-h-80 flex-col overflow-y-auto px-1">
          {items.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{t.finance.noFuture}</p>
          ) : (
            items.slice(0, 40).map((i) => {
              const row = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{i.label}</span>
                    <span className="block text-xs text-muted-foreground">{fmt.dayMonth.format(parseDate(i.date))}</span>
                  </span>
                  <Badge variant="outline">{t.finance.sources[i.source]}</Badge>
                  <span className="w-24 shrink-0 text-right font-mono text-xs">
                    {i.amount === null || i.basis === "unknown" ? "—" : <>{i.basis === "estimate" && "≈ "}<Sensitive>{fmt.euro.format(i.amount)}</Sensitive></>}
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
  const config = React.useMemo(() => ({ total: { label: t.finance.value, color: "var(--foreground)" } }) satisfies ChartConfig, [t])
  const gain = p.cost !== null ? p.costedValue - p.cost : null
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
                    negative={gain < 0}
                  />
                )}
              </div>
              <ChartContainer config={config} className="aspect-auto h-40 w-full">
                <AreaChart data={history} margin={CHART_MARGIN}>
                  {!privacy && <ChartTooltip content={<ChartTooltipContent />} cursor={false} />}
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} minTickGap={12} />
                  <Area dataKey="total" stroke="var(--color-total)" fill="var(--color-total)" fillOpacity={0.08} strokeWidth={2} type="monotone" />
                </AreaChart>
              </ChartContainer>
            </div>
            <div className="flex flex-col @4xl:col-span-5">
              <span className="mb-2 text-xs text-muted-foreground">{t.finance.holdings}</span>
              {p.holdings.map((h) => (
                <div key={`${h.broker}:${h.isin ?? h.name}`} className="flex items-center gap-3 border-b py-2.5 last:border-b-0">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{h.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {h.broker}
                      {h.isin && ` · ${h.isin}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-right font-mono text-xs">
                    <Sensitive>{fmt.euro.format(h.value)}</Sensitive>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
