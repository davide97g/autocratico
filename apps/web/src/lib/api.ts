import type {
  AccountSession,
  Activity,
  ArchiveEntry,
  Chat,
  ChatSummary,
  Data,
  Device,
  FinanceConnectInput,
  FinanceData,
  FinanceExpenseInput,
  FinanceSetup,
  PaymentMatch,
  GmailAccountInput,
  GmailPreview,
  GmailSetup,
  InboxDetail,
  InboxItem,
  JobRun,
  LiveJobs,
  ProfileInput,
  Reminder,
  Session,
  SourceInfo,
  Status,
  Usage,
} from "@autocratico/core"

export type {
  AccountSession,
  FinanceCategory,
  FinanceData,
  FinanceSetup,
  PaymentMatch,
  FinanceTransaction,
  GmailAccount,
  GmailPreview,
  GmailSetup,
  Activity,
  ArchiveEntry,
  Case,
  CatalogEntry,
  Chat,
  ChatSummary,
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
  ProfileInput,
  Reminder,
  Session,
  SourceInfo,
  Status,
  Usage,
  UsageRun,
  UsageSource,
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

/** The server answered 401: not logged in (or the session was revoked). */
export class Unauthenticated extends Error {}

/** An error answer, with its status and, for 429, the seconds to wait. */
export class ApiError extends Error {
  readonly status: number
  readonly retryAfter: number

  constructor(message: string, status: number, retryAfter = 0) {
    super(message)
    this.status = status
    this.retryAfter = retryAfter
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(API_BASE + path, { credentials: "same-origin", ...init })
  const body = await r.json().catch(() => ({}))
  if (r.status === 401 && !path.startsWith("/api/login") && !path.startsWith("/api/account/password")) {
    throw new Unauthenticated(body.error ?? "not logged in")
  }
  if (!r.ok) throw new ApiError(body.error ?? `HTTP ${r.status}`, r.status, body.retryAfter ?? 0)
  return body as T
}

function post<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  return request<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

type Ok = { ok: boolean }

export const session = () => request<Session>("/api/session")
export const setup = (n: { name: string; password: string; code?: string }) => post<Ok>("/api/setup", n)
export const login = (password: string) => post<Ok>("/api/login", { password })
export const logout = () => post<Ok>("/api/logout")
export const changePassword = (current: string, next: string, revokeOthers: boolean) =>
  post<Ok>("/api/account/password", { current, next, revokeOthers })
export const rename = (name: string) => post<Ok>("/api/account/name", { name })
export const setOnboarded = (onboarded: boolean) => post<Ok>("/api/account/onboarded", { onboarded })
export const sessions = () => request<AccountSession[]>("/api/account/sessions")
export const revokeSession = (id: string) => post<Ok>(`/api/account/sessions/${id}`, undefined, "DELETE")
export const saveProfile = (p: ProfileInput) => post<Ok>("/api/profile", p, "PUT")

export const loadData = () => request<Data>("/api/data")

export async function markDone(key: string, done: boolean): Promise<string | null> {
  const { done_on } = await post<{ done_on: string | null }>("/api/done", { key, done })
  return done_on
}

export const chats = (channel?: Chat["channel"]) => request<ChatSummary[]>(`/api/chats${channel ? `?channel=${channel}` : ""}`)
export const chat = (id: string) => request<Chat>(`/api/chats/${id}`)
export const deleteChat = (id: string) => post<{ ok: boolean }>(`/api/chats/${id}`, undefined, "DELETE")

export const inbox = () => request<InboxItem[]>("/api/inbox")
export const inboxItem = (id: string) => request<InboxDetail>(`/api/inbox/${id}`)
/** An original file (inbox/, archive/): `view` and `thumb` show images inline, otherwise a download. */
export const fileUrl = (path: string, as?: "view" | "thumb") =>
  fileUrlOverride?.(path) ?? `${API_BASE}/api/file?path=${encodeURIComponent(path)}${as ? `&as=${as}` : ""}`
let fileUrlOverride: ((path: string) => string) | null = null
/** The demo build draws its own made-up files in the page (src/demo): `<img>` and `<a>` never reach fetch. */
export function setFileUrl(f: (path: string) => string) {
  fileUrlOverride = f
}
export const isImage = (path: string) => /\.(jpe?g|png|webp|gif)$/i.test(path)
/** What a source path is (email, inbox item, file) with its text and files. */
export const source = (path: string) => request<SourceInfo>(`/api/source?path=${encodeURIComponent(path)}`)
export const archive = () => request<ArchiveEntry[]>("/api/archive")
/** What a Gmail link points to; an ApiError's status says why not (400, 404, 409, 422, 502). */
export const gmailPreview = (link: string) => request<GmailPreview>(`/api/gmail/preview?link=${encodeURIComponent(link)}`)
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

export const gmailSetup = () => request<GmailSetup>("/api/gmail")
/** The OAuth client JSON from Google Cloud: stored on the server, its secret never comes back. */
export const saveGmailClient = (file: unknown) => post<GmailSetup["client"]>("/api/gmail/client", file, "PUT")
export const saveGmailAccount = (a: GmailAccountInput) => post<Ok>("/api/gmail/accounts", a)
export const removeGmailAccount = (name: string) => post<Ok>(`/api/gmail/accounts/${encodeURIComponent(name)}`, undefined, "DELETE")
export const authorizeGmail = (name: string) =>
  post<{ url: string; type: "web" | "installed" }>(`/api/gmail/accounts/${encodeURIComponent(name)}/authorize`)
/** Finish the sign-in with the address Google sent the browser back to. */
export const completeGmail = (url: string) => post<{ name: string; address: string }>("/api/gmail/complete", { url })
export const devices = () => request<Device[]>("/api/devices")
export const createDevice = (name: string) => post<{ token: string }>("/api/devices", { name })
export const revokeDevice = (id: string) => post<{ ok: boolean }>(`/api/devices/${id}`, undefined, "DELETE")

export type TelegramChat = { id: number; name: string; paired: string }
export const telegramChats = () => request<TelegramChat[]>("/api/telegram/chats")
export const telegramPair = () => post<{ code: string; bot: string | null }>("/api/telegram/pair")
export const telegramUnpair = (id: number) => post<{ ok: boolean }>(`/api/telegram/chats/${id}`, undefined, "DELETE")

export const reminders = () => request<Reminder[]>("/api/reminders")
export const usage = () => request<Usage>("/api/usage")
export const cancelReminder = (id: string) => post<{ ok: boolean }>(`/api/reminders/${id}`, undefined, "DELETE")

export const financeSetup = () => request<FinanceSetup>("/api/finance")
/** The finance source (server address and token, or CSV columns): checked and kept on the server, a token never comes back. */
export const connectFinance = (c: FinanceConnectInput) => post<FinanceSetup>("/api/finance", c, "PUT")
export const disconnectFinance = () => post<Ok>("/api/finance", undefined, "DELETE")
export const financeData = () => request<FinanceData>("/api/finance/data")
export const syncFinance = () => post<{ changed: boolean; transactions: number }>("/api/finance/sync")
export const recordExpense = (e: FinanceExpenseInput) => post<{ id: string }>("/api/finance/transactions", e)
export const removeExpense = (key: string) => post<Ok>(`/api/finance/transactions/${encodeURIComponent(key)}`, undefined, "DELETE")
/** Transactions of the finance source that look like the payment of an open occurrence. */
export const paymentMatches = () => request<PaymentMatch[]>("/api/finance/matches")
export const answerMatch = (id: string, answer: "paid" | "dismiss") => post<Ok>(`/api/finance/matches/${id}`, { answer })
