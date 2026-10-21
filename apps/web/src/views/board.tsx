import * as React from "react"
import { ArrowDownIcon, ArrowUpIcon, BrushIcon, DownloadIcon, LayoutGridIcon, MessageSquareIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import { customData, EXPORT_FORMATS, type ExportFormat, queryTable } from "@autocratico/core"
import { cn } from "cn"
import { toast } from "sonner"

import { stagger } from "@/components/motion"
import { usePrivacy } from "@/components/privacy"
import type { SandboxHandle } from "@/components/sandbox-frame"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { WidgetBody } from "@/components/widget-proposal"
import { useI18n } from "@/i18n"
import { revertCommit, type Widget } from "@/lib/api"
import { useBoard } from "@/lib/board"
import { exportFile, saveFile } from "@/lib/widget-export"

/** Width of a widget on the Board: two columns on medium screens, twelve on wide ones. */
export const SIZE: Record<Widget["size"], string> = {
  small: "@4xl:col-span-4",
  medium: "@4xl:col-span-6",
  large: "@xl:col-span-2 @4xl:col-span-8",
  full: "@xl:col-span-2 @4xl:col-span-12",
}

/** The Board: widgets designed by the chat agent on the register's live data (docs/generative-ui.md). */
export function Board({ onAsk, onChat }: { onAsk: (q: string) => void; onChat: () => void }) {
  const { t } = useI18n()
  const { board } = useBoard()

  if (!board) return <div className="h-48 animate-pulse rounded-xl bg-muted" />
  if (!board.widgets.length) {
    return (
      <Card className="rounded-xl">
        <CardContent>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LayoutGridIcon />
              </EmptyMedia>
              <EmptyTitle>{t.board.emptyTitle}</EmptyTitle>
              <EmptyDescription>{t.board.emptyBody}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="max-w-lg">
              <div className="flex w-full flex-col gap-2">
                {t.board.suggestions.map((s, i) => (
                  <Button
                    key={s}
                    variant="secondary"
                    style={stagger(i)}
                    className="rise-in h-auto justify-start rounded-lg px-3 py-2.5 text-left whitespace-normal"
                    onClick={() => onAsk(s)}
                  >
                    <SparklesIcon data-icon="inline-start" />
                    {s}
                  </Button>
                ))}
              </div>
            </EmptyContent>
          </Empty>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">{t.board.description}</p>
        <Button variant="secondary" size="sm" onClick={onChat}>
          <PlusIcon data-icon="inline-start" />
          {t.board.create}
        </Button>
      </div>
      <div className="grid grid-flow-dense grid-cols-1 gap-5 @xl:grid-cols-2 @4xl:grid-cols-12">
        {board.widgets.map((w, i) => (
          <div key={w.id} className={cn("rise-in min-w-0", SIZE[w.size])} style={stagger(i)}>
            <WidgetCard widget={w} index={i} count={board.widgets.length} />
          </div>
        ))}
      </div>
    </div>
  )
}

function WidgetCard({ widget, index, count }: { widget: Widget; index: number; count: number }) {
  const { t } = useI18n()
  const { move, remove, askAbout } = useBoard()
  const frame = React.useRef<SandboxHandle>(null)
  const onRemove = async () => {
    try {
      const hash = await remove(widget.id)
      toast.success(t.board.removed(widget.title), {
        id: `widget-${widget.id}`,
        action: hash ? { label: t.board.undo, onClick: () => void revertCommit(hash).catch((e: Error) => toast.error(e.message)) } : undefined,
        duration: 7000,
      })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const tool = (label: string, Icon: typeof ArrowUpIcon, onClick: () => void, disabled = false) => (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-xs" onClick={onClick} disabled={disabled} aria-label={label} />}>
        <Icon />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
  return (
    <Card className="group/widget h-full rounded-xl">
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2 text-base font-medium tracking-tight">
          <span className="truncate">{widget.title}</span>
          {widget.kind === "custom" && (
            <Tooltip>
              <TooltipTrigger render={<span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-creative-from via-creative-via to-creative-to text-white" aria-label={t.widgetCode.badge} />}>
                <BrushIcon className="size-3" />
              </TooltipTrigger>
              <TooltipContent>{t.widgetCode.badgeHint}</TooltipContent>
            </Tooltip>
          )}
        </CardTitle>
        <CardAction className="flex gap-0.5 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/widget:opacity-100 [@media(hover:hover)]:group-hover/widget:opacity-100">
          {widget.kind === "custom" && <ExportMenu widget={widget} frame={frame} />}
          {tool(t.board.ask, MessageSquareIcon, () => askAbout(widget))}
          {tool(t.board.moveUp, ArrowUpIcon, () => void move(widget.id, index - 1).catch((e: Error) => toast.error(e.message)), index === 0)}
          {tool(t.board.moveDown, ArrowDownIcon, () => void move(widget.id, index + 1).catch((e: Error) => toast.error(e.message)), index === count - 1)}
          {tool(t.board.remove, Trash2Icon, () => void onRemove())}
        </CardAction>
      </CardHeader>
      <CardContent>
        <WidgetBody widget={widget} frame={frame} />
      </CardContent>
    </Card>
  )
}

/**
 * Exports a custom widget (docs/generative-ui.md): the sandbox hands back its table and a picture, and
 * the app writes the file. A widget without its own table exports the rows of its queries, as the app
 * computes them (with the privacy mode the user sees).
 */
function ExportMenu({ widget, frame }: { widget: Widget & { kind: "custom" }; frame: React.RefObject<SandboxHandle | null> }) {
  const { t, locale } = useI18n()
  const { context } = useBoard()
  const { enabled: privacy } = usePrivacy()
  const [busy, setBusy] = React.useState(false)
  const e = t.board.export

  const run = async (format: ExportFormat) => {
    if (!frame.current || !context) return void toast.error(e.notRunning)
    setBusy(true)
    const id = `export-${widget.id}`
    toast.loading(e.working, { id })
    try {
      const answer = await frame.current.export(format)
      const table = answer?.table ?? queryTable(customData(widget.data, context, privacy))
      const today = context.data.today
      const date = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "it-IT", { dateStyle: "long" }).format(new Date(`${today}T12:00:00`))
      const labels = { exported: e.exported(date), privacy: privacy ? e.privacy : null, data: e.data, yes: e.yes, no: e.no, page: e.page }
      const file = await exportFile(format, { id: widget.id, title: widget.title, date: today, locale, privacy, table, picture: answer?.picture ?? null, labels })
      if (!file) return void toast.error(e.noPicture, { id })
      saveFile(file.blob, file.name)
      const notes = [format === "pdf" && !answer?.picture ? e.pdfNoPicture : null, privacy ? e.privacyOn : null].filter(Boolean).join(" ")
      toast.success(e.done(file.name), { id, description: notes || undefined })
    } catch {
      toast.error(e.failed, { id })
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger render={<DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" disabled={busy} aria-label={e.label} />} />}>
          {busy ? <Spinner /> : <DownloadIcon />}
        </TooltipTrigger>
        <TooltipContent>{e.label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-52">
        {EXPORT_FORMATS.map((f) => (
          <DropdownMenuItem key={f} onClick={() => void run(f)}>
            {e.formats[f]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
