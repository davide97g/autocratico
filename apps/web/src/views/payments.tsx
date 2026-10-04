import * as React from "react"
import { payments } from "@autocratico/core"
import { CircleHelpIcon, WalletIcon } from "lucide-react"
import { Bar, BarChart, XAxis } from "recharts"
import { cn } from "cn"

import { Amount } from "@/components/amount"
import { Sensitive, usePrivacy } from "@/components/privacy"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useI18n } from "@/i18n"
import type { Occurrence } from "@/lib/api"
import { capitalize, parseDate } from "@/lib/format"
import { level, STYLE } from "@/lib/status"

const CHART_MARGIN = { left: 0, right: 0, top: 4, bottom: 0 }
const TICK = { fontSize: 10, fill: "var(--muted-foreground)" }

/** Known and estimated amounts per month, from today's month to the window's last; overdue ones count now. */
function perMonth(items: Occurrence[], today: string, end: string, format: Intl.DateTimeFormat) {
  const first = parseDate(today)
  const last = parseDate(end)
  const count = (last.getFullYear() - first.getFullYear()) * 12 + last.getMonth() - first.getMonth() + 1
  return Array.from({ length: count }, (_, i) => {
    const m = new Date(first.getFullYear(), first.getMonth() + i, 1)
    const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`
    const inMonth = items.filter((o) => (o.date < today ? i === 0 : o.date.startsWith(key)))
    const sum = (basis: Occurrence["amount_basis"]) =>
      Math.round(inMonth.filter((o) => o.amount_basis === basis).reduce((s, o) => s + (o.amount ?? 0), 0) * 100) / 100
    return { month: capitalize(format.format(m)), known: sum("known"), estimated: sum("estimate") }
  })
}

/** Money left to pay in the next 3, 6 or 12 months: known amounts, estimates, and what has none yet. */
export function PaymentsCard({
  agenda,
  today,
  onOpen,
  className,
}: {
  agenda: Occurrence[]
  today: string
  onOpen: (key: string) => void
  className?: string
}) {
  const { t, fmt } = useI18n()
  const { enabled: privacy } = usePrivacy()
  const [months, setMonths] = React.useState("6")
  const p = React.useMemo(() => payments(agenda, today, Number(months)), [agenda, today, months])
  const bars = React.useMemo(() => perMonth(p.items, today, p.end, fmt.monthShort), [p, today, fmt])
  const config = React.useMemo(
    () =>
      ({
        known: { label: t.payments.known, color: "var(--foreground)" },
        estimated: { label: t.payments.estimated, color: "var(--chart-2)" },
      }) satisfies ChartConfig,
    [t]
  )
  const total = p.known + p.estimated

  return (
    // On wide screens the card takes the row's height without setting it: the calendar does, the list scrolls.
    <div className={cn("dark @4xl:relative @4xl:min-h-150", className)}>
      <Card className="h-full bg-background ring-0 @4xl:absolute @4xl:inset-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WalletIcon className="size-4" />
            {t.payments.title}
          </CardTitle>
          <CardDescription>{t.payments.description(Number(months))}</CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-6">
          <ToggleGroup
            value={[months]}
            onValueChange={(v) => v[0] && setMonths(v[0])}
            className="w-full rounded-lg bg-muted p-1"
            aria-label={t.overview.window}
          >
            {["3", "6", "12"].map((m) => (
              <ToggleGroupItem key={m} value={m} size="sm" className="flex-1 rounded-md px-2 aria-pressed:bg-card">
                {t.overview.months(Number(m))}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {/* Totals */}
          <div className="flex flex-col gap-4">
            <div className="text-5xl font-medium tracking-tight">
              {p.estimated > 0 && <span className="text-muted-foreground">≈ </span>}
              <Sensitive>{fmt.euro.format(total)}</Sensitive>
            </div>
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
              <span className="size-2.5 rounded-xs bg-foreground" />
              <div className="flex justify-between gap-3">
                <dt>{t.payments.known}</dt>
                <dd className="font-mono">
                  <Sensitive>{fmt.euro.format(p.known)}</Sensitive>
                </dd>
              </div>
              <span className="size-2.5 rounded-xs bg-chart-2" />
              <div className="flex justify-between gap-3">
                <dt>{t.payments.estimated}</dt>
                <dd className="font-mono">
                  ≈ <Sensitive>{fmt.euro.format(p.estimated)}</Sensitive>
                </dd>
              </div>
              {p.overdue > 0 && (
                <>
                  <span className={cn("size-2.5 rounded-full", STYLE.overdue.dot)} />
                  <div className="flex justify-between gap-3 text-muted-foreground">
                    <dt>{t.payments.overdue}</dt>
                    <dd className="font-mono">
                      <Sensitive>{fmt.euro.format(p.overdue)}</Sensitive>
                    </dd>
                  </div>
                </>
              )}
            </dl>
            {p.unknown > 0 && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <CircleHelpIcon className="size-4 shrink-0" />
                {t.payments.unknown(p.unknown)}
              </p>
            )}
          </div>

          {/* Per month */}
          <ChartContainer config={config} className="aspect-auto h-28 w-full">
            <BarChart data={bars} margin={CHART_MARGIN}>
              {!privacy && <ChartTooltip content={<ChartTooltipContent />} cursor={false} />}
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={TICK} interval={bars.length > 7 ? 1 : 0} />
              <Bar dataKey="known" stackId="a" fill="var(--color-known)" />
              <Bar dataKey="estimated" stackId="a" fill="var(--color-estimated)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ChartContainer>

          {/* The payments */}
          <div className="-mx-1 flex max-h-96 min-h-0 flex-1 flex-col overflow-y-auto px-1 @4xl:max-h-none">
            {p.items.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">{t.payments.none}</p>
            ) : (
              p.items.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => onOpen(o.key)}
                  className="flex shrink-0 items-center gap-3 border-b py-2.5 text-left outline-none last:border-b-0 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className={cn("h-7 w-1 shrink-0 rounded-full", STYLE[level(o)].dot)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{o.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      <Sensitive when={o.sensitive}>{fmt.dayMonth.format(parseDate(o.date))}</Sensitive>
                    </span>
                  </span>
                  <Amount o={o} className="shrink-0 text-right font-mono text-xs" />
                </button>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
