import type {
  Activity,
  Chat,
  Data,
  Device,
  InboxDetail,
  InboxItem,
  JobRun,
  LiveJobs,
  Reminder,
  Status,
} from "@autocratico/core"

export type {
  Activity,
  Case,
  CatalogEntry,
  Chat,
  Commit,
  Data,
  Device,
  InboxDetail,
  InboxItem,
  Incomplete,
  JobRun,
  JobStep,
  LiveJobs,
  Occurrence,
  Profile,
  Reminder,
  Status,
  Value,
} from "@autocratico/core"

export type Area =
  | "tax"
  | "home"
  | "vehicles"
  | "documents"
  | "health"
  | "social-security"
  | "bank"
  | "family"
  | "business"
  | (string & {})

/** Base address of the API: same origin for the web app; native shells can set it. */
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ""

/** The server answered 401: this browser is not paired yet. */
export class NotPaired extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(API_BASE + path, { credentials: "same-origin", ...init })
  const body = await r.json().catch(() => ({}))
  if (r.status === 401) throw new NotPaired(body.error ?? "not paired")
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`)
  return body as T
}

function post<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  return request<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export type Session = { paired: boolean; auth: "dev" | "prod"; device: Device | null }

export const session = () => request<Session>("/api/session")
export const pair = (code: string, name?: string) => post<{ device: Device }>("/api/pair", { code, name })

export const loadData = () => request<Data>("/api/data")

export async function markDone(key: string, done: boolean): Promise<string | null> {
  const { done_on } = await post<{ done_on: string | null }>("/api/done", { key, done })
  return done_on
}

export const chats = (channel?: Chat["channel"]) => request<Chat[]>(`/api/chats${channel ? `?channel=${channel}` : ""}`)
export const deleteChat = (id: string) => post<{ ok: boolean }>(`/api/chats/${id}`, undefined, "DELETE")

export const inbox = () => request<InboxItem[]>("/api/inbox")
export const inboxItem = (id: string) => request<InboxDetail>(`/api/inbox/${id}`)
export const inboxFileUrl = (id: string, name: string) => `${API_BASE}/api/inbox/${id}/files/${encodeURIComponent(name)}`
export const setInboxStatus = (id: string, status: "new" | "ignored") => post<{ ok: boolean }>(`/api/inbox/${id}/status`, { status })

export function ingest(n: { files: File[]; text: string; title?: string }): Promise<InboxItem> {
  const form = new FormData()
  for (const f of n.files) form.append("file", f, f.name)
  if (n.text.trim()) form.append("text", n.text)
  if (n.title) form.append("title", n.title)
  return request<InboxItem>("/api/ingest", { method: "POST", body: form })
}

export const activity = () => request<Activity>("/api/activity")
export const commitPatch = (hash: string) => request<{ patch: string }>(`/api/activity/${hash}`)
export const revertCommit = (hash: string) => post<{ hash: string }>(`/api/activity/${hash}/revert`)
export const runJob = (name: string) => post<JobRun>(`/api/jobs/${name}`)
export const liveJobs = () => request<LiveJobs>("/api/jobs/live")

export const status = () => request<Status>("/api/status")
export const devices = () => request<Device[]>("/api/devices")
export const createDevice = (name: string, scope: "full" | "ingest") =>
  post<{ code?: string; token?: string }>("/api/devices", { name, scope })
export const revokeDevice = (id: string) => post<{ ok: boolean }>(`/api/devices/${id}`, undefined, "DELETE")

export type TelegramChat = { id: number; name: string; paired: string }
export const telegramChats = () => request<TelegramChat[]>("/api/telegram/chats")
export const telegramPair = () => post<{ code: string; bot: string | null }>("/api/telegram/pair")
export const telegramUnpair = (id: number) => post<{ ok: boolean }>(`/api/telegram/chats/${id}`, undefined, "DELETE")

export const reminders = () => request<Reminder[]>("/api/reminders")
export const cancelReminder = (id: string) => post<{ ok: boolean }>(`/api/reminders/${id}`, undefined, "DELETE")
