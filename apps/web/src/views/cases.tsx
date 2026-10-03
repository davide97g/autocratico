import { FolderOpenIcon } from "lucide-react"

import { Documents } from "@/components/documents"
import { Markdown } from "@/components/markdown"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { useI18n } from "@/i18n"
import type { Case } from "@/lib/api"

// Header lines already shown as title, badge and progress.
const HEADER_LINES = /^\*\*(Status|Due|Area):\*\*.*$/gm

export function Cases({ cases, open }: { cases: Case[]; open: string | null }) {
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

  const sorted = [...cases].sort((a, b) => Number(b.slug === open) - Number(a.slug === open))

  return (
    <div className="flex flex-col gap-6">
      {sorted.map((c) => (
        <Card key={c.slug} id={`case-${c.slug}`} className="rounded-xl">
          <CardHeader>
            <CardDescription className="font-mono text-xs">{t.cases.file(c.slug)}</CardDescription>
            <CardTitle className="text-2xl font-medium tracking-tight">{c.title}</CardTitle>
            <CardAction>{c.status && <Badge>{c.status}</Badge>}</CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
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
      ))}
    </div>
  )
}
