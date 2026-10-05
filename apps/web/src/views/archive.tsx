import * as React from "react"
import { ChevronDownIcon, FileIcon, MailIcon, PaperclipIcon, SearchIcon } from "lucide-react"
import { cn } from "cn"

import { Sensitive } from "@/components/privacy"
import { SourcePreview } from "@/components/source"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Button } from "@/components/ui/button"
import { RowsSkeleton } from "@/components/skeletons"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useI18n } from "@/i18n"
import { useLiveRefresh } from "@/lib/events"
import { unlessChanged } from "@/lib/utils"
import { type ArchiveEntry, archive as loadArchive } from "@/lib/api"

const PAGE = 60
type Kind = "all" | "email" | "file"

function Entry({ e }: { e: ArchiveEntry }) {
  const { t, fmt } = useI18n()
  const [open, setOpen] = React.useState(false)
  const Icon = e.kind === "email" ? MailIcon : FileIcon
  const when = e.date && !Number.isNaN(Date.parse(e.date)) ? fmt.short.format(new Date(e.date)) : ""
  return (
    <li className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 rounded-md py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium wrap-anywhere">
            <Sensitive>{e.title}</Sensitive>
          </span>
          <span className="flex min-w-0 flex-wrap gap-x-2 text-xs text-muted-foreground">
            {e.from && (
              <span className="min-w-0 truncate">
                <Sensitive>{e.from}</Sensitive>
              </span>
            )}
            {e.account && (
              <span>
                {e.from && "· "}
                {e.account}
              </span>
            )}
            {e.files > 0 && (
              <span className="inline-flex items-center gap-1">
                {(e.from || e.account) && "· "}
                <PaperclipIcon className="size-3" />
                {t.archive.attachments(e.files)}
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{when}</span>
        <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <SourcePreview path={e.path} className="mb-3" />}
    </li>
  )
}

/** Everything filed in archive/: emails from the Gmail sync and documents, searchable, each one openable. */
export function Archive() {
  const { t } = useI18n()
  const [entries, setEntries] = React.useState<ArchiveEntry[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState("")
  const [kind, setKind] = React.useState<Kind>("all")
  const [shown, setShown] = React.useState(PAGE)

  const refresh = React.useCallback(() => {
    loadArchive().then((a) => setEntries(unlessChanged(a)), (e: Error) => setError(e.message))
  }, [])
  React.useEffect(refresh, [refresh])
  // The agent files documents and the mail sync adds emails: the server says when.
  useLiveRefresh("archive", refresh, 120_000)

  const q = query.trim().toLowerCase()
  const list = (entries ?? []).filter(
    (e) => (kind === "all" || e.kind === kind) && (!q || `${e.title} ${e.from} ${e.account} ${e.path}`.toLowerCase().includes(q))
  )

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-2xl font-medium tracking-tight">{t.views.archive}</CardTitle>
        <CardDescription>
          {t.archive.description}
          {entries && ` · ${t.archive.count(list.length)}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <InputGroup className="h-10 w-full rounded-lg sm:w-80">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              placeholder={t.archive.search}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setShown(PAGE)
              }}
              aria-label={t.archive.search}
            />
          </InputGroup>
          <ToggleGroup value={[kind]} onValueChange={(v) => v[0] && setKind(v[0] as Kind)} className="rounded-md bg-muted p-0.5">
            {(["all", "email", "file"] as const).map((k) => (
              <ToggleGroupItem key={k} value={k} size="sm" className="h-8 rounded-sm px-3 text-xs aria-pressed:bg-card">
                {k === "all" ? t.archive.all : k === "email" ? t.archive.emails : t.archive.documents}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        {error && <p className="text-sm text-status-overdue">{error}</p>}
        {!entries && !error && <RowsSkeleton rows={6} />}
        {entries && list.length === 0 && <p className="text-sm text-muted-foreground">{t.archive.empty}</p>}
        <ul className="flex flex-col">
          {list.slice(0, shown).map((e) => (
            <Entry key={e.path} e={e} />
          ))}
        </ul>
        {list.length > shown && (
          <Button variant="secondary" className="self-start" onClick={() => setShown((n) => n + PAGE)}>
            {t.archive.more(Math.min(PAGE, list.length - shown))}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
