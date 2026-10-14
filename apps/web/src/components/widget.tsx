/**
 * Renders a widget spec (core/widgets.ts) with the app's own components: the catalog's only renderer,
 * shared by the Board and the previews in the chat. Numbers come from the register through the
 * widget's queries, never from the spec; amounts go through privacy mode like everywhere else.
 */
import * as React from "react"
import { ArrowRightIcon, CircleAlertIcon, CircleCheckIcon, InfoIcon, TriangleAlertIcon } from "lucide-react"
import { cn } from "cn"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts"
import {
  caseRows,
  deadlineRows,
  level,
  needsFinance,
  nextOccurrence,
  type SeriesQuery,
  type WidgetContext,
  type WidgetElement,
  type WidgetSpec,
  type WidgetValue,
  widgetSeries,
  widgetValue,
} from "@autocratico/core"

import { Amount } from "@/components/amount"
import { Markdown } from "@/components/markdown"
import { Sensitive, usePrivacy } from "@/components/privacy"
import { StatusBadge } from "@/components/status"
import { Button } from "@/components/ui/button"
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { useI18n } from "@/i18n"
import { useBoard } from "@/lib/board"
import { areaName, capitalize, parseDate } from "@/lib/format"
import { STYLE } from "@/lib/status"

type Fmt = ReturnType<typeof useI18n>["fmt"]
type Format = "money" | "number" | "percent" | "days"

const GRID: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 @sm:grid-cols-2",
  3: "grid-cols-1 @sm:grid-cols-2 @xl:grid-cols-3",
  4: "grid-cols-1 @sm:grid-cols-2 @xl:grid-cols-4",
}
const GAP = { sm: "gap-2", md: "gap-4", lg: "gap-6" } as const
const HEIGHT = { sm: "h-28", md: "h-44", lg: "h-64" } as const
const TONE = {
  info: { box: "bg-muted text-foreground", icon: InfoIcon },
  success: { box: "bg-status-done/12 text-status-done", icon: CircleCheckIcon },
  warning: { box: "bg-status-urgent/12 text-status-urgent", icon: TriangleAlertIcon },
  danger: { box: "bg-status-overdue/12 text-status-overdue", icon: CircleAlertIcon },
} as const
const DONUT = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]
const DONUT_DOT = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"]
const TICK = { fontSize: 11, fill: "var(--muted-foreground)" }

function formatted(n: number, format: Format | undefined, fmt: Fmt, t: ReturnType<typeof useI18n>["t"]) {
  if (format === "money") return fmt.euro.format(n)
  if (format === "percent") return fmt.percent.format(n > 1 ? n / 100 : n)
  if (format === "days") return t.board.days(n)
  return new Intl.NumberFormat().format(n)
}

/** A widget's content. `context` null: the register is still loading. */
export function WidgetView({ spec, className }: { spec: WidgetSpec; className?: string }) {
  const { context, wantFinance } = useBoard()
  const finance = React.useMemo(() => needsFinance(spec), [spec])
  React.useEffect(() => {
    if (finance) wantFinance()
  }, [finance, wantFinance])
  if (!context) return <div className={cn("h-24 animate-pulse rounded-lg bg-muted", className)} />
  return (
    <div className={cn("@container flex min-w-0 flex-col gap-4", className)}>
      <WidgetBoundary>
        <Element spec={spec} id={spec.root} ctx={context} />
      </WidgetBoundary>
    </div>
  )
}

/** A widget that fails to render (data of an unexpected shape) shows a line instead of breaking the page. */
class WidgetBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <Fallback /> : this.props.children
  }
}

function Fallback() {
  const { t } = useI18n()
  return <p className="text-sm text-muted-foreground">{t.board.noData}</p>
}

function Element({ spec, id, ctx }: { spec: WidgetSpec; id: string; ctx: WidgetContext }) {
  const el = spec.elements[id]
  if (!el) return null
  const children = el.children.map((c) => <Element key={c} spec={spec} id={c} ctx={ctx} />)
  return <Component el={el} ctx={ctx}>{children}</Component>
}

/** Props as the catalog declares them (already checked by the schema). */
function Component({ el, ctx, children }: { el: WidgetElement; ctx: WidgetContext; children: React.ReactNode }) {
  const p = el.props as Record<string, never>
  switch (el.type) {
    case "Grid":
      return <div className={cn("grid gap-4", GRID[(p.columns as number | undefined) ?? 2])}>{children}</div>
    case "Stack": {
      const row = p.direction === "row"
      return <div className={cn("flex min-w-0", row ? "flex-row flex-wrap items-center" : "flex-col", GAP[(p.gap as keyof typeof GAP | undefined) ?? "md"])}>{children}</div>
    }
    case "Section":
      return (
        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h4 className="text-sm font-medium">{p.title}</h4>
            {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
          </div>
          {children}
        </section>
      )
    case "Heading":
      return <h4 className="text-base font-medium tracking-tight">{p.text}</h4>
    case "Text":
      return <Markdown text={p.text} className={cn("max-w-none [&>:first-child]:mt-0 [&>:last-child]:mb-0", p.muted && "text-muted-foreground")} />
    case "Callout":
      return <Callout tone={p.tone} title={p.title} text={p.text} />
    case "Separator":
      return <Separator />
    case "Metric":
      return <Metric label={p.label} value={p.value} format={p.format} hint={p.hint} ctx={ctx} />
    case "Progress":
      return <ProgressBar label={p.label} value={p.value} max={p.max} format={p.format} ctx={ctx} />
    case "Chart":
      return <Chart kind={p.kind} series={p.series} height={p.height} cumulative={p.cumulative} ctx={ctx} />
    case "Deadlines":
      return <DeadlineList query={p.query} limit={p.limit} empty={p.empty} ctx={ctx} />
    case "Cases":
      return <CaseList query={p.query} limit={p.limit} ctx={ctx} />
    case "Countdown":
      return <Countdown deadline={p.deadline} label={p.label} ctx={ctx} />
    case "Button":
      return <ActionButton label={p.label} action={p.action} />
  }
}

function Callout({ tone, title, text }: { tone: keyof typeof TONE; title?: string; text: string }) {
  const { box, icon: Icon } = TONE[tone]
  return (
    <div className={cn("flex gap-2.5 rounded-lg p-3", box)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="flex min-w-0 flex-col gap-0.5">
        {title && <p className="text-sm font-medium">{title}</p>}
        <Markdown text={text} className="max-w-none text-foreground [&>:first-child]:mt-0 [&>:last-child]:mb-0" />
      </div>
    </div>
  )
}

function Metric({ label, value, format, hint, ctx }: { label: string; value: WidgetValue; format?: Format; hint?: string; ctx: WidgetContext }) {
  const { t, fmt } = useI18n()
  const n = widgetValue(value, ctx)
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-3xl font-medium tracking-tight tabular-nums">
        {n === null ? "—" : <Sensitive when={format === "money"}>{formatted(n, format, fmt, t)}</Sensitive>}
      </span>
      {(n === null || hint) && <span className="text-xs text-muted-foreground">{n === null ? t.board.noFinance : hint}</span>}
    </div>
  )
}

function ProgressBar({ label, value, max, format, ctx }: { label: string; value: WidgetValue; max: WidgetValue; format?: Format; ctx: WidgetContext }) {
  const { t, fmt } = useI18n()
  const v = widgetValue(value, ctx)
  const m = widgetValue(max, ctx)
  if (v === null || m === null) return <p className="text-sm text-muted-foreground">{t.board.noFinance}</p>
  const money = format === "money"
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          <Sensitive when={money}>{formatted(v, format, fmt, t)}</Sensitive> / <Sensitive when={money}>{formatted(m, format, fmt, t)}</Sensitive>
        </span>
      </div>
      <Progress value={m > 0 ? Math.min(100, (v / m) * 100) : 0} />
    </div>
  )
}

function Chart({ kind, series, height, cumulative, ctx }: { kind: "bar" | "line" | "area" | "donut"; series: SeriesQuery; height?: keyof typeof HEIGHT; cumulative?: boolean; ctx: WidgetContext }) {
  const { t, fmt } = useI18n()
  const { enabled: privacy } = usePrivacy()
  const points = React.useMemo(() => widgetSeries(series, ctx, cumulative), [series, ctx, cumulative])
  const money = series.measure !== "count" && series.from !== "cases"
  const label = React.useCallback(
    (key: string) => {
      if (series.by === "month") return capitalize(fmt.monthShort.format(parseDate(key)))
      if (series.by === "week" || series.by === "date") return fmt.dayMonth.format(parseDate(key))
      if (series.by === "area") return areaName(t, key)
      if (series.by === "status") return t.status[key as keyof typeof t.status] ?? key
      if (series.by === "severity") return t.severity[key as keyof typeof t.severity] ?? key
      return key
    },
    [series.by, fmt, t]
  )
  const rows = React.useMemo(() => (points ?? []).map((p) => ({ ...p, label: label(p.key) })), [points, label])
  const config = React.useMemo(() => ({ value: { label: money ? t.payments.title : "#", color: money ? "var(--money-out)" : "var(--chart-2)" } }) satisfies ChartConfig, [money, t])
  if (points === null) return <p className="text-sm text-muted-foreground">{t.board.noFinance}</p>
  if (!rows.length || rows.every((r) => r.value === 0)) return <p className="text-sm text-muted-foreground">{t.board.noData}</p>
  const value = (v: unknown) => (money ? fmt.euro.format(Number(v)) : String(v))
  const tooltip = !privacy && (
    <ChartTooltip
      cursor={kind === "bar" ? { fill: "var(--muted)", opacity: 0.5 } : true}
      content={<ChartTooltipContent hideIndicator formatter={(v, _n, item) => <span className="font-mono tabular-nums">{(item.payload as { label: string }).label}: {value(v)}</span>} />}
    />
  )
  const axes = (
    <>
      <CartesianGrid vertical={false} strokeDasharray="3 3" />
      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} minTickGap={8} />
      <YAxis hide={privacy && money} tickLine={false} axisLine={false} tick={TICK} width={money ? 52 : 28} tickFormatter={(v: number) => (money ? fmt.euroShort.format(v) : String(v))} />
    </>
  )
  const box = cn("aspect-auto w-full", HEIGHT[height ?? "md"])
  if (kind === "donut") {
    return (
      <div className="flex flex-col gap-3 @sm:flex-row @sm:items-center">
        <ChartContainer config={config} className={cn(box, "@sm:w-1/2")}>
          <PieChart>
            {tooltip}
            <Pie data={rows} dataKey="value" nameKey="label" innerRadius="58%" outerRadius="95%" strokeWidth={2} stroke="var(--card)">
              {rows.map((r, i) => (
                <Cell key={r.key} fill={DONUT[i % DONUT.length]} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <ul className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
          {rows.slice(0, 8).map((r, i) => (
            <li key={r.key} className="flex items-center gap-2">
              <span className={cn("size-2.5 shrink-0 rounded-xs", DONUT_DOT[i % DONUT_DOT.length])} />
              <span className="min-w-0 flex-1 truncate">{r.label}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                <Sensitive when={money}>{value(r.value)}</Sensitive>
              </span>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  return (
    <ChartContainer config={config} className={box}>
      {kind === "bar" ? (
        <BarChart data={rows} margin={{ left: 0, right: 0, top: 8, bottom: 0 }} barCategoryGap="18%">
          {axes}
          {tooltip}
          <Bar dataKey="value" fill="var(--color-value)" radius={[3, 3, 0, 0]} maxBarSize={32} />
        </BarChart>
      ) : kind === "line" ? (
        <LineChart data={rows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          {axes}
          {tooltip}
          <Line dataKey="value" stroke="var(--color-value)" strokeWidth={1.5} dot={{ r: 2.5, fill: "var(--color-value)" }} type="linear" />
        </LineChart>
      ) : (
        <AreaChart data={rows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          {axes}
          {tooltip}
          <Area dataKey="value" stroke="var(--color-value)" fill="var(--color-value)" fillOpacity={0.15} strokeWidth={1.5} type="monotone" />
        </AreaChart>
      )}
    </ChartContainer>
  )
}

function DeadlineList({ query, limit, empty, ctx }: { query: Parameters<typeof deadlineRows>[0]; limit?: number; empty?: string; ctx: WidgetContext }) {
  const { t, fmt } = useI18n()
  const rows = deadlineRows(query, ctx)
  const shown = rows.slice(0, limit ?? 8)
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty ?? t.board.noData}</p>
  return (
    <ul className="-mx-2 flex flex-col">
      {shown.map((o) => (
        <li key={o.key}>
          <a
            href={`#deadline/${encodeURIComponent(o.key)}`}
            className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className={cn("size-2 shrink-0 rounded-full", STYLE[level(o)].dot)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{o.title}</span>
              <span className="block text-xs text-muted-foreground">
                <Sensitive when={o.sensitive}>{(o.date.slice(0, 4) === ctx.data.today.slice(0, 4) ? fmt.dayMonth : fmt.long).format(parseDate(o.date))}</Sensitive> · {areaName(t, o.area)}
              </span>
            </span>
            <Amount o={o} className="shrink-0 text-sm tabular-nums" />
          </a>
        </li>
      ))}
      {rows.length > shown.length && <li className="px-2 pt-1 text-xs text-muted-foreground">{t.board.more(rows.length - shown.length)}</li>}
    </ul>
  )
}

function CaseList({ query, limit, ctx }: { query?: Parameters<typeof caseRows>[0]; limit?: number; ctx: WidgetContext }) {
  const { t } = useI18n()
  const { act } = useBoard()
  const rows = caseRows(query, ctx).slice(0, limit ?? 6)
  if (!rows.length) return <p className="text-sm text-muted-foreground">{t.board.noData}</p>
  return (
    <ul className="-mx-2 flex flex-col">
      {rows.map((c) => (
        <li key={c.slug}>
          <button
            type="button"
            onClick={() => act({ type: "case", slug: c.slug })}
            className="flex w-full flex-col gap-1.5 rounded-md px-2 py-2 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm">{c.title}</span>
              {c.total > 0 && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{t.board.tasks(c.done, c.total)}</span>}
            </span>
            {c.status && <span className="truncate text-xs text-muted-foreground">{c.status}</span>}
            {c.total > 0 && <Progress value={(c.done / c.total) * 100} />}
          </button>
        </li>
      ))}
    </ul>
  )
}

function Countdown({ deadline, label, ctx }: { deadline: string; label?: string; ctx: WidgetContext }) {
  const { t, fmt } = useI18n()
  const o = nextOccurrence(deadline, ctx)
  if (!o) return <p className="text-sm text-muted-foreground">{t.board.unknownDeadline(deadline)}</p>
  const l = level(o)
  return (
    <a
      href={`#deadline/${encodeURIComponent(o.key)}`}
      className="flex min-w-0 flex-col gap-1 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="truncate text-xs text-muted-foreground">{label ?? o.title}</span>
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={cn("text-3xl font-medium tracking-tight tabular-nums", l === "overdue" && "text-status-overdue", l === "urgent" && "text-status-urgent")}>
          {Math.abs(o.days)}
        </span>
        <span className="text-sm text-muted-foreground">{t.board.daysUnit(o.days)}</span>
        <StatusBadge level={l} />
      </span>
      <span className="text-xs text-muted-foreground">
        <Sensitive when={o.sensitive}>{fmt.long.format(parseDate(o.date))}</Sensitive>
        {o.amount_basis !== null && (
          <>
            {" · "}
            <Amount o={o} />
          </>
        )}
      </span>
    </a>
  )
}

function ActionButton({ label, action }: { label: string; action: Parameters<ReturnType<typeof useBoard>["act"]>[0] }) {
  const { act } = useBoard()
  return (
    <Button variant="secondary" size="sm" className="self-start" onClick={() => act(action)}>
      {label}
      <ArrowRightIcon data-icon="inline-end" />
    </Button>
  )
}
