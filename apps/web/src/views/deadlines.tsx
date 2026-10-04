import * as React from "react"
import {
  CheckIcon,
  ChevronDownIcon,
  FolderOpenIcon,
  Maximize2Icon,
  SparklesIcon,
  Undo2Icon,
} from "lucide-react"
import { cn } from "cn"

import { Sensitive } from "@/components/privacy"
import { SourcePreview } from "@/components/source"
import { SeverityIcon, StatusBadge, StatusLegend } from "@/components/status"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useI18n } from "@/i18n"
import { type Data, type Occurrence } from "@/lib/api"
import { areaIcon, areaName, capitalize, parseDate } from "@/lib/format"
import { level, STYLE } from "@/lib/status"

const ALL = "*"

export const Deadlines = React.memo(function Deadlines({
  data,
  search,
  onDone,
  onOpenCase,
  onOpen,
  onAsk,
}: {
  data: Data
  search: string
  onDone: (o: Occurrence, done: boolean) => void
  onOpenCase: (slug: string) => void
  /** Opens the occurrence on a page of its own. */
  onOpen: (key: string) => void
  /** Opens the chat about the occurrence. */
  onAsk: (o: Occurrence) => void
}) {
  const { t, fmt } = useI18n()
  const [filter, setFilter] = React.useState(ALL)
  const [showDone, setShowDone] = React.useState(false)
  const { agenda, incomplete } = data
  const areas = [...new Set([...agenda, ...incomplete].map((o) => o.area))]
  const q = search.trim().toLowerCase()

  const items = agenda.filter(
    (o) =>
      (filter === ALL || o.area === filter) &&
      (showDone || !o.done_on) &&
      (!q || `${o.title} ${o.notes}`.toLowerCase().includes(q))
  )
  const months = new Map<string, Occurrence[]>()
  for (const o of items) {
    const k = o.date.slice(0, 7)
    months.set(k, [...(months.get(k) ?? []), o])
  }
  const missing = incomplete.filter(
    (o) =>
      (filter === ALL || o.area === filter) &&
      (!q || o.title.toLowerCase().includes(q))
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          value={[filter]}
          onValueChange={(v) => v[0] && setFilter(v[0])}
          className="no-scrollbar max-w-full overflow-x-auto rounded-lg bg-card p-1 @lg:flex-wrap"
          aria-label={t.deadlines.filter}
        >
          <ToggleGroupItem value={ALL} className="rounded-md px-4">
            {t.deadlines.all}
          </ToggleGroupItem>
          {areas.map((a) => (
            <ToggleGroupItem key={a} value={a} className="rounded-md px-4">
              {areaName(t, a)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <StatusLegend className="ml-auto" />
        <label className="flex h-11 items-center gap-2 text-sm text-muted-foreground">
          {/* On the page background the default track (input) would not show. */}
          <Switch
            checked={showDone}
            onCheckedChange={setShowDone}
            className="data-unchecked:bg-muted-foreground/30"
          />
          {t.deadlines.showDone}
        </label>
      </div>

      {items.length === 0 && (
        <Card className="rounded-xl">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t.deadlines.emptyTitle}</EmptyTitle>
              <EmptyDescription>
                {t.deadlines.emptyDescription}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Card>
      )}

      <div className="grid gap-6 @4xl:grid-cols-2">
        {[...months.entries()].map(([key, list]) => (
          <Card key={key} className="rounded-xl">
            <CardHeader>
              <CardTitle className="text-xl font-medium tracking-tight">
                {capitalize(fmt.monthYear.format(parseDate(`${key}-01`)))}
              </CardTitle>
              <CardDescription>
                {t.deadlines.count(list.length)}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col">
              {list.map((o) => (
                <Row
                  key={o.key}
                  o={o}
                  onDone={onDone}
                  onOpenCase={onOpenCase}
                  onOpen={onOpen}
                  onAsk={onAsk}
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {missing.length > 0 && (
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="text-xl font-medium tracking-tight">
              {t.deadlines.missing}
            </CardTitle>
            <CardDescription>
              {t.deadlines.missingBefore}
              <code className="font-mono">deadlines.toml</code>
              {t.deadlines.missingAfter}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 @2xl:grid-cols-2 @4xl:grid-cols-3">
            {missing.map((m) => {
              const Icon = areaIcon(m.area)
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-lg p-2 ring-1 ring-border"
                >
                  <span className="flex size-8 items-center justify-center rounded-md bg-muted">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {m.title}
                  </span>
                  <SeverityIcon value={m.severity} />
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
})

/** Everything about one occurrence: full notes, repeat, the case, and where it comes from. */
function Details({
  o,
  onOpenCase,
  onOpen,
  onAsk,
}: {
  o: Occurrence
  onOpenCase: (slug: string) => void
  onOpen: (key: string) => void
  onAsk: (o: Occurrence) => void
}) {
  const { t, fmt } = useI18n()
  const repeat = t.deadlines.repeats[o.repeat.trim().toLowerCase()] ?? o.repeat
  return (
    <div className="flex flex-col gap-3 pb-4 text-sm @lg:pl-16">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => onOpen(o.key)}>
          <Maximize2Icon data-icon="inline-start" />
          {t.deadlines.open}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onAsk(o)}>
          <SparklesIcon data-icon="inline-start" />
          {t.deadlines.ask}
        </Button>
        {o.case && (
          <Button variant="secondary" size="sm" onClick={() => onOpenCase(o.case!)}>
            <FolderOpenIcon data-icon="inline-start" />
            {t.deadlines.openCase}
          </Button>
        )}
      </div>
      {o.notes && (
        <p className="leading-relaxed whitespace-pre-line text-muted-foreground">
          {o.notes}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          {t.deadlines.repeat}: {repeat}
        </span>
        {o.amount != null && (
          <span>
            {t.deadlines.amount}:{" "}
            <Sensitive>{fmt.euro.format(o.amount)}</Sensitive>
          </span>
        )}
        <span className="font-mono">{o.key}</span>
      </div>
      <span className="text-xs font-medium">{t.deadlines.source}</span>
      {o.source ? (
        <SourcePreview path={o.source} />
      ) : (
        <p className="text-xs text-muted-foreground">{t.deadlines.noSource}</p>
      )}
    </div>
  )
}

function Row({
  o,
  onDone,
  onOpenCase,
  onOpen,
  onAsk,
}: {
  o: Occurrence
  onDone: (o: Occurrence, done: boolean) => void
  onOpenCase: (slug: string) => void
  onOpen: (key: string) => void
  onAsk: (o: Occurrence) => void
}) {
  const { t, fmt } = useI18n()
  const d = parseDate(o.date)
  const done = Boolean(o.done_on)
  const l = level(o)
  const [open, setOpen] = React.useState(false)

  return (
    <div className="border-b last:border-b-0">
      <div
        className={cn(
          "flex items-center gap-3 py-3 @lg:gap-4",
          done && !open && "opacity-55"
        )}
      >
        <div
          className={cn(
            "flex size-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md leading-none",
            l === "planned"
              ? "bg-primary text-primary-foreground"
              : STYLE[l].solid
          )}
        >
          <span className="font-mono text-base font-medium">
            <Sensitive when={o.sensitive}>{d.getDate()}</Sensitive>
          </span>
          <span className="text-[0.6rem] uppercase opacity-70">
            {fmt.weekday.format(d)}
          </span>
        </div>

        <button
          type="button"
          className="min-w-0 flex-1 cursor-pointer rounded-md py-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <div className="line-clamp-2 text-sm font-medium @lg:line-clamp-1">
            {o.title}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {!done && (
              <StatusBadge level={l} days={o.days} className="@lg:hidden" />
            )}
            <span>{areaName(t, o.area)}</span>
            <SeverityIcon value={o.severity} />
            {o.amount != null && (
              <Sensitive>{fmt.euro.format(o.amount)}</Sensitive>
            )}
            {o.notes && !open && (
              <span className="line-clamp-1 max-w-md">{o.notes}</span>
            )}
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1 @lg:gap-1.5">
          {o.case && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-9 rounded-lg @lg:size-7"
              onClick={() => onOpenCase(o.case!)}
              aria-label={t.deadlines.openCase}
            >
              <FolderOpenIcon />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-9 rounded-lg @lg:size-7"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? t.deadlines.hideDetails : t.deadlines.details}
          >
            <ChevronDownIcon
              className={cn("transition-transform", open && "rotate-180")}
            />
          </Button>
          {done ? (
            <>
              <Badge
                variant="secondary"
                className={cn("hidden @lg:inline-flex", STYLE.done.soft)}
              >
                <CheckIcon data-icon="inline-start" />
                {t.deadlines.doneOn(fmt.short.format(parseDate(o.done_on!)))}
              </Badge>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-10 rounded-lg @lg:size-7"
                onClick={() => onDone(o, false)}
                aria-label={t.deadlines.undo}
              >
                <Undo2Icon />
              </Button>
            </>
          ) : (
            <>
              <StatusBadge
                level={l}
                days={o.days}
                className="hidden @lg:inline-flex"
              />
              <Button
                size="sm"
                className="hidden rounded-lg @lg:inline-flex"
                onClick={() => onDone(o, true)}
              >
                {t.deadlines.markDone}
              </Button>
              <Button
                size="icon-lg"
                className="size-10 rounded-lg @lg:hidden"
                onClick={() => onDone(o, true)}
                aria-label={t.deadlines.markDone}
              >
                <CheckIcon />
              </Button>
            </>
          )}
        </div>
      </div>
      {open && <Details o={o} onOpenCase={onOpenCase} onOpen={onOpen} onAsk={onAsk} />}
    </div>
  )
}
