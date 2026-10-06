import * as React from "react"
import { ChevronDownIcon, ExternalLinkIcon, MailIcon, MailXIcon, PaperclipIcon } from "lucide-react"
import { cn } from "cn"

import { ShinyText } from "@/components/motion"
import { Sensitive, usePrivacy } from "@/components/privacy"
import { SourcePreview } from "@/components/source"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useI18n } from "@/i18n"
import { ApiError, gmailPreview, type GmailPreview } from "@/lib/api"

type State = { link: string; preview: GmailPreview } | { link: string; error: string }

/** The server's answer when a link can't be previewed, by status (see GET /api/gmail/preview). */
const CODES: Record<number, string> = { 400: "not-a-link", 404: "not-found", 409: "no-account", 422: "unsupported" }

/** Previews asked during this visit, by link: the composer and the sent message share one request. */
const cache = new Map<string, Promise<GmailPreview>>()
const listeners = new Set<() => void>()

/** Asks again for these links' previews: once sent, their conversations are in the archive. */
export function refreshGmailPreviews(links: string[]) {
  if (!links.length) return
  for (const l of links) cache.delete(l)
  for (const f of listeners) f()
}

function load(link: string): Promise<GmailPreview> {
  let p = cache.get(link)
  if (!p) {
    const asked = gmailPreview(link)
    cache.set(link, asked)
    // A failure is asked again later: an account connected meanwhile, Gmail reachable again.
    asked.catch(() => setTimeout(() => cache.get(link) === asked && cache.delete(link), 30_000))
    p = asked
  }
  return p
}

function useGmailPreview(link: string): State | null {
  const [state, setState] = React.useState<State | null>(null)
  const [round, setRound] = React.useState(0)
  React.useEffect(() => {
    const again = () => setRound((r) => r + 1)
    listeners.add(again)
    return () => void listeners.delete(again)
  }, [])
  React.useEffect(() => {
    let live = true
    load(link).then(
      (preview) => live && setState({ link, preview }),
      (e) => live && setState({ link, error: e instanceof ApiError ? (CODES[e.status] ?? "failed") : "failed" })
    )
    return () => {
      live = false
    }
  }, [link, round])
  return state?.link === link ? state : null
}

/** `"Name" <a@b.it>` → Name. */
const senderName = (from: string) => from.replace(/\s*<[^>]*>\s*$/, "").replace(/^"(.*)"$/, "$1").trim() || from

function OpenInGmail({ href }: { href: string }) {
  const { t } = useI18n()
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="m-1.5 shrink-0 text-muted-foreground"
      render={<a href={href} target="_blank" rel="noreferrer" />}
      nativeButton={false}
      aria-label={t.chat.gmail.open}
      title={t.chat.gmail.open}
    >
      <ExternalLinkIcon />
    </Button>
  )
}

const CARD = "flex w-full min-w-0 items-start rounded-lg bg-muted/60"
const ICON = "flex size-8 shrink-0 items-center justify-center rounded-md bg-card"

/**
 * A Gmail link as a card: subject, sender, date, the start of the text and the attachments.
 * `expandable` (a sent message, whose conversation is saved) opens the email in place;
 * `hint` is a line under it (in the composer: Claude reads it on send).
 */
export function GmailLinkCard({ link, expandable = false, hint, className }: { link: string; expandable?: boolean; hint?: string; className?: string }) {
  const { t, fmt } = useI18n()
  const { enabled: privacy } = usePrivacy()
  const state = useGmailPreview(link)
  const [open, setOpen] = React.useState(false)

  if (!state) {
    return (
      <div className={cn(CARD, "gap-3 p-2.5", className)} aria-busy>
        <span className={ICON}>
          <MailIcon className="size-4 text-muted-foreground" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
          <ShinyText className="text-xs">{t.chat.gmail.opening}</ShinyText>
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </span>
      </div>
    )
  }

  if ("error" in state) {
    return (
      <div className={cn(CARD, "rise-in", className)}>
        <span className="flex min-w-0 flex-1 items-start gap-3 p-2.5">
          <span className={ICON}>
            <MailXIcon className="size-4 text-muted-foreground" />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs font-medium text-muted-foreground">{t.chat.gmail.label}</span>
            <span className="text-sm leading-snug">
              {t.chat.gmail.errors[state.error] ?? t.chat.gmail.errors.failed}
              {state.error === "no-account" && (
                <>
                  {" "}
                  <a href="#settings" className="underline underline-offset-2 hover:text-foreground">
                    {t.chat.gmail.settings}
                  </a>
                </>
              )}
            </span>
          </span>
        </span>
        <OpenInGmail href={link} />
      </div>
    )
  }

  const p = state.preview
  const saved = p.folders.at(-1)
  const when = p.date && !Number.isNaN(Date.parse(p.date)) ? fmt.dayMonthTime.format(new Date(p.date)) : null
  const canOpen = expandable && saved !== undefined
  const content = (
    <>
      <span className={ICON}>
        <MailIcon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span>{t.chat.gmail.label}</span>
          {p.account && <span>· {p.account}</span>}
          {p.messages > 1 && <span>· {t.chat.gmail.messages(p.messages)}</span>}
        </span>
        <span className="line-clamp-2 text-sm leading-snug font-medium">
          <Sensitive>{p.subject || t.chat.gmail.noSubject}</Sensitive>
        </span>
        <span className="flex min-w-0 gap-1 text-xs text-muted-foreground">
          {p.from && (
            <span className="min-w-0 truncate">
              <Sensitive>{senderName(p.from)}</Sensitive>
            </span>
          )}
          {when && (
            <span className="shrink-0">
              {p.from && "· "}
              {when}
            </span>
          )}
        </span>
        {p.snippet && !privacy && <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{p.snippet}</span>}
        {p.attachments.length > 0 && (
          <span className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <PaperclipIcon className="size-3 shrink-0" />
            <span className="shrink-0">{t.chat.gmail.attachments(p.attachments.length)}</span>
            <span className="min-w-0 truncate">
              · <Sensitive>{p.attachments.join(", ")}</Sensitive>
            </span>
          </span>
        )}
        {hint && <span className="mt-1 text-xs text-muted-foreground">{hint}</span>}
      </span>
      {canOpen && <ChevronDownIcon className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />}
    </>
  )
  const main = "flex min-w-0 flex-1 items-start gap-3 rounded-lg p-2.5 text-left"
  return (
    <div className={cn("rise-in flex min-w-0 flex-col gap-2", className)}>
      <div className={CARD}>
        {canOpen ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            title={open ? t.chat.gmail.hide : t.chat.gmail.read}
            className={cn(main, "transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50")}
          >
            {content}
          </button>
        ) : (
          <div className={main}>{content}</div>
        )}
        <OpenInGmail href={p.link ?? link} />
      </div>
      {open && saved && <SourcePreview path={saved} header={false} className="rise-in" />}
    </div>
  )
}
