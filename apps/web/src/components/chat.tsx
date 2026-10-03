import * as React from "react"
import {
  ArrowUpIcon,
  FileTextIcon,
  GlobeIcon,
  type LucideIcon,
  SearchIcon,
  SparklesIcon,
  SquareIcon,
  SquarePenIcon,
  TerminalIcon,
  XIcon,
} from "lucide-react"
import { cn } from "cn"

import { Markdown } from "@/components/markdown"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useI18n } from "@/i18n"
import { stripActions } from "@autocratico/core"

import { chats, type Chat as SavedChat } from "@/lib/api"
import { ask, type ChatEvent } from "@/lib/chat"

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
/** `chat` is the conversation saved on the server, shared by every device. */
type Conversation = { chat: string | null; messages: Message[] }

const STORAGE_KEY = "autocratico.chat"
const EMPTY: Conversation = { chat: null, messages: [] }

const TOOL_ICONS: Record<string, LucideIcon> = {
  Read: FileTextIcon,
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

function Answer({ m }: { m: ClaudeMessage }) {
  const { t } = useI18n()
  const running = m.status === "running"
  return (
    <div className="flex flex-col gap-3">
      <Steps steps={m.steps} running={running} />
      {m.text ? (
        <Markdown text={headings(stripActions(m.text))} className="max-w-none [&_ol]:gap-1 [&_p]:my-1.5 [&_ul]:gap-1 [&>:first-child]:mt-0" />
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

export function Chat({
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
    chats("web").then(
      ([latest]) => setConversation((c) => (latest && !c.messages.some((m) => m.role === "claude" && m.status === "running") ? fromServer(latest) : c)),
      () => undefined
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on mount only
  }, [])

  async function send(text: string) {
    const message = text.trim()
    if (!message || abort) return
    const controller = new AbortController()
    setAbort(controller)
    setDraft("")
    const chat = conversation.chat
    setConversation((c) => ({
      ...c,
      messages: [
        ...c.messages,
        { role: "user", text: message },
        { role: "claude", text: "", steps: [], status: "running" },
      ],
    }))
    try {
      await ask({ message, chat, view, locale }, (e) => setConversation((c) => apply(c, e)), controller.signal)
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
    }
  }

  function startOver() {
    abort?.abort()
    setConversation(EMPTY)
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
        {conversation.messages.length === 0 ? (
          <div className="flex h-full flex-col justify-end gap-5">
            <div className="flex flex-col gap-2">
              <p className="text-lg font-medium tracking-tight">{t.chat.emptyTitle}</p>
              <p className="text-sm text-muted-foreground">{t.chat.emptyBody}</p>
            </div>
            <div className="flex flex-col gap-2">
              {t.chat.suggestions.map((s) => (
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
        className="p-3 pt-0"
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
      >
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
}
