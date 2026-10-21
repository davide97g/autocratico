import * as React from "react"
import { CheckIcon, ChevronRightIcon, CodeIcon, LayoutGridIcon, PlayIcon, PlusIcon, RefreshCwIcon, ShieldCheckIcon } from "lucide-react"
import { type CustomWidgetInput, widgetJson, type WidgetInput } from "@autocratico/core"
import { toast } from "sonner"

import { CreativeBadge, CreativeMark } from "@/components/creative"
import { SandboxFrame, type SandboxHandle } from "@/components/sandbox-frame"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { WidgetView } from "@/components/widget"
import { useI18n } from "@/i18n"
import { useBoard } from "@/lib/board"

/** A widget's content: the catalog's renderer, or the sandbox for custom code (`frame` reaches it for exports). */
export function WidgetBody({ widget, frame }: { widget: WidgetInput; frame?: React.Ref<SandboxHandle> }) {
  return widget.kind === "custom" ? <SandboxFrame key={widgetJson(widget)} widget={widget} ref={frame} /> : <WidgetView spec={widget.spec} />
}

/**
 * A widget the agent proposes in the chat: a live preview on the register's data, the version on the
 * Board to compare with when it is an update, and the button that saves it there. Custom code runs only
 * after the user presses "Run in sandbox" here, and is saved only after it ran.
 */
export function WidgetProposal({ widget }: { widget: WidgetInput }) {
  const { t } = useI18n()
  const { board, save } = useBoard()
  const [showing, setShowing] = React.useState<"proposed" | "current">("proposed")
  const [saving, setSaving] = React.useState(false)
  const [approved, setApproved] = React.useState(false)
  const current = board?.widgets.find((w) => w.id === widget.id) ?? null
  const saved = current !== null && widgetJson(current) === widgetJson(widget)
  const custom = widget.kind === "custom"
  // Code already on the Board ran when it was added; a new or changed one waits for the user.
  const runs = !custom || saved || approved
  const shown = showing === "current" && current && !saved ? current : widget

  const onSave = async () => {
    setSaving(true)
    try {
      await save(widget)
      setShowing("proposed")
      toast.success(t.chat.widget.saved(widget.title), { id: `widget-${widget.id}`, action: { label: t.chat.widget.open, onClick: () => (window.location.hash = "board") } })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/60 p-2.5">
      <div className="flex items-center gap-2.5">
        {custom ? (
          <CreativeMark />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-card">
            <LayoutGridIcon className="size-4" />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{widget.title}</span>
        {custom && <CreativeBadge label={t.widgetCode.badge} title={t.widgetCode.badgeHint} />}
        {!saved && <Badge variant="secondary">{current ? t.chat.widget.changed : t.chat.widget.new}</Badge>}
      </div>
      {current && !saved && runs && (
        <ToggleGroup value={[showing]} onValueChange={(v) => v[0] && setShowing(v[0] as "proposed" | "current")} className="rounded-lg bg-muted p-1" aria-label={t.chat.widget.compare}>
          <ToggleGroupItem value="proposed" size="sm" className="flex-1 rounded-md aria-pressed:bg-card">
            {t.chat.widget.proposed}
          </ToggleGroupItem>
          <ToggleGroupItem value="current" size="sm" className="flex-1 rounded-md aria-pressed:bg-card">
            {t.chat.widget.current}
          </ToggleGroupItem>
        </ToggleGroup>
      )}
      <div className="rounded-lg bg-card p-3.5 ring-1 ring-border">
        {runs ? <WidgetBody key={showing} widget={shown} /> : <RunGate widget={widget as CustomWidgetInput} onRun={() => setApproved(true)} />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {saved ? (
          <Button size="sm" variant="secondary" disabled>
            <CheckIcon data-icon="inline-start" />
            {t.chat.widget.added}
          </Button>
        ) : (
          <Button size="sm" onClick={() => void onSave()} disabled={saving || !board || !runs}>
            {saving ? <Spinner data-icon="inline-start" /> : current ? <RefreshCwIcon data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
            {current ? t.chat.widget.update : t.chat.widget.add}
          </Button>
        )}
        <Button size="sm" variant="ghost" render={<a href="#board" />} nativeButton={false}>
          {t.chat.widget.open}
          <ChevronRightIcon data-icon="inline-end" />
        </Button>
      </div>
    </div>
  )
}

/** Custom code waiting for the user's yes: what it reads, the code itself, and the button that runs it. */
function RunGate({ widget, onRun }: { widget: CustomWidgetInput; onRun: () => void }) {
  const { t } = useI18n()
  const [code, setCode] = React.useState(false)
  const sources = Object.values(widget.data).map((q) => t.widgetCode.sources[q.from] ?? q.from)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2.5">
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium">{t.widgetCode.runTitle}</p>
          <p className="text-xs text-muted-foreground">{t.widgetCode.runBody}</p>
          <p className="text-xs">
            <span className="text-muted-foreground">{t.widgetCode.reads}: </span>
            {[...new Set(sources)].join(", ") || "—"}
            <span className="text-muted-foreground"> · {t.widgetCode.size(Math.max(1, Math.round(widget.code.length / 1024)))}</span>
          </p>
        </div>
      </div>
      {code && (
        <pre className="max-h-64 overflow-auto rounded-md bg-muted p-2.5 font-mono text-[0.7rem] leading-relaxed whitespace-pre-wrap break-words">{widget.code}</pre>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onRun}>
          <PlayIcon data-icon="inline-start" />
          {t.widgetCode.run}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setCode((v) => !v)}>
          <CodeIcon data-icon="inline-start" />
          {code ? t.widgetCode.hideCode : t.widgetCode.showCode}
        </Button>
      </div>
    </div>
  )
}
