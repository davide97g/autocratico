import * as React from "react"
import {
  CameraIcon,
  FileIcon,
  PaperclipIcon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useI18n } from "@/i18n"
import { ingest } from "@/lib/api"

/** Files, photos and text to the inbox (Inbox view, onboarding). `onAdded` runs after each send. */
export function AddDocuments({ onAdded }: { onAdded: () => void }) {
  const { t } = useI18n()
  const [files, setFiles] = React.useState<File[]>([])
  const [text, setText] = React.useState("")
  const [state, setState] = React.useState<"idle" | "sending" | "sent">("idle")
  const [error, setError] = React.useState<string | null>(null)
  const [over, setOver] = React.useState(false)
  const picker = React.useRef<HTMLInputElement>(null)
  const camera = React.useRef<HTMLInputElement>(null)

  const add = (list: FileList | null) => {
    if (list) setFiles((f) => [...f, ...Array.from(list)])
    setState("idle")
  }

  async function send() {
    setState("sending")
    setError(null)
    try {
      await ingest({ files, text })
      setFiles([])
      setText("")
      setState("sent")
      onAdded()
    } catch (e) {
      setError((e as Error).message)
      setState("idle")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          add(e.dataTransfer.files)
        }}
        className={cn(
          "flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground",
          over && "border-primary bg-muted"
        )}
      >
        <PaperclipIcon className="size-5" />
        <span>{t.inbox.drop}</span>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => picker.current?.click()}
          >
            <FileIcon data-icon="inline-start" />
            {t.inbox.choose}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => camera.current?.click()}
          >
            <CameraIcon data-icon="inline-start" />
            {t.inbox.camera}
          </Button>
        </div>
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          onChange={(e) => add(e.target.files)}
        />
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => add(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5"
            >
              <FileIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{f.name}</span>
              <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                {Math.ceil(f.size / 1024)} KB
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t.inbox.remove}
                onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <label className="flex flex-col gap-2 text-sm">
        <span className="text-muted-foreground">{t.inbox.text}</span>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.inbox.textPlaceholder}
          rows={3}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={send}
          disabled={state === "sending" || (!files.length && !text.trim())}
        >
          <UploadIcon data-icon="inline-start" />
          {state === "sending" ? t.inbox.sending : t.inbox.send}
        </Button>
        {files.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {t.inbox.selected(files.length)}
          </span>
        )}
        {state === "sent" && (
          <span className="text-sm text-status-done">{t.inbox.sent}</span>
        )}
        {error && <span className="text-sm text-status-overdue">{error}</span>}
      </div>
    </div>
  )
}
