import * as React from "react"

import { Markdown } from "@/components/markdown"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/i18n"
import type { CatalogEntry } from "@/lib/api"

export function Catalog({ entries }: { entries: CatalogEntry[] }) {
  const { t } = useI18n()
  const [selected, setSelected] = React.useState(entries[0]?.name)
  const active = entries.find((e) => e.name === selected) ?? entries[0]
  if (!active) return null

  return (
    <div className="grid gap-4 sm:gap-6 @3xl:grid-cols-[16rem_minmax(0,1fr)]">
      <nav className="flex gap-1 overflow-x-auto rounded-xl bg-card p-2 @3xl:flex-col @3xl:self-start" aria-label={t.catalog.topics}>
        {entries.map((e) => (
          <Button
            key={e.name}
            variant={e.name === active.name ? "default" : "ghost"}
            className="h-10 justify-start rounded-lg px-4"
            aria-current={e.name === active.name || undefined}
            onClick={() => setSelected(e.name)}
          >
            {e.title}
          </Button>
        ))}
      </nav>
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-2xl font-medium tracking-tight">{active.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <Markdown text={active.md} />
        </CardContent>
      </Card>
    </div>
  )
}
