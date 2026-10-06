// The demo's network: requests to /api never leave the page. `fetch` is wrapped so the pretend server
// (router.ts) answers them, with a little latency, and EventSource is replaced by one that hears the
// demo's own changes. Everything else (fonts, the page itself, analytics after consent) goes out as usual.
import { subscribe } from "./bus"
import { handle } from "./router"
import { reducedMotion, sleep } from "./util"

const TOPICS = [
  "data",
  "inbox",
  "archive",
  "activity",
  "jobs",
  "chats",
  "reminders",
  "finance",
  "usage",
] as const

async function body(
  init: RequestInit | undefined,
  request: Request | null
): Promise<{ body: unknown; form: FormData | null }> {
  const raw = init?.body ?? null
  if (raw instanceof FormData) return { body: null, form: raw }
  if (typeof raw === "string") {
    try {
      return { body: JSON.parse(raw), form: null }
    } catch {
      return { body: null, form: null }
    }
  }
  if (request && request.method !== "GET" && request.method !== "HEAD") {
    const type = request.headers.get("content-type") ?? ""
    if (type.startsWith("multipart/form-data"))
      return { body: null, form: await request.formData() }
    return { body: await request.json().catch(() => null), form: null }
  }
  return { body: null, form: null }
}

export function installFetch() {
  const real = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : null
    const url = new URL(request ? request.url : String(input), location.href)
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/"))
      return real(input, init)
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase()
    const signal =
      init?.signal ?? request?.signal ?? new AbortController().signal
    // A real server takes a moment; writes a bit longer than reads.
    if (!reducedMotion())
      await sleep((method === "GET" ? 60 : 140) + Math.random() * 160)
    if (signal.aborted) throw new DOMException("aborted", "AbortError")
    return handle({ method, url, ...(await body(init, request)), signal })
  }
}

/** Server-sent events from the demo itself: `ready` at once, then a topic each time something changes. */
class DemoEventSource extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSED = 2
  readonly url: string
  readonly withCredentials: boolean
  readyState = 0
  onopen: ((e: Event) => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  #stop: () => void = () => undefined
  #real: EventSource | null = null

  constructor(url: string | URL, init?: EventSourceInit) {
    super()
    this.url = String(url)
    this.withCredentials = Boolean(init?.withCredentials)
    const target = new URL(this.url, location.href)
    if (
      target.origin !== location.origin ||
      target.pathname !== "/api/events"
    ) {
      // Not ours: a real connection, events passed through.
      const real = new RealEventSource(this.url, init)
      this.#real = real
      real.onopen = (e) => this.onopen?.(e)
      real.onmessage = (e) => this.onmessage?.(e)
      real.onerror = (e) => this.onerror?.(e)
      return
    }
    window.setTimeout(() => {
      if (this.readyState === 2) return
      this.readyState = 1
      this.onopen?.(new Event("open"))
      this.dispatchEvent(new Event("open"))
      this.dispatchEvent(new MessageEvent("ready", { data: "{}" }))
      this.#stop = subscribe((topic) => {
        if (
          this.readyState === 1 &&
          (TOPICS as readonly string[]).includes(topic)
        )
          this.dispatchEvent(new MessageEvent(topic, { data: "{}" }))
      })
    }, 120)
  }

  close() {
    this.readyState = 2
    this.#stop()
    this.#real?.close()
  }
}

const RealEventSource = window.EventSource

export function installEvents() {
  window.EventSource = DemoEventSource as unknown as typeof EventSource
}
