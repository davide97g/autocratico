/**
 * Runs a custom widget's code (core/widgets.ts) in the sandbox page (public/sandbox/widget.html):
 * sandbox="allow-scripts" without allow-same-origin, so it gets an opaque origin, no cookies and no /api;
 * there the code runs in a worker under a CSP that blocks every connection, and what it draws is
 * sanitized before it reaches the page. The page receives only the
 * rows of the widget's own queries (amounts left out in privacy mode) and may ask back for three
 * things, each checked here: its height, opening part of the app, offering a question for the chat.
 * An export goes the other way: the app asks (`SandboxHandle.export`, from the Board's menu), the frame
 * answers once with a table and a picture, checked here too (core/exports.ts).
 */
import * as React from "react"
import { TriangleAlertIcon } from "lucide-react"
import { customData, type CustomWidgetInput, type ExportFormat, type ExportPicture, type ExportTable, needsFinance, PICTURE_FORMATS, SandboxMessage } from "@autocratico/core"
import { toast } from "sonner"

import { usePrivacy } from "@/components/privacy"
import { useI18n } from "@/i18n"
import { API_BASE } from "@/lib/api"
import { useBoard } from "@/lib/board"

const TOKENS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "muted",
  "muted-foreground",
  "border",
  "primary",
  "primary-foreground",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "money-out",
  "money-out-muted",
  "money-in",
  "status-overdue",
  "status-urgent",
  "status-soon",
  "status-done",
  "radius",
]
const MAX_HEIGHT = 900
/** How long an export waits for the frame (its worker gets 3 s, the picture the rest). */
const EXPORT_WAIT = 10_000

export type SandboxExport = { table: ExportTable | null; picture: ExportPicture | null }
/** What the Board asks a running custom widget: null when the frame did not answer in time. */
export type SandboxHandle = { export: (format: ExportFormat) => Promise<SandboxExport | null> }

/** The app's colors as the sandbox should see them, and whether it is dark. */
function readTheme(): { tokens: Record<string, string>; theme: "light" | "dark" } {
  const css = getComputedStyle(document.documentElement)
  const tokens = Object.fromEntries(TOKENS.map((t) => [`--${t}`, css.getPropertyValue(`--${t}`).trim()]).filter(([, v]) => v))
  return { tokens, theme: document.documentElement.classList.contains("dark") ? "dark" : "light" }
}

/** Changes of light/dark and palette (attributes on <html>). */
function useThemeVersion(): number {
  const [version, setVersion] = React.useState(0)
  React.useEffect(() => {
    const o = new MutationObserver(() => setVersion((v) => v + 1))
    o.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-palette", "style"] })
    return () => o.disconnect()
  }, [])
  return version
}

export function SandboxFrame({ widget, ref }: { widget: CustomWidgetInput; ref?: React.Ref<SandboxHandle> }) {
  const { t, locale } = useI18n()
  const { context, wantFinance, act } = useBoard()
  const { enabled: privacy } = usePrivacy()
  const themeVersion = useThemeVersion()
  const frame = React.useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = React.useState(120)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [navigated, setNavigated] = React.useState(false)
  const started = React.useRef(false)
  const ready = React.useRef(false)
  const loads = React.useRef(0)
  const exports = React.useRef(new Map<string, (answer: SandboxExport | null) => void>())

  const finance = React.useMemo(() => needsFinance(widget), [widget])
  React.useEffect(() => {
    if (finance) wantFinance()
  }, [finance, wantFinance])

  // What the frame gets: rebuilt when the data, privacy mode, language or theme change.
  const message = React.useMemo(() => {
    if (!context) return null
    void themeVersion
    return { data: customData(widget.data, context, privacy), today: context.data.today, locale, privacy, ...readTheme() }
  }, [widget.data, context, privacy, locale, themeVersion])
  const latest = React.useRef(message)
  React.useLayoutEffect(() => {
    latest.current = message
  })

  const send = React.useCallback((type: "init" | "update") => {
    const win = frame.current?.contentWindow
    const m = latest.current
    if (!win || !m) return
    // The frame's origin is opaque: "*" is the only target it answers to. It is still our page: a second
    // load (the code navigating away) stops everything below.
    win.postMessage(type === "init" ? { type, code: widget.code, ...m } : { type, ...m }, "*")
  }, [widget.code])

  React.useEffect(() => {
    if (started.current) send("update")
  }, [message, send])

  React.useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return
      const r = SandboxMessage.safeParse(e.data)
      if (!r.success) return
      const m = r.data
      if (m.type === "ready") {
        ready.current = true
        if (started.current || !latest.current) return
        started.current = true
        send("init")
      } else if (m.type === "export") {
        // Only an answer to a request of ours, once.
        const resolve = exports.current.get(m.id)
        exports.current.delete(m.id)
        resolve?.({ table: m.table, picture: m.picture })
      } else if (m.type === "resize") setHeight(Math.min(MAX_HEIGHT, Math.max(24, Math.ceil(m.height))))
      else if (m.type === "open") act(m.target)
      else if (m.type === "ask") {
        // Offered, never sent on its own: the user reads it first.
        toast(t.widgetCode.askTitle, { id: `ask-${widget.id}`, description: m.question, action: { label: t.widgetCode.askAction, onClick: () => act({ type: "ask", question: m.question }) } })
      } else setProblem(m.message === "unsupported" ? t.widgetCode.unsupported : m.message)
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [act, send, t, widget.id])

  // The register still loading when the frame said it was ready: start once there is something to send.
  React.useEffect(() => {
    if (message && ready.current && !started.current) {
      started.current = true
      send("init")
    }
  }, [message, send])

  React.useImperativeHandle(
    ref,
    () => ({
      export: (format) =>
        new Promise((resolve) => {
          const win = frame.current?.contentWindow
          if (!win || !started.current) return resolve(null)
          const id = crypto.randomUUID()
          const timer = setTimeout(() => {
            exports.current.delete(id)
            resolve(null)
          }, EXPORT_WAIT)
          exports.current.set(id, (answer) => {
            clearTimeout(timer)
            resolve(answer)
          })
          win.postMessage({ type: "export", id, format, picture: PICTURE_FORMATS.includes(format) }, "*")
        }),
    }),
    []
  )

  if (navigated) return <Problem text={t.widgetCode.navigated} />
  return (
    <div className="flex flex-col gap-2">
      <iframe
        ref={frame}
        // The same file on every install; served by the app's server (or the demo's nginx) with its own CSP.
        src={`${API_BASE}/sandbox/widget.html`}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        loading="lazy"
        title={widget.title}
        className="block w-full border-0 bg-transparent"
        height={height}
        onLoad={() => {
          loads.current += 1
          if (loads.current > 1) setNavigated(true)
        }}
      />
      {problem && <Problem text={problem} />}
    </div>
  )
}

function Problem({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-status-overdue/12 px-3 py-2 text-xs text-status-overdue">
      <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 break-words">{text}</span>
    </p>
  )
}
