import * as React from "react"
import { CheckIcon, ChevronRightIcon, LayoutGridIcon, PlusIcon, RefreshCwIcon } from "lucide-react"
import { widgetJson, type WidgetInput } from "@autocratico/core"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { WidgetView } from "@/components/widget"
import { useI18n } from "@/i18n"
import { useBoard } from "@/lib/board"

/**
 * A widget the agent proposes in the chat: a live preview on the register's data, the version on the
 * Board to compare with when it is an update, and the button that saves it there.
 */
export function WidgetProposal({ widget }: { widget: WidgetInput }) {
  const { t } = useI18n()
  const { board, save } = useBoard()
  const [showing, setShowing] = React.useState<"proposed" | "current">("proposed")
  const [saving, setSaving] = React.useState(false)
  const current = board?.widgets.find((w) => w.id === widget.id) ?? null
  const saved = current !== null && widgetJson(current) === widgetJson(widget)
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
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-card">
          <LayoutGridIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{widget.title}</span>
        {!saved && <Badge variant="secondary">{current ? t.chat.widget.changed : t.chat.widget.new}</Badge>}
      </div>
      {current && !saved && (
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
        <WidgetView key={showing} spec={shown.spec} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {saved ? (
          <Button size="sm" variant="secondary" disabled>
            <CheckIcon data-icon="inline-start" />
            {t.chat.widget.added}
          </Button>
        ) : (
          <Button size="sm" onClick={() => void onSave()} disabled={saving || !board}>
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
