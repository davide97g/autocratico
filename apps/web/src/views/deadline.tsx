import * as React from "react"
import { ArrowLeftIcon, CheckIcon, FolderOpenIcon, SparklesIcon, Undo2Icon } from "lucide-react"
import { cn } from "cn"

import { Amount } from "@/components/amount"
import { Sensitive } from "@/components/privacy"
import { SourcePreview } from "@/components/source"
import { SeverityIcon, StatusBadge } from "@/components/status"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { useI18n } from "@/i18n"
import { type Data, type Occurrence } from "@/lib/api"
import { areaIcon, areaName, capitalize, parseDate } from "@/lib/format"
import { level, severity, STYLE } from "@/lib/status"
import { CaseCard } from "@/views/cases"

/** One occurrence on a page of its own: notes, source at full size, its case with documents, related dates. */
export const DeadlinePage = React.memo(function DeadlinePage({
  data,
  occurrence: key,
  onBack,
  onOpen,
  onDone,
  onOpenCase,
  onAsk,
}: {
  data: Data
  occurrence: string
  onBack: () => void
  onOpen: (key: string) => void
  onDone: (o: Occurrence, done: boolean) => void
  onOpenCase: (slug: string) => void
  onAsk: (o: Occurrence) => void
}) {
  const { t, fmt } = useI18n()
  const o = data.agenda.find((x) => x.key === key)
  const back = (
    <Button variant="ghost" className="self-start text-muted-foreground" onClick={onBack}>
      <ArrowLeftIcon data-icon="inline-start" />
      {t.deadlines.back}
    </Button>
  )

  if (!o) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <Card className="rounded-xl">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t.deadlines.notFoundTitle}</EmptyTitle>
              <EmptyDescription>{t.deadlines.notFoundBody}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="secondary" onClick={onBack}>
                {t.deadlines.back}
              </Button>
            </EmptyContent>
          </Empty>
        </Card>
      </div>
    )
  }

  const d = parseDate(o.date)
  const done = Boolean(o.done_on)
  const l = level(o)
  const repeat = t.deadlines.repeats[o.repeat.trim().toLowerCase()] ?? o.repeat
  const c = o.case ? data.cases.find((x) => x.slug === o.case) : undefined
  const occurrences = data.agenda.filter((x) => x.id === o.id && x.key !== o.key)
  // Other deadlines of the same case: the first open occurrence of each, else the last one.
  const byId = new Map<string, Occurrence[]>()
  for (const x of data.agenda) if (o.case && x.case === o.case && x.id !== o.id) byId.set(x.id, [...(byId.get(x.id) ?? []), x])
  const related = [...byId.values()].map((list) => list.find((x) => !x.done_on) ?? list.at(-1)!)

  return (
    <div className="flex flex-col gap-6">
      {back}

      <Card className="rounded-xl">
        <CardContent className="flex flex-col gap-5 @2xl:flex-row @2xl:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div
              className={cn(
                "flex size-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg leading-none",
                l === "planned" ? "bg-primary text-primary-foreground" : STYLE[l].solid
              )}
            >
              <span className="font-mono text-2xl font-medium">
                <Sensitive when={o.sensitive}>{d.getDate()}</Sensitive>
              </span>
              <span className="text-xs uppercase opacity-70">{fmt.monthShort.format(d)}</span>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <h2 className="text-2xl font-medium tracking-tight text-balance">{o.title}</h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {done ? (
                  <Badge variant="secondary" className={STYLE.done.soft}>
                    <CheckIcon data-icon="inline-start" />
                    {t.deadlines.doneOn(fmt.short.format(parseDate(o.done_on!)))}
                  </Badge>
                ) : (
                  <StatusBadge level={l} days={o.days} />
                )}
                <span className="flex items-center gap-1.5">
                  {React.createElement(areaIcon(o.area), { className: "size-4" })}
                  {areaName(t, o.area)}
                </span>
                <SeverityIcon value={o.severity} />
                <Amount o={o} className="font-medium text-foreground" />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => onAsk(o)}>
              <SparklesIcon data-icon="inline-start" />
              {t.deadlines.ask}
            </Button>
            {o.case && (
              <Button variant="secondary" onClick={() => onOpenCase(o.case!)}>
                <FolderOpenIcon data-icon="inline-start" />
                {t.deadlines.openCase}
              </Button>
            )}
            {done ? (
              <Button variant="outline" onClick={() => onDone(o, false)}>
                <Undo2Icon data-icon="inline-start" />
                {t.deadlines.undo}
              </Button>
            ) : (
              <Button onClick={() => onDone(o, true)}>
                <CheckIcon data-icon="inline-start" />
                {t.deadlines.markDone}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 @4xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 @4xl:col-span-2">
          {o.notes && (
            <Card className="rounded-xl">
              <CardHeader>
                <CardTitle className="text-lg font-medium tracking-tight">{t.deadlines.notes}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="leading-relaxed whitespace-pre-line">{o.notes}</p>
              </CardContent>
            </Card>
          )}
          <Card className="rounded-xl">
            <CardHeader>
              <CardTitle className="text-lg font-medium tracking-tight">{t.deadlines.source}</CardTitle>
            </CardHeader>
            <CardContent>
              {o.source ? (
                <SourcePreview path={o.source} large />
              ) : (
                <p className="text-sm text-muted-foreground">{t.deadlines.noSource}</p>
              )}
            </CardContent>
          </Card>
          {c && <CaseCard c={c} />}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card className="rounded-xl">
            <CardHeader>
              <CardTitle className="text-lg font-medium tracking-tight">{t.deadlines.facts}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
                <dt className="text-muted-foreground">{t.deadlines.date}</dt>
                <dd>
                  <Sensitive when={o.sensitive}>{capitalize(`${fmt.weekdayLong.format(d)} ${fmt.long.format(d)}`)}</Sensitive>
                </dd>
                <dt className="text-muted-foreground">{t.deadlines.repeat}</dt>
                <dd>{repeat}</dd>
                {o.amount_basis && (
                  <>
                    <dt className="text-muted-foreground">{t.deadlines.amount}</dt>
                    <dd>
                      <Amount o={o} />
                      {o.amount_basis === "estimate" && (
                        <span className="block text-xs text-muted-foreground">{t.payments.estimate}</span>
                      )}
                    </dd>
                  </>
                )}
                <dt className="text-muted-foreground">{t.deadlines.area}</dt>
                <dd>{areaName(t, o.area)}</dd>
                <dt className="text-muted-foreground">{t.deadlines.priority}</dt>
                <dd>{t.severity[severity(o.severity)]}</dd>
                <dt className="text-muted-foreground">ID</dt>
                <dd className="truncate font-mono text-xs leading-5">{o.key}</dd>
              </dl>
            </CardContent>
          </Card>

          {occurrences.length > 0 && (
            <Card className="rounded-xl">
              <CardHeader>
                <CardTitle className="text-lg font-medium tracking-tight">{t.deadlines.occurrences}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {occurrences.map((x) => (
                  <LinkRow key={x.key} o={x} label={capitalize(fmt.long.format(parseDate(x.date)))} onOpen={onOpen} />
                ))}
              </CardContent>
            </Card>
          )}

          {related.length > 0 && (
            <Card className="rounded-xl">
              <CardHeader>
                <CardTitle className="text-lg font-medium tracking-tight">{t.deadlines.related}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {related.map((x) => (
                  <LinkRow key={x.key} o={x} label={x.title} onOpen={onOpen} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
})

/** Another occurrence, as a line that opens it. */
function LinkRow({ o, label, onOpen }: { o: Occurrence; label: string; onOpen: (key: string) => void }) {
  const { t, fmt } = useI18n()
  const l = level(o)
  return (
    <Button variant="ghost" className="h-auto justify-start gap-3 rounded-lg px-2 py-2 text-left" onClick={() => onOpen(o.key)}>
      <span className={cn("size-2 shrink-0 rounded-full", STYLE[l].dot)} />
      <span className="min-w-0 flex-1 truncate font-normal">{label}</span>
      <span className="shrink-0 text-xs font-normal text-muted-foreground">
        {o.done_on ? t.deadlines.doneOn(fmt.short.format(parseDate(o.done_on))) : t.relativeDays(o.days)}
      </span>
    </Button>
  )
}
