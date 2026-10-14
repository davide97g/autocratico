/**
 * Files attached to a chat message: uploaded as soon as they are picked, pasted or dropped
 * (POST /api/chat/files), then sent with the question as paths the agent reads. Photos, screenshots,
 * PDFs and documents, for any question and for widgets designed after a picture.
 */
import * as React from "react"
import { FileTextIcon, PaperclipIcon, XIcon } from "lucide-react"
import { cn } from "cn"

import { Sensitive } from "@/components/privacy"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useI18n } from "@/i18n"
import { chatFileUrl as fileUrl, uploadChatFiles } from "@/lib/api"

export const MAX_ATTACHMENTS = 10
const ACCEPT = "image/*,.heic,.heif,application/pdf,.txt,.csv,.md,.eml,.doc,.docx,.xls,.xlsx,.odt,.ods,.zip"

type Attachment = { id: string; name: string; preview: string | null; status: "uploading" | "ready" | "error"; path?: string; error?: string }

export function useAttachments() {
  const [items, setItems] = React.useState<Attachment[]>([])
  const add = React.useCallback((files: File[]) => {
    const picked = files.slice(0, MAX_ATTACHMENTS)
    if (!picked.length) return
    const batch = picked.map(
      (f): Attachment => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: f.name || "file",
        preview: f.type.startsWith("image/") && !/hei[cf]/i.test(f.type) ? URL.createObjectURL(f) : null,
        status: "uploading",
      })
    )
    setItems((list) => [...list, ...batch].slice(-MAX_ATTACHMENTS))
    uploadChatFiles(picked).then(
      (saved) =>
        setItems((list) => list.map((a) => {
          const i = batch.findIndex((b) => b.id === a.id)
          return i < 0 ? a : saved[i] ? { ...a, status: "ready", path: saved[i].path, name: saved[i].name } : { ...a, status: "error" }
        })),
      (e: Error) => setItems((list) => list.map((a) => (batch.some((b) => b.id === a.id) ? { ...a, status: "error", error: e.message } : a)))
    )
  }, [])
  const remove = React.useCallback((id: string) => {
    setItems((list) => {
      const gone = list.find((a) => a.id === id)
      if (gone?.preview) URL.revokeObjectURL(gone.preview)
      return list.filter((a) => a.id !== id)
    })
  }, [])
  const clear = React.useCallback(() => {
    setItems((list) => {
      for (const a of list) if (a.preview) URL.revokeObjectURL(a.preview)
      return []
    })
  }, [])
  const uploading = items.some((a) => a.status === "uploading")
  const paths = items.flatMap((a) => (a.status === "ready" && a.path ? [a.path] : []))
  return { items, add, remove, clear, uploading, paths }
}

/** The paperclip next to the question. */
export function AttachButton({ onFiles, disabled }: { onFiles: (files: File[]) => void; disabled?: boolean }) {
  const { t } = useI18n()
  const picker = React.useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={picker}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []))
          e.target.value = ""
        }}
      />
      <Tooltip>
        <TooltipTrigger
          render={<Button type="button" variant="ghost" size="icon" disabled={disabled} onClick={() => picker.current?.click()} aria-label={t.chat.attach} className="shrink-0 text-muted-foreground" />}
        >
          <PaperclipIcon />
        </TooltipTrigger>
        <TooltipContent>{t.chat.attachHint}</TooltipContent>
      </Tooltip>
    </>
  )
}

/** What is attached to the question being written. */
export function AttachmentStrip({ items, onRemove }: { items: Attachment[]; onRemove: (id: string) => void }) {
  const { t } = useI18n()
  if (!items.length) return null
  return (
    <ul className="mb-2 flex flex-wrap gap-2" aria-label={t.chat.attachments}>
      {items.map((a) => (
        <li key={a.id} className={cn("relative flex h-14 max-w-48 items-center gap-2 overflow-hidden rounded-lg bg-muted pr-7", a.preview ? "pl-0" : "pl-2.5", a.status === "error" && "ring-1 ring-status-overdue")}>
          {a.preview ? (
            <img src={a.preview} alt="" className="size-14 shrink-0 object-cover" />
          ) : (
            <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-medium">
              <Sensitive>{a.name}</Sensitive>
            </span>
            <span className={cn("text-[0.7rem] text-muted-foreground", a.status === "error" && "text-status-overdue")}>
              {a.status === "uploading" ? <Spinner className="size-3" /> : a.status === "error" ? (a.error ?? t.chat.attachFailed) : t.chat.attachReady}
            </span>
          </span>
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => onRemove(a.id)} aria-label={t.chat.attachRemove} className="absolute top-1 right-1">
            <XIcon />
          </Button>
        </li>
      ))}
    </ul>
  )
}

const IMAGE = /\.(png|jpe?g|gif|webp)$/i

/** The files of a question already sent: photos as thumbnails, the rest as cards; each opens the file. */
export function MessageFiles({ files }: { files: string[] }) {
  if (!files.length) return null
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {files.map((path) => {
        const name = path.split("/").at(-1) ?? path
        return IMAGE.test(name) ? (
          <a key={path} href={fileUrl(path, "view")} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg ring-1 ring-border transition-opacity hover:opacity-90">
            <Sensitive>
              <img src={fileUrl(path, "thumb")} alt={name} className="block h-28 max-w-56 object-cover" loading="lazy" />
            </Sensitive>
          </a>
        ) : (
          <a key={path} href={fileUrl(path)} className="flex max-w-56 items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs transition-colors hover:bg-muted/70">
            <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">
              <Sensitive>{name}</Sensitive>
            </span>
          </a>
        )
      })}
    </div>
  )
}
