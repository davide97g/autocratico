import * as React from "react"
import {
  CameraIcon,
  FileIcon,
  InboxIcon,
  MailIcon,
  MessageCircleIcon,
  MessageSquareTextIcon,
  PaperclipIcon,
  RotateCcwIcon,
  SendIcon,
  SmartphoneIcon,
  UploadIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import { cn } from "cn"

import { Documents } from "@/components/documents"
import { Markdown } from "@/components/markdown"
import { Sensitive, usePrivacy } from "@/components/privacy"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useI18n } from "@/i18n"
import {
  type InboxDetail,
  type InboxItem,
  inbox as loadInbox,
  inboxItem,
  ingest,
  setInboxStatus,
} from "@/lib/api"

const SOURCE_ICON: Record<string, LucideIcon> = {
  email: MailIcon,
  telegram: SendIcon,
  upload: UploadIcon,
  shortcut: SmartphoneIcon,
  whatsapp: MessageCircleIcon,
  chat: MessageSquareTextIcon,
}

const STATUS_STYLE: Record<string, string> = {
  new: "bg-status-soon/20 text-foreground",
  processing: "bg-status-soon/20 text-foreground",
  processed: "bg-status-done/12 text-status-done",
  ignored: "bg-muted text-muted-foreground",
  failed: "bg-status-overdue/12 text-status-overdue",
}

function AddCard({ onAdded }: { onAdded: () => void }) {
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
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-lg font-medium tracking-tight">{t.inbox.add}</CardTitle>
        <CardDescription>{t.inbox.addDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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
            <Button variant="secondary" size="sm" onClick={() => picker.current?.click()}>
              <FileIcon data-icon="inline-start" />
              {t.inbox.choose}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => camera.current?.click()}>
              <CameraIcon data-icon="inline-start" />
              {t.inbox.camera}
            </Button>
          </div>
          <input ref={picker} type="file" multiple hidden onChange={(e) => add(e.target.files)} />
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => add(e.target.files)} />
        </div>

        {files.length > 0 && (
          <ul className="flex flex-col gap-1.5 text-sm">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5">
                <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{f.name}</span>
                <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">{Math.ceil(f.size / 1024)} KB</span>
                <Button variant="ghost" size="icon-xs" aria-label={t.inbox.remove} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <label className="flex flex-col gap-2 text-sm">
          <span className="text-muted-foreground">{t.inbox.text}</span>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t.inbox.textPlaceholder} rows={3} />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={send} disabled={state === "sending" || (!files.length && !text.trim())}>
            <UploadIcon data-icon="inline-start" />
            {state === "sending" ? t.inbox.sending : t.inbox.send}
          </Button>
          {files.length > 0 && <span className="text-xs text-muted-foreground">{t.inbox.selected(files.length)}</span>}
          {state === "sent" && <span className="text-sm text-status-done">{t.inbox.sent}</span>}
          {error && <span className="text-sm text-status-overdue">{error}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

function Item({ item, onChange }: { item: InboxItem; onChange: () => void }) {
  const { t, fmt } = useI18n()
  const { enabled: privacy } = usePrivacy()
  const [detail, setDetail] = React.useState<InboxDetail | null>(null)
  const [open, setOpen] = React.useState(false)
  const Icon = SOURCE_ICON[item.source] ?? InboxIcon

  async function toggle() {
    if (!open && !detail) setDetail(await inboxItem(item.id))
    setOpen((o) => !o)
  }

  async function set(status: "new" | "ignored") {
    await setInboxStatus(item.id, status)
    onChange()
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-card">
          <Icon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm font-medium">
            <Sensitive>{item.title}</Sensitive>
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>{t.inbox.source[item.source] ?? item.source}</span>
            {item.from && (
              <span className="truncate">
                · <Sensitive>{item.from}</Sensitive>
              </span>
            )}
            <span>· {fmt.short.format(new Date(item.received))}</span>
          </span>
          {item.outcome && (
            <span className="text-xs">
              <Sensitive>{item.outcome}</Sensitive>
            </span>
          )}
        </div>
        <Badge variant="secondary" className={cn("shrink-0", STATUS_STYLE[item.status])}>
          {t.inbox.status[item.status] ?? item.status}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2 pl-12">
        <Button variant="ghost" size="xs" onClick={toggle}>
          {open ? t.inbox.hide : t.inbox.show}
        </Button>
        {(item.status === "failed" || item.status === "ignored" || item.status === "processed") && (
          <Button variant="ghost" size="xs" onClick={() => set("new")}>
            <RotateCcwIcon data-icon="inline-start" />
            {t.inbox.retry}
          </Button>
        )}
        {(item.status === "new" || item.status === "failed") && (
          <Button variant="ghost" size="xs" onClick={() => set("ignored")}>
            {t.inbox.ignore}
          </Button>
        )}
      </div>
      {open && detail && (
        <div className="flex flex-col gap-3 pl-12">
          <Documents paths={detail.files.map((f) => `inbox/${item.folder}/${f}`)} />
          {detail.content &&
            (privacy ? (
              <p className="text-xs text-muted-foreground">{t.privacy.hidden}</p>
            ) : (
              <Markdown text={detail.content.slice(0, 20_000)} className="max-h-96 max-w-none overflow-y-auto text-sm" />
            ))}
        </div>
      )}
    </li>
  )
}

export function Inbox() {
  const { t } = useI18n()
  const [items, setItems] = React.useState<InboxItem[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(() => {
    loadInbox().then(setItems, (e: Error) => setError(e.message))
  }, [])

  React.useEffect(() => {
    refresh()
    // Items change state while the agent works: poll gently while some are pending.
    const timer = setInterval(refresh, 15_000)
    return () => clearInterval(timer)
  }, [refresh])

  return (
    <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <AddCard onAdded={refresh} />
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-lg font-medium tracking-tight">{t.inbox.items}</CardTitle>
          <CardDescription>{t.inbox.itemsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-status-overdue">{error}</p>}
          {!items && !error && <Skeleton className="h-40 rounded-lg" />}
          {items?.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <InboxIcon />
                </EmptyMedia>
                <EmptyTitle>{t.inbox.emptyTitle}</EmptyTitle>
                <EmptyDescription>{t.inbox.emptyDescription}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {items && items.length > 0 && (
            <ul className="flex flex-col gap-2">
              {items.slice(0, 100).map((i) => (
                <Item key={i.id} item={i} onChange={refresh} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
