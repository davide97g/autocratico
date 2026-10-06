/**
 * The Claude subscription at a glance. Each limit window is drawn as a burn-up chart: time across, usage up.
 * The dashed diagonal is an even pace that spends exactly 100% by the reset, so a line above it is running
 * hot; the dotted tail is where the current rate leads. The sidebar shows the same windows as two slim meters.
 */
import * as React from "react"
import { cn } from "cn"
import { type Pace, type PaceState, pace, type Usage, type UsageLimits, worstPace } from "@autocratico/core"

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useI18n } from "@/i18n"
import { usage as loadUsage, type UsageRun } from "@/lib/api"
import { useLiveRefresh } from "@/lib/events"
import { duration, humanize } from "@/lib/format"
import { unlessChanged } from "@/lib/utils"

const HOUR = 3_600_000
const DAY = 24 * HOUR

const FILL: Record<PaceState, string> = {
  calm: "bg-primary",
  warm: "bg-status-soon",
  hot: "bg-status-urgent",
  limit: "bg-status-overdue",
  reset: "bg-status-done",
}
const TEXT: Record<PaceState, string> = {
  calm: "text-primary",
  warm: "text-status-soon",
  hot: "text-status-urgent",
  limit: "text-status-overdue",
  reset: "text-status-done",
}

/** The subscription's numbers, read again when an agent run reports new ones. */
export function useUsage() {
  const [usage, setUsage] = React.useState<Usage | null>(null)
  const [failed, setFailed] = React.useState(false)
  const refresh = React.useCallback(() => {
    loadUsage().then(
      (u) => {
        setUsage(unlessChanged(u))
        setFailed(false)
      },
      () => setFailed(true)
    )
  }, [])
  React.useEffect(refresh, [refresh])
  useLiveRefresh("usage", refresh, 60_000)
  return { usage, failed }
}

/** Countdowns move by the minute. */
function useClock(ms = 30_000) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return now
}

function paces(limits: UsageLimits | null, now: number): Pace[] {
  if (!limits) return []
  return limits.windows.flatMap((w) => pace(w, limits.at, now, limits.status === "rejected") ?? [])
}

function useFormat() {
  const { t, locale } = useI18n()
  const loc = locale === "it" ? "it-IT" : "en-GB"
  return React.useMemo(() => {
    const u = t.usage.units
    const span = (ms: number) => {
      const m = Math.max(1, Math.round(ms / 60_000))
      const d = Math.floor(m / 1440)
      const h = Math.floor((m % 1440) / 60)
      if (d) return h ? `${d} ${u.d} ${h} ${u.h}` : `${d} ${u.d}`
      if (h) return m % 60 ? `${h} ${u.h} ${m % 60} ${u.m}` : `${h} ${u.h}`
      return `${m} ${u.m}`
    }
    const time = new Intl.DateTimeFormat(loc, { hour: "2-digit", minute: "2-digit" })
    const dayTime = new Intl.DateTimeFormat(loc, { weekday: "short", hour: "2-digit", minute: "2-digit" })
    return {
      span,
      /** 15:00 today, "fri 15:00" further away. */
      at: (ms: number, now: number) => (ms - now < 20 * HOUR ? time.format(ms) : dayTime.format(ms)),
      hour: (ms: number) => time.format(ms),
      weekday: (ms: number) => new Intl.DateTimeFormat(loc, { weekday: "short" }).format(ms),
      percent: (v: number) => `${Math.round(v * 100)}%`,
      usd: (v: number) => new Intl.NumberFormat(loc, { style: "currency", currency: "USD", maximumFractionDigits: v < 10 ? 2 : 0 }).format(v),
      compact: (v: number) => new Intl.NumberFormat(loc, { notation: "compact", maximumFractionDigits: 1 }).format(v),
    }
  }, [loc, t])
}

function paceSentence(p: Pace, now: number, t: ReturnType<typeof useI18n>["t"], f: ReturnType<typeof useFormat>) {
  if (p.state === "reset") return t.usage.pace.reset(f.at(p.start, now))
  if (p.state === "limit") return t.usage.pace.limit(f.at(p.reset, now))
  if (p.state === "hot" && p.limitAt) return t.usage.pace.hot(f.at(p.limitAt, now), f.span(p.reset - p.limitAt))
  const projected = f.percent(Math.min(p.projected, 1))
  return p.state === "warm" ? t.usage.pace.warm(projected) : t.usage.pace.calm(projected)
}

const windowName = (t: ReturnType<typeof useI18n>["t"], id: string) => t.usage.windows[id] ?? humanize(id)

// ---------- the burn-up chart of one window ----------

/** SVG units: 100 wide, 40 high; 100% usage sits a little under the top so the limit line shows. */
const W = 100
const H = 40
const TOP = 4
const y = (u: number) => H - Math.min(u, 1.1) * (H - TOP)

function Burnup({ p, usage, now, label }: { p: Pace; usage: Usage; now: number; label: string }) {
  const f = useFormat()
  const x = (ms: number) => Math.min(W, Math.max(0, ((ms - p.start) / p.length) * W))
  const measured = usage.limits ? Date.parse(usage.limits.at) : p.start

  // The window's history: from zero at its start, through each reading, to the latest one.
  const points: [number, number][] = [[0, y(0)]]
  if (p.state !== "reset") {
    for (const s of usage.samples) {
      const at = Date.parse(s.at)
      const v = s.windows[p.id]
      if (v !== undefined && at > p.start && at < measured) points.push([x(at), y(v)])
    }
    points.push([x(measured), y(p.used)])
  }
  const line = points.map(([px, py]) => `${px},${py}`).join(" ")
  const last = points.at(-1)!
  const area = `M0,${H} L${line.replaceAll(" ", " L")} L${last[0]},${H} Z`
  const end = p.limitAt && p.state === "hot" ? ([x(p.limitAt), y(1)] as const) : ([W, y(p.projected)] as const)
  const ticks = p.length > DAY ? 7 : Math.round(p.length / HOUR)

  return (
    <figure className="flex flex-col gap-1.5" aria-label={label}>
      <div className={cn("relative h-20 rounded-md bg-muted/60", TEXT[p.state])}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
          {/* Time already gone in the window. */}
          <rect x={0} y={0} width={x(now)} height={H} className="fill-foreground/4" />
          {Array.from({ length: ticks - 1 }, (_, i) => (
            <line key={i} x1={((i + 1) / ticks) * W} x2={((i + 1) / ticks) * W} y1={0} y2={H} className="stroke-background" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <line x1={0} x2={W} y1={y(1)} y2={y(1)} className="stroke-status-overdue/40" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <line x1={0} y1={H} x2={W} y2={y(1)} className="stroke-muted-foreground/45" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          {p.state !== "reset" && (
            <>
              <path d={area} fill="currentColor" fillOpacity={0.14} />
              <polyline points={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              {p.state !== "limit" && (
                <line x1={last[0]} y1={last[1]} x2={end[0]} y2={end[1]} stroke="currentColor" strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="1 3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              )}
            </>
          )}
        </svg>
        {/* Round marks live outside the stretched SVG so they stay round. */}
        <span
          className="absolute inset-y-0 w-px bg-foreground/70 transition-[left] duration-700 ease-out-expo motion-reduce:transition-none"
          style={{ left: `${x(now)}%` }}
          aria-hidden
        >
          <span className="absolute -top-0.5 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-foreground" />
        </span>
        {p.state !== "reset" && (
          <span
            className={cn("absolute size-2.5 -translate-1/2 rounded-full ring-2 ring-card", FILL[p.state])}
            style={{ left: `${last[0]}%`, top: `${(last[1] / H) * 100}%` }}
            aria-hidden
          />
        )}
        {p.state === "hot" && p.limitAt && (
          <span
            className="absolute size-2 -translate-1/2 rotate-45 rounded-xs bg-status-overdue ring-2 ring-card"
            style={{ left: `${end[0]}%`, top: `${(end[1] / H) * 100}%` }}
            title={f.at(p.limitAt, now)}
            aria-hidden
          />
        )}
      </div>
      <div className="relative h-4 font-mono text-[0.65rem] text-muted-foreground tabular-nums" aria-hidden>
        {p.length > DAY
          ? Array.from({ length: 7 }, (_, i) => (
              <span key={i} className="absolute -translate-x-1/2" style={{ left: `${((i + 0.5) / 7) * 100}%` }}>
                {f.weekday(p.start + i * DAY + DAY / 2)}
              </span>
            ))
          : Array.from({ length: ticks + 1 }, (_, i) => (
              <span
                key={i}
                className={cn("absolute", i === 0 ? "" : i === ticks ? "-translate-x-full" : "-translate-x-1/2", i % 2 && i !== ticks && ticks > 4 && "max-sm:hidden")}
                style={{ left: `${(i / ticks) * 100}%` }}
              >
                {f.hour(p.start + i * HOUR)}
              </span>
            ))}
      </div>
    </figure>
  )
}

function WindowLane({ p, usage, now }: { p: Pace; usage: Usage; now: number }) {
  const { t } = useI18n()
  const f = useFormat()
  const name = windowName(t, p.id)
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium">{name}</span>
          <span className="text-xs text-muted-foreground">{t.usage.resetsIn(f.span(p.reset - now), f.at(p.reset, now))}</span>
        </div>
        <span className="flex items-baseline gap-1">
          <span className={cn("text-3xl font-semibold tracking-tight tabular-nums", p.state !== "calm" && p.state !== "reset" && TEXT[p.state])}>
            {Math.round(p.used * 100)}
          </span>
          <span className="text-sm text-muted-foreground">% {t.usage.used}</span>
        </span>
      </div>
      <Burnup p={p} usage={usage} now={now} label={name} />
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", FILL[p.state])} aria-hidden />
        {paceSentence(p, now, t, f)}
      </p>
    </section>
  )
}

function Legend() {
  const { t } = useI18n()
  const item = "flex items-center gap-1.5"
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem] text-muted-foreground" aria-hidden>
      <span className={item}>
        <span className="h-0.5 w-4 rounded-full bg-primary" />
        {t.usage.legend.used}
      </span>
      <span className={item}>
        <span className="w-4 border-t border-dashed border-muted-foreground/70" />
        {t.usage.legend.even}
      </span>
      <span className={item}>
        <span className="w-4 border-t-2 border-dotted border-primary/70" />
        {t.usage.legend.projection}
      </span>
      <span className={item}>
        <span className="h-3 w-px bg-foreground/70" />
        {t.usage.legend.now}
      </span>
    </div>
  )
}

function StateChip({ state }: { state: PaceState }) {
  const { t } = useI18n()
  return (
    <span className="flex items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-xs font-medium whitespace-nowrap">
      <span className="relative flex size-2">
        {(state === "hot" || state === "limit") && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-70 motion-reduce:hidden", FILL[state])} />}
        <span className={cn("relative size-2 rounded-full", FILL[state])} />
      </span>
      {t.usage.states[state]}
    </span>
  )
}

// ---------- the agent's week ----------

const HEAT = ["bg-muted", "bg-foreground/15", "bg-foreground/35", "bg-foreground/60", "bg-foreground/85"]
const SPLIT = ["bg-foreground/85", "bg-foreground/55", "bg-foreground/30", "bg-foreground/15"]

function localDay(ms: number) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function Week({ runs, now }: { runs: UsageRun[]; now: number }) {
  const { t } = useI18n()
  const f = useFormat()

  const days = React.useMemo(() => {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() - 6 + i)
      return d.getTime()
    })
  }, [now])

  const cells = React.useMemo(() => {
    const grid = new Map<string, { runs: number; cost: number }>()
    for (const r of runs) {
      const at = Date.parse(r.at)
      const key = `${localDay(at)}@${new Date(at).getHours()}`
      const c = grid.get(key) ?? { runs: 0, cost: 0 }
      c.runs += 1
      c.cost += r.cost ?? 0
      grid.set(key, c)
    }
    return grid
  }, [runs])
  const weight = (c: { runs: number; cost: number }) => c.cost || c.runs / 100
  const max = Math.max(0, ...[...cells.values()].map(weight))

  if (!runs.length) return <p className="text-sm text-muted-foreground">{t.usage.noRuns}</p>

  const cost = runs.reduce((s, r) => s + (r.cost ?? 0), 0)
  const input = runs.reduce((s, r) => s + r.input, 0)
  const output = runs.reduce((s, r) => s + r.output, 0)
  const cache = runs.reduce((s, r) => s + r.cache_read + r.cache_write, 0)
  const timed = runs.filter((r) => r.duration_ms !== null)
  const average = timed.length ? timed.reduce((s, r) => s + (r.duration_ms ?? 0), 0) / timed.length : null
  const failed = runs.filter((r) => r.error).length
  const counts = new Map<string, number>()
  for (const r of runs) counts.set(r.source, (counts.get(r.source) ?? 0) + 1)
  const bySource = [...counts].map(([source, n]) => ({ source, n })).sort((a, b) => b.n - a.n)
  const nowHour = new Date(now).getHours()

  const stats = [
    { label: t.usage.requests, value: String(runs.length), hint: failed ? t.usage.failed(failed) : null },
    { label: t.usage.tokens, value: f.compact(input + output + cache), hint: t.usage.tokensHint(f.compact(input), f.compact(output), f.compact(cache)) },
    { label: t.usage.value, value: f.usd(cost), hint: t.usage.valueHint },
    { label: t.usage.average, value: average === null ? "—" : duration(average), hint: null },
  ]

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-2 @sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5 rounded-lg bg-muted/50 p-3" title={s.hint ?? undefined}>
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="text-lg font-semibold tracking-tight tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2">
        <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          {bySource.map((s, i) => (
            <span key={s.source} className={cn("h-full border-r-2 border-card last:border-r-0", SPLIT[i % SPLIT.length])} style={{ width: `${(s.n / runs.length) * 100}%` }} />
          ))}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {bySource.map((s, i) => (
            <li key={s.source} className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-xs", SPLIT[i % SPLIT.length])} />
              {t.usage.sources[s.source] ?? s.source}
              <span className="text-foreground tabular-nums">{s.n}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium">{t.usage.when}</span>
          <span className="text-xs text-muted-foreground">{t.usage.whenHint}</span>
        </div>
        <div className="flex flex-col gap-0.5" role="img" aria-label={t.usage.when}>
          {days.map((day, row) => (
            <div key={day} className="flex items-center gap-2">
              <span className="w-7 shrink-0 font-mono text-[0.65rem] text-muted-foreground">{f.weekday(day)}</span>
              <div className="grid flex-1 grid-cols-24 gap-0.5">
                {Array.from({ length: 24 }, (_, hour) => {
                  const c = cells.get(`${localDay(day)}@${hour}`)
                  const future = row === 6 && hour > nowHour
                  const level = c && max ? Math.max(1, Math.ceil((weight(c) / max) * 4)) : 0
                  return (
                    <span
                      key={hour}
                      title={c ? t.usage.cell(f.weekday(day), hour, c.runs, f.usd(c.cost)) : undefined}
                      className={cn(
                        "aspect-square rounded-xs",
                        future ? "bg-muted/40" : HEAT[level],
                        row === 6 && hour === nowHour && "ring-1 ring-foreground/60"
                      )}
                    />
                  )
                })}
              </div>
            </div>
          ))}
          <div className="flex gap-2 pt-0.5" aria-hidden>
            <span className="w-7 shrink-0" />
            <div className="grid flex-1 grid-cols-4 font-mono text-[0.65rem] text-muted-foreground tabular-nums">
              {[0, 6, 12, 18].map((h) => (
                <span key={h}>{String(h).padStart(2, "0")}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- Settings card ----------

export function UsageCard() {
  const { t } = useI18n()
  const f = useFormat()
  const { usage, failed } = useUsage()
  const now = useClock()
  const list = paces(usage?.limits ?? null, now)
  const limits = usage?.limits ?? null
  const ago = limits ? now - Date.parse(limits.at) : 0

  return (
    <Card id="usage" className="@container rounded-xl">
      <CardHeader>
        <CardTitle className="text-lg font-medium tracking-tight">{t.usage.title}</CardTitle>
        <CardDescription>{t.usage.description}</CardDescription>
        {list.length > 0 && (
          <CardAction>
            <StateChip state={worstPace(list)} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {!usage && !failed && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}
        {usage && !list.length && <p className="text-sm text-muted-foreground">{t.usage.empty}</p>}
        {usage && list.length > 0 && (
          <>
            {list.map((p) => (
              <WindowLane key={p.id} p={p} usage={usage} now={now} />
            ))}
            <div className="flex flex-col gap-2">
              <Legend />
              <p className="text-xs text-muted-foreground">
                {ago < 60_000 ? t.usage.justNow : t.usage.measured(f.span(ago))}
                {limits?.overage.using && ` ${t.usage.overage}`}
              </p>
            </div>
          </>
        )}
        {usage && (
          <>
            <Separator />
            <div className="flex flex-col gap-4">
              <span className="text-sm font-medium">{t.usage.week}</span>
              <Week runs={usage.runs} now={now} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- sidebar meter ----------

/** Two slim meters for the sidebar's Claude panel: the fill is usage, the tick is time gone by in the window. */
export function UsageMeter({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n()
  const f = useFormat()
  const { usage } = useUsage()
  const now = useClock()
  const list = paces(usage?.limits ?? null, now).slice(0, 2)
  if (!list.length) return null
  const summary = list.map((p) => `${windowName(t, p.id)}: ${f.percent(p.used)} · ${paceSentence(p, now, t, f)}`).join("\n")
  return (
    <button
      type="button"
      onClick={onOpen}
      title={summary}
      aria-label={`${t.usage.open}. ${summary}`}
      className="group/usage relative -mx-1 flex flex-col gap-1.5 rounded-md p-1 text-left outline-none transition-colors hover:bg-primary-foreground/8 focus-visible:ring-2 focus-visible:ring-primary-foreground/50"
    >
      {list.map((p) => (
        <span key={p.id} className="flex items-center gap-2 font-mono text-[0.65rem] text-primary-foreground/60 tabular-nums">
          <span className="w-7 shrink-0">{t.usage.short[p.id] ?? p.id.slice(0, 3)}</span>
          <span className="relative h-1.5 flex-1 rounded-full bg-primary-foreground/15">
            <span
              className={cn(
                "absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out-expo motion-reduce:transition-none",
                p.state === "calm" || p.state === "reset" ? "bg-primary-foreground" : FILL[p.state]
              )}
              style={{ width: `${Math.min(p.used, 1) * 100}%` }}
            />
            {/* Time gone by in the window, on the same scale: a fill past this tick is running hot. */}
            <span
              className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-primary-foreground/80 ring-1 ring-primary"
              style={{ left: `${p.elapsed * 100}%` }}
              aria-hidden
            />
          </span>
          <span className={cn("w-8 text-right", p.state !== "calm" && p.state !== "reset" ? "text-primary-foreground" : "")}>{f.percent(p.used)}</span>
        </span>
      ))}
    </button>
  )
}
