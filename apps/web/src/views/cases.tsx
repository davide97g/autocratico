import * as React from "react"
import { caseOpen } from "@autocratico/core"
import { ChevronDownIcon, FolderOpenIcon } from "lucide-react"
import { cn } from "cn"

import { Documents } from "@/components/documents"
import { Markdown } from "@/components/markdown"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { useI18n } from "@/i18n"
import type { Case } from "@/lib/api"

// Header lines already shown as title, badge and progress.
const HEADER_LINES = /^\*\*(Status|Due|Area):\*\*.*$/gm

export const Cases = React.memo(function Cases({ cases, open }: { cases: Case[]; open: string | null }) {
  const { t } = useI18n()
  if (!cases.length) {
    return (
      <Card className="rounded-xl">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpenIcon />
            </EmptyMedia>
            <EmptyTitle>{t.cases.emptyTitle}</EmptyTitle>
            <EmptyDescription>
              {t.cases.emptyBefore}
              <code>cases/</code>
              {t.cases.emptyAfter}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Card>
    )
  }

  const first = (list: Case[]) => [...list].sort((a, b) => Number(b.slug === open) - Number(a.slug === open))
  const active = first(cases.filter(caseOpen))
  const closed = first(cases.filter((c) => !caseOpen(c)))

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {active.length === 0 && <p className="text-sm text-muted-foreground">{t.cases.emptyTitle}</p>}
      {active.map((c) => (
        <CaseCard key={c.slug} c={c} />
      ))}
      {closed.length > 0 && <Closed cases={closed} initiallyOpen={closed.some((c) => c.slug === open)} />}
    </div>
  )
})

/** Cases whose checklist is all done: folded away below the open ones. */
function Closed({ cases, initiallyOpen }: { cases: Case[]; initiallyOpen: boolean }) {
  const { t } = useI18n()
  const [shown, setShown] = React.useState(initiallyOpen)
  return (
    <section className="flex flex-col gap-4 sm:gap-6">
      <Button variant="ghost" className="self-start text-muted-foreground" onClick={() => setShown((v) => !v)} aria-expanded={shown}>
        <ChevronDownIcon data-icon="inline-start" className={cn("transition-transform", !shown && "-rotate-90")} />
        {shown ? t.cases.hideClosed(cases.length) : t.cases.showClosed(cases.length)}
      </Button>
      {shown && cases.map((c) => <CaseCard key={c.slug} c={c} />)}
    </section>
  )
}

export function CaseCard({ c }: { c: Case }) {
  const { t } = useI18n()
  return (
    <Card id={`case-${c.slug}`} className={cn("rounded-xl", !caseOpen(c) && "opacity-80")}>
      <CardHeader>
        <CardDescription className="font-mono text-xs">{t.cases.file(c.slug)}</CardDescription>
        <CardTitle className="text-2xl font-medium tracking-tight">{c.title}</CardTitle>
        <CardAction>{c.status && <Badge variant={caseOpen(c) ? "default" : "secondary"}>{c.status}</Badge>}</CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:gap-6">
        <Progress value={c.total ? (c.done / c.total) * 100 : 0} className="max-w-sm">
          <ProgressLabel className="text-xs text-muted-foreground">{t.cases.closedItems}</ProgressLabel>
          <ProgressValue className="font-mono text-xs">{() => `${c.done}/${c.total}`}</ProgressValue>
        </Progress>
        <Markdown text={c.md.replace(HEADER_LINES, "")} />
        {c.documents.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium tracking-tight">{t.documents.title}</h2>
            <Documents paths={c.documents} />
          </section>
        )}
      </CardContent>
    </Card>
  )
}
