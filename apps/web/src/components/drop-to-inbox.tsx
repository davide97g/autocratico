import * as React from "react"
import { InboxIcon } from "lucide-react"

import { AddDocuments } from "@/components/add-documents"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useI18n } from "@/i18n"

const hasFiles = (e: DragEvent) =>
  Boolean(e.dataTransfer?.types.includes("Files"))

/**
 * Files dragged anywhere on the app: a full-window hint while dragging, then a dialog with the
 * files, a note and the send button. Drops on an open dialog add to its list.
 */
export function DropToInbox({ onOpenInbox }: { onOpenInbox: () => void }) {
  const { t } = useI18n()
  const [dragging, setDragging] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [files, setFiles] = React.useState<File[]>([])

  React.useEffect(() => {
    // dragenter/dragleave fire for every element crossed: count them to know when the drag left the window.
    let depth = 0
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (!depth) setDragging(false)
    }
    // Without this the browser would open the dropped file in place of the app.
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const list = Array.from(e.dataTransfer?.files ?? [])
      if (!list.length) return
      setFiles((f) => [...f, ...list])
      setOpen(true)
    }
    window.addEventListener("dragenter", enter)
    window.addEventListener("dragleave", leave)
    window.addEventListener("dragover", over)
    window.addEventListener("drop", drop)
    return () => {
      window.removeEventListener("dragenter", enter)
      window.removeEventListener("dragleave", leave)
      window.removeEventListener("dragover", over)
      window.removeEventListener("drop", drop)
    }
  }, [])

  return (
    <>
      {dragging && !open && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-50 flex animate-in items-center justify-center bg-background/70 p-6 backdrop-blur-sm duration-150 fade-in-0 motion-reduce:animate-none"
        >
          <div className="flex size-full max-h-96 max-w-xl flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-card text-center shadow-xl">
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <InboxIcon className="size-6" />
            </span>
            <span className="text-lg font-medium tracking-tight">
              {t.inbox.dropAnywhere}
            </span>
            <span className="text-sm text-muted-foreground">
              {t.inbox.dropAnywhereHint}
            </span>
          </div>
        </div>
      )}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) setFiles([])
        }}
      >
        <DialogContent className="max-h-[calc(100svh-2rem)] grid-cols-1 overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.inbox.add}</DialogTitle>
            <DialogDescription>{t.inbox.addDescription}</DialogDescription>
          </DialogHeader>
          <AddDocuments
            files={files}
            onFiles={setFiles}
            onAdded={() => undefined}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false)
                setFiles([])
                onOpenInbox()
              }}
            >
              <InboxIcon data-icon="inline-start" />
              {t.inbox.openInbox}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
