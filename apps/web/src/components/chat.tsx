import * as React from "react"
import {
  ArrowUpIcon,
  BellIcon,
  CalendarClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FilePenIcon,
  FilePlusIcon,
  FileTextIcon,
  GlobeIcon,
  InboxIcon,
  type LucideIcon,
  MessagesSquareIcon,
  SearchIcon,
  SparklesIcon,
  SquareIcon,
  SquarePenIcon,
  TerminalIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import { cn } from "cn"

import { Markdown } from "@/components/markdown"
import { Sensitive } from "@/components/privacy"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useI18n } from "@/i18n"
import { type Confirmation, splitConfirmations, stripActions } from "@autocratico/core"

import { chat as loadChat, chats, deleteChat, type ChatSummary, type Chat as SavedChat } from "@/lib/api"
import { ask, type ChatEvent } from "@/lib/chat"
import { holdUpdates } from "@/lib/update"

type Step = { name: string; detail: string }
type ClaudeMessage = {
  role: "claude"
  text: string
  steps: Step[]
  status: "running" | "done" | "error" | "interrupted"
  error?: string
  duration_ms?: number | null
}
type Message = { role: "user"; text: string } | ClaudeMessage
/** A deadline occurrence the conversation is about: its key goes to the server with every question. */
export type Topic = { key: string; title: string }
/** `chat` is the conversation saved on the server, shared by every device. */
type Conversation = { chat: string | null; messages: Message[]; about?: Topic }

const STORAGE_KEY = "autocratico.chat"
const TOPIC_EVENT = "autocratico:chat-about"
const EMPTY: Conversation = { chat: null, messages: [] }

/**
 * Starts a new conversation about a deadline. Saved first, so a chat that mounts afterwards
 * (the sheet on phones) opens on it; one already on screen hears the event.
 */
export function chatAbout(topic: Topic) {
  save({ chat: null, messages: [], about: topic })
  window.dispatchEvent(new Event(TOPIC_EVENT))
}

export const TOOL_ICONS: Record<string, LucideIcon> = {
  Read: FileTextIcon,
  Edit: FilePenIcon,
  Write: FilePlusIcon,
  Glob: SearchIcon,
  Grep: SearchIcon,
  WebSearch: GlobeIcon,
  WebFetch: GlobeIcon,
  Bash: TerminalIcon,
}

function fromServer(c: SavedChat): Conversation {
  return {
    chat: c.id,
    messages: c.messages.map((m) =>
      m.role === "user"
        ? { role: "user", text: m.text }
        : { role: "claude", text: m.text, steps: m.tools, status: m.error ? "error" : "done", error: m.error }
    ),
  }
}

/** Local copy, shown at once while the server's version loads (and when offline). */
function read(): Conversation {
  try {
    const c = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Conversation | null
    if (!c || !Array.isArray(c.messages) || !("chat" in c)) return EMPTY
    // An answer left halfway (page reloaded) won't resume.
    return {
      ...c,
      messages: c.messages.map((m) => (m.role === "claude" && m.status === "running" ? { ...m, status: "interrupted" } : m)),
    }
  } catch {
    return EMPTY
  }
}

function save(c: Conversation) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
  } catch {
    // storage unavailable: the chat stays in memory only
  }
}

// The Markdown component hides h1 (case titles): in the chat headings become h3.
const headings = (md: string) => md.replace(/^#{1,2} /gm, "### ")

function apply(c: Conversation, e: ChatEvent): Conversation {
  if (e.type === "chat") return { ...c, chat: e.id }
  if (e.type === "session") return c
  const messages = [...c.messages]
  const last = messages.at(-1)
  if (last?.role !== "claude") return c
  const m = { ...last }
  if (e.type === "text") m.text += e.text
  else if (e.type === "block" && m.text) m.text += "\n\n"
  else if (e.type === "tool") m.steps = [...m.steps, { name: e.name, detail: e.detail }]
  else if (e.type === "error") Object.assign(m, { status: "error", error: e.message })
  else if (e.type === "end" && m.status === "running") Object.assign(m, { status: "done", duration_ms: e.duration_ms })
  messages[messages.length - 1] = m
  return { ...c, messages }
}

function Steps({ steps, running }: { steps: Step[]; running: boolean }) {
  const { t } = useI18n()
  if (!steps.length) return null
  const visible = running ? steps.slice(-3) : steps
  const items = visible.map((s, i) => {
    const Icon = TOOL_ICONS[s.name] ?? TerminalIcon
    return (
      <li key={i} className="flex min-w-0 items-center gap-2">
        <Icon className="size-3.5 shrink-0" />
        <span className="shrink-0">{t.chat.tools[s.name] ?? s.name}</span>
        <span className="truncate font-mono text-[0.7rem]">{s.detail}</span>
      </li>
    )
  })
  if (running) return <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">{items}</ul>
  return (
    <details className="group text-xs text-muted-foreground">
      <summary className="cursor-pointer list-none select-none hover:text-foreground">
        {t.chat.steps(steps.length)}
        <span className="ml-1 group-open:hidden">· {t.chat.show}</span>
      </summary>
      <ul className="mt-2 flex flex-col gap-1.5">{items}</ul>
    </details>
  )
}

/** Plain text with personal data marked: `||...||` stays hidden in privacy mode. */
function Title({ text }: { text: string }) {
  return text.split(/\|\|(.+?)\|\|/).map((part, i) => (i % 2 ? <Sensitive key={i}>{part}</Sensitive> : part))
}

const CONFIRMATION_ICONS: Record<Confirmation["kind"], LucideIcon> = {
  change: FilePenIcon,
  reminder: BellIcon,
  inbox: InboxIcon,
  warning: TriangleAlertIcon,
}

/** Where a confirmation leads: the change in Activity, the inbox, the reminders in Settings. */
function confirmationLink(c: Confirmation): string | null {
  if (c.kind === "change") return c.hash ? `#activity/${c.hash}` : "#activity"
  if (c.kind === "inbox") return "#inbox"
  if (c.kind === "reminder") return "#settings"
  return null
}

/** What the server did after the answer, as a card that opens it. */
function ConfirmationCard({ c }: { c: Confirmation }) {
  const { t } = useI18n()
  const Icon = CONFIRMATION_ICONS[c.kind]
  const href = confirmationLink(c)
  const colon = c.text.indexOf(": ")
  const label = colon < 0 ? c.text : c.text.slice(0, colon)
  const body = colon < 0 ? null : c.text.slice(colon + 2)
  const warning = c.kind === "warning"
  const content = (
    <>
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md",
          warning ? "bg-status-overdue/12 text-status-overdue" : "bg-card text-foreground"
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("text-xs font-medium", warning ? "text-status-overdue" : "text-muted-foreground")}>{label}</span>
        {body && (
          <span className="text-sm leading-snug">
            <Title text={body} />
          </span>
        )}
      </span>
      {href && (
        <span className="flex shrink-0 items-center gap-1 self-center text-muted-foreground transition-colors group-hover:text-foreground">
          {c.hash && <span className="font-mono text-xs">{c.hash.slice(0, 7)}</span>}
          <ChevronRightIcon className="size-4" />
        </span>
      )}
    </>
  )
  const base = "flex items-start gap-3 rounded-lg bg-muted/60 p-2.5"
  if (!href) return <div className={base}>{content}</div>
  return (
    <a
      href={href}
      title={t.chat.openAction[c.kind]}
      className={cn(base, "group transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50")}
    >
      {content}
    </a>
  )
}

function Answer({ m }: { m: ClaudeMessage }) {
  const { t } = useI18n()
  const running = m.status === "running"
  const { text, confirmations } = splitConfirmations(stripActions(m.text))
  return (
    <div className="flex flex-col gap-3">
      <Steps steps={m.steps} running={running} />
      {m.text ? (
        <>
          {text && (
            <Markdown text={headings(text)} className="max-w-none [&_ol]:gap-1 [&_p]:my-1.5 [&_ul]:gap-1 [&>:first-child]:mt-0" />
          )}
          {confirmations.length > 0 && (
            <div className="flex flex-col gap-2">
              {confirmations.map((c, i) => (
                <ConfirmationCard key={i} c={c} />
              ))}
            </div>
          )}
        </>
      ) : (
        running && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-2 animate-pulse rounded-full bg-foreground" />
            {t.chat.thinking}
          </span>
        )
      )}
      {m.status === "error" && (
        <p className="rounded-md bg-status-overdue/12 px-3 py-2 text-xs text-status-overdue">{m.error}</p>
      )}
      {m.status === "interrupted" && <p className="text-xs text-muted-foreground">{t.chat.interrupted}</p>}
      {m.status === "done" && m.duration_ms != null && (
        <p className="text-xs text-muted-foreground">{t.chat.seconds(Math.max(1, Math.round(m.duration_ms / 1000)))}</p>
      )}
    </div>
  )
}

function History({
  current,
  onOpen,
  onDeleted,
}: {
  current: string | null
  onOpen: (id: string) => void
  onDeleted: (id: string) => void
}) {
  const { t, fmt } = useI18n()
  const [list, setList] = React.useState<ChatSummary[] | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [confirming, setConfirming] = React.useState<string | null>(null)

  React.useEffect(() => {
    chats("web").then(setList, () => setFailed(true))
  }, [])

  async function remove(id: string) {
    setConfirming(null)
    try {
      await deleteChat(id)
      setList((l) => l?.filter((c) => c.id !== id) ?? null)
      onDeleted(id)
    } catch {
      setFailed(true)
    }
  }

  if (failed) return <p className="text-sm text-muted-foreground">{t.chat.historyError}</p>
  if (!list) return null
  if (!list.length) return <p className="text-sm text-muted-foreground">{t.chat.historyEmpty}</p>
  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-xs font-medium text-muted-foreground">{t.chat.historyTitle}</p>
      <ul className="flex flex-col gap-1">
        {list.map((c) => (
          <li
            key={c.id}
            aria-current={c.id === current || undefined}
            className="group flex items-center gap-1 rounded-lg hover:bg-muted aria-current:bg-muted"
          >
            <button
              type="button"
              onClick={() => onOpen(c.id)}
              className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg px-3 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="truncate text-sm">
                <Title text={c.title} />
              </span>
              <span className="text-xs text-muted-foreground">
                {fmt.dayMonthTime.format(new Date(c.updated))}
                {c.id === current && ` · ${t.chat.current}`}
              </span>
            </button>
            {confirming === c.id ? (
              <span className="flex shrink-0 items-center gap-1 pr-1">
                <Button size="xs" variant="destructive" onClick={() => remove(c.id)}>
                  {t.chat.historyDeleteConfirm}
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setConfirming(null)}>
                  {t.chat.historyCancel}
                </Button>
              </span>
            ) : (
              <Button
                variant="ghost"
                size="icon-xs"
                className="mr-1 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                onClick={() => setConfirming(c.id)}
                aria-label={t.chat.historyDelete}
              >
                <Trash2Icon />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export const Chat = React.memo(function Chat({
  view,
  onClose,
  className,
  autoFocus = true,
}: {
  view: string
  onClose: () => void
  className?: string
  /** Off on touch screens, where focusing would cover the suggestions with the keyboard. */
  autoFocus?: boolean
}) {
  const { t, locale } = useI18n()
  const [conversation, setConversation] = React.useState<Conversation>(read)
  const [draft, setDraft] = React.useState("")
  const [abort, setAbort] = React.useState<AbortController | null>(null)
  const [history, setHistory] = React.useState(false)
  const bottom = React.useRef<HTMLDivElement>(null)
  const input = React.useRef<HTMLTextAreaElement>(null)

  // Block bodies: in recent Chrome scrollIntoView returns a Promise, which React would take for a cleanup.
  React.useEffect(() => {
    save(conversation)
  }, [conversation])
  React.useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" })
  }, [conversation.messages])
  React.useEffect(() => {
    if (autoFocus) input.current?.focus()
    // The latest web conversation, possibly started on another device.
    chats("web")
      .then(([latest]) => (latest ? loadChat(latest.id) : null))
      .then(
        (latest) =>
          setConversation((c) => {
            if (!latest || c.messages.some((m) => m.role === "claude" && m.status === "running")) return c
            // A conversation about a deadline that has not reached the server yet stays.
            if (c.about && c.chat !== latest.id) return c
            return { ...fromServer(latest), about: c.about }
          }),
        () => undefined
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on mount only
  }, [])
  // "Ask Claude" on a deadline while the chat is open.
  const abortRef = React.useRef(abort)
  React.useEffect(() => {
    abortRef.current = abort
  }, [abort])
  React.useEffect(() => {
    const onTopic = () => {
      abortRef.current?.abort()
      setConversation(read())
      input.current?.focus()
    }
    window.addEventListener(TOPIC_EVENT, onTopic)
    return () => window.removeEventListener(TOPIC_EVENT, onTopic)
  }, [])

  async function send(text: string) {
    const message = text.trim()
    if (!message || abort) return
    const controller = new AbortController()
    const release = holdUpdates() // a new build must not reload the page mid-answer
    setAbort(controller)
    setDraft("")
    const chat = conversation.chat
    const about = conversation.about?.key
    setConversation((c) => ({
      ...c,
      messages: [
        ...c.messages,
        { role: "user", text: message },
        { role: "claude", text: "", steps: [], status: "running" },
      ],
    }))
    try {
      await ask({ message, chat, view, locale, about }, (e) => setConversation((c) => apply(c, e)), controller.signal)
      setConversation((c) => apply(c, { type: "end", cost: null, duration_ms: null }))
    } catch (e) {
      const aborted = controller.signal.aborted
      setConversation((c) => {
        const last = c.messages.at(-1)
        if (last?.role !== "claude") return c
        const m: ClaudeMessage = aborted
          ? { ...last, status: "interrupted" }
          : { ...last, status: "error", error: t.chat.serverDown((e as Error).message) }
        return { ...c, messages: [...c.messages.slice(0, -1), m] }
      })
    } finally {
      setAbort(null)
      release()
    }
  }

  function startOver() {
    abort?.abort()
    setConversation(EMPTY)
    setHistory(false)
    input.current?.focus()
  }

  async function open(id: string) {
    setHistory(false)
    if (id === conversation.chat) return
    abort?.abort()
    try {
      setConversation(fromServer(await loadChat(id)))
    } catch (e) {
      setConversation({
        chat: null,
        messages: [{ role: "claude", text: "", steps: [], status: "error", error: t.chat.serverDown((e as Error).message) }],
      })
    }
    input.current?.focus()
  }

  return (
    <aside className={cn("flex min-h-0 flex-col rounded-xl bg-card", className)} aria-label={t.chat.title}>
      <header className="flex items-center gap-3 border-b p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <SparklesIcon className="size-4" />
        </span>
        <div className="mr-auto flex min-w-0 flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">{t.chat.title}</span>
          <span className="truncate text-xs text-muted-foreground">{t.chat.subtitle}</span>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setHistory((h) => !h)}
                aria-label={history ? t.chat.historyBack : t.chat.history}
                aria-pressed={history}
              />
            }
          >
            {history ? <ChevronLeftIcon /> : <MessagesSquareIcon />}
          </TooltipTrigger>
          <TooltipContent>{history ? t.chat.historyBack : t.chat.history}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" onClick={startOver} aria-label={t.chat.newChat} disabled={!conversation.messages.length} />
            }
          >
            <SquarePenIcon />
          </TooltipTrigger>
          <TooltipContent>{t.chat.newChatHint}</TooltipContent>
        </Tooltip>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={t.chat.close}>
          <XIcon />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-4 py-5">
        {history ? (
          <History
            current={conversation.chat}
            onOpen={open}
            onDeleted={(id) => {
              if (id === conversation.chat) setConversation(EMPTY)
            }}
          />
        ) : conversation.messages.length === 0 ? (
          <div className="flex h-full flex-col justify-end gap-5">
            <div className="flex flex-col gap-2">
              <p className="text-lg font-medium tracking-tight">{conversation.about ? t.chat.aboutTitle : t.chat.emptyTitle}</p>
              <p className="text-sm text-muted-foreground">{conversation.about ? t.chat.aboutBody : t.chat.emptyBody}</p>
            </div>
            <div className="flex flex-col gap-2">
              {(conversation.about ? t.chat.aboutSuggestions : t.chat.suggestions).map((s) => (
                <Button
                  key={s}
                  variant="secondary"
                  className="h-auto justify-start rounded-lg px-3 py-2.5 text-left whitespace-normal"
                  onClick={() => send(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {conversation.messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="ml-8 self-end rounded-lg bg-primary px-3.5 py-2.5 text-primary-foreground">
                  <Markdown text={m.text} className="[&_p]:my-0" />
                </div>
              ) : (
                <Answer key={i} m={m} />
              )
            )}
          </div>
        )}
        <div ref={bottom} />
      </div>

      <form
        className={cn("p-3 pt-0", history && "hidden")}
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
      >
        {conversation.about && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted/60 py-1 pr-1 pl-2.5 text-xs">
            <CalendarClockIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-muted-foreground">{t.chat.about}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{conversation.about.title}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setConversation((c) => ({ ...c, about: undefined }))}
              aria-label={t.chat.aboutRemove}
            >
              <XIcon />
            </Button>
          </div>
        )}
        <div className="flex items-end gap-2 rounded-lg bg-muted p-1.5 pl-3 focus-within:ring-3 focus-within:ring-ring/50">
          <textarea
            ref={input}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send(draft)
              }
            }}
            placeholder={t.chat.placeholder}
            enterKeyHint="send"
            aria-label={t.chat.inputLabel}
            className="field-sizing-content max-h-40 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-base outline-none placeholder:text-muted-foreground sm:text-sm"
          />
          {abort ? (
            <Button type="button" size="icon" onClick={() => abort.abort()} aria-label={t.chat.stop}>
              <SquareIcon className="fill-current" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!draft.trim()} aria-label={t.chat.send}>
              <ArrowUpIcon />
            </Button>
          )}
        </div>
        <p className="px-1 pt-2 text-xs text-muted-foreground pointer-coarse:hidden">{t.chat.hint}</p>
      </form>
    </aside>
  )
})
