import * as React from "react"
import { isDocumentPath } from "@autocratico/core"
import { ExternalLinkIcon, FileIcon, FolderIcon, GlobeIcon, InboxIcon, MailIcon, type LucideIcon } from "lucide-react"
import { cn } from "cn"

import { Documents } from "@/components/documents"
import { Sensitive, usePrivacy } from "@/components/privacy"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useI18n } from "@/i18n"
import { source as loadSource, type SourceInfo } from "@/lib/api"

const KIND_ICON: Record<SourceInfo["kind"], LucideIcon> = { email: MailIcon, inbox: InboxIcon, file: FileIcon, folder: FolderIcon }

/**
 * Where something comes from: the email (text, attachments, a link to it in Gmail), the inbox item,
 * the file, or the web page. `path` is a deadline's `source` or an archive path. `large` shows the
 * whole text at reading size, for a page of its own; `header={false}` only the text and the files,
 * under a card that already says what it is (a Gmail link in the chat).
 */
export function SourcePreview({ path, large = false, header = true, className }: { path: string; large?: boolean; header?: boolean; className?: string }) {
  const { t, locale } = useI18n()
  const { enabled: privacy } = usePrivacy()
  const web = /^https?:\/\//i.test(path)
  const [info, setInfo] = React.useState<SourceInfo | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    if (web || !isDocumentPath(path.replace(/\/+$/, ""))) return
    let live = true
    loadSource(path).then(
      (s) => live && setInfo(s),
      () => live && setFailed(true)
    )
    return () => {
      live = false
    }
  }, [path, web])

  if (web) {
    let host = path
    try {
      host = new URL(path).hostname
    } catch {
      // not a valid URL: show it as written
    }
    return (
      <div className={cn("flex items-center gap-3 rounded-lg bg-muted/50 p-3 text-sm", className)}>
        <GlobeIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{host}</span>
        <Button variant="secondary" size="sm" render={<a href={path} target="_blank" rel="noreferrer" />} nativeButton={false}>
          <ExternalLinkIcon data-icon="inline-start" />
          {t.sources.openPage}
        </Button>
      </div>
    )
  }
  if (failed || !isDocumentPath(path.replace(/\/+$/, ""))) {
    return <p className={cn("text-xs text-muted-foreground", className)}>{t.sources.missing(path)}</p>
  }
  if (!info) return <Skeleton className={cn("h-24 rounded-lg", className)} />

  const Icon = KIND_ICON[info.kind]
  const when = info.date && !Number.isNaN(Date.parse(info.date)) ? new Date(info.date).toLocaleString(locale === "it" ? "it-IT" : "en-GB", { dateStyle: "medium", timeStyle: "short" }) : null
  return (
    <div className={cn("flex min-w-0 flex-col gap-3 rounded-lg bg-muted/50 p-3", className)}>
      {header && (
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-card">
            <Icon className="size-4" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
            <span className="font-medium">
              <Sensitive>{info.title}</Sensitive>
            </span>
            <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
              <span>{t.sources.kinds[info.kind]}</span>
              {info.from && (
                <span className="min-w-0 truncate">
                  · <Sensitive>{info.from}</Sensitive>
                </span>
              )}
              {when && <span>· {when}</span>}
              {info.account && <span>· {info.account}</span>}
            </span>
            <span className="truncate font-mono text-[0.7rem] text-muted-foreground">{info.path}</span>
          </div>
          {info.link && (
            <Button variant="secondary" size="sm" className="shrink-0" render={<a href={info.link} target="_blank" rel="noreferrer" />} nativeButton={false}>
              <ExternalLinkIcon data-icon="inline-start" />
              {t.sources.openGmail}
            </Button>
          )}
        </div>
      )}
      {info.text &&
        (privacy ? (
          <p className="text-xs text-muted-foreground">{t.sources.textHidden}</p>
        ) : (
          <pre
            className={cn(
              "overflow-auto rounded-md bg-card font-sans leading-relaxed whitespace-pre-wrap",
              large ? "p-4 text-sm" : "max-h-72 p-3 text-xs"
            )}
          >
            {info.text}
            {info.truncated && `\n\n${t.sources.truncated}`}
          </pre>
        ))}
      {info.files.length > 0 && <Documents paths={info.files} />}
    </div>
  )
}
