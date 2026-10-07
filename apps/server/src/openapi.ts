/** OpenAPI document for clients (future native apps), built from the zod schemas in @autocratico/core. */
import {
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
  GmailAccountInput,
  GmailPreview,
  GmailSetup,
  InboxDetail,
  InboxItem,
  LiveJobs,
  PaymentMatch,
  ProfileInput,
  Session,
  SourceInfo,
  Status,
} from "@autocratico/core"
import { z } from "zod"

type Route = {
  method: "get" | "post" | "put" | "delete"
  path: string
  summary: string
  body?: z.ZodType
  response?: z.ZodType
  scope?: "ingest"
  /** Answers without a session (onboarding and login screens). */
  open?: boolean
}

const Ok = z.object({ ok: z.boolean() })

export const ROUTES: Route[] = [
  { method: "get", path: "/api/health", summary: "Liveness, no authentication", response: Ok, open: true },
  { method: "get", path: "/api/session", summary: "Whether the owner exists and this client is logged in", response: Session, open: true },
  { method: "post", path: "/api/setup", summary: "Create the owner (first run only) and log in; prod needs the setup code printed by the server", body: z.object({ name: z.string(), password: z.string(), code: z.string().optional() }), response: Ok, open: true },
  { method: "post", path: "/api/login", summary: "Log in with the masterpass (session cookie); 429 after too many wrong attempts", body: z.object({ password: z.string() }), response: Ok, open: true },
  { method: "post", path: "/api/logout", summary: "End this session", response: Ok },
  { method: "post", path: "/api/account/password", summary: "Change the masterpass, optionally logging out the other sessions", body: z.object({ current: z.string(), next: z.string(), revokeOthers: z.boolean().optional() }), response: Ok },
  { method: "post", path: "/api/account/name", summary: "Rename the owner (also person.name in profile.toml)", body: z.object({ name: z.string() }), response: Ok },
  { method: "post", path: "/api/account/onboarded", summary: "Mark the onboarding as done (or not)", body: z.object({ onboarded: z.boolean() }), response: Ok },
  { method: "get", path: "/api/account/sessions", summary: "Browsers logged in", response: z.array(AccountSession) },
  { method: "delete", path: "/api/account/sessions/{id}", summary: "Log a browser out", response: Ok },
  { method: "put", path: "/api/profile", summary: "Replace the sections sent of profile.toml (person.name excluded)", body: ProfileInput, response: Ok },
  { method: "get", path: "/api/data", summary: "Agenda, cases, profile and catalog", response: Data },
  { method: "post", path: "/api/done", summary: "Mark an occurrence as done or not", body: z.object({ key: z.string(), done: z.boolean() }), response: z.object({ key: z.string(), done_on: z.string().nullable() }) },
  { method: "post", path: "/api/chat", summary: "Ask the agent; streams NDJSON ChatEvent lines, first {type:'chat', id}", body: z.object({ message: z.string(), chat: z.string().nullable().optional(), view: z.string().optional(), locale: z.string().optional(), about: z.string().optional() }) },
  { method: "get", path: "/api/chats", summary: "Conversation history, newest first (?channel=web|telegram)", response: z.array(ChatSummary) },
  { method: "get", path: "/api/chats/{id}", summary: "One conversation with its messages", response: Chat },
  { method: "delete", path: "/api/chats/{id}", summary: "Delete a conversation", response: Ok },
  { method: "post", path: "/api/ingest", summary: "Add documents to the inbox: multipart (file fields, text, title) or JSON {text, title}", scope: "ingest", response: InboxItem },
  { method: "get", path: "/api/inbox", summary: "Inbox items, newest first", response: z.array(InboxItem) },
  { method: "get", path: "/api/inbox/{id}", summary: "One item with its text", response: InboxDetail },
  { method: "get", path: "/api/inbox/{id}/files/{name}", summary: "Download an attachment" },
  { method: "get", path: "/api/file", summary: "An original file from inbox/ or archive/ (?path=, ?as=view|thumb shows images inline)" },
  { method: "get", path: "/api/archive", summary: "Filed emails and documents in archive/, newest first", response: z.array(ArchiveEntry) },
  { method: "get", path: "/api/source", summary: "What a source path is (?path=inbox/… or archive/…): email with Gmail link, inbox item or file, with text and files", response: SourceInfo },
  { method: "post", path: "/api/inbox/{id}/status", summary: "Set an item to new (process again) or ignored", body: z.object({ status: z.enum(["new", "ignored"]) }), response: Ok },
  { method: "get", path: "/api/activity", summary: "Job runs and changes to the data", response: Activity },
  { method: "get", path: "/api/activity/{hash}", summary: "One change as a patch", response: z.object({ patch: z.string() }) },
  { method: "post", path: "/api/activity/{hash}/revert", summary: "Undo one change", response: z.object({ hash: z.string() }) },
  { method: "get", path: "/api/jobs/live", summary: "The job running now with the agent's steps so far, the queue, the next triage", response: LiveJobs },
  { method: "post", path: "/api/jobs/{name}", summary: "Run a job now (gmail, finance, triage, reminders, digest, backup)" },
  { method: "get", path: "/api/usage", summary: "Claude subscription limits (5-hour and weekly windows) from the latest agent run, their history and the agent's runs over the last 7 days" },
  { method: "get", path: "/api/status", summary: "Server, jobs and integrations", response: Status },
  { method: "get", path: "/api/gmail", summary: "Gmail setup: the OAuth client (without its secret) and the accounts", response: GmailSetup },
  { method: "put", path: "/api/gmail/client", summary: "Save the OAuth client JSON downloaded from Google Cloud (web or desktop)", body: z.object({ web: z.unknown().optional(), installed: z.unknown().optional() }), response: GmailSetup.shape.client },
  { method: "post", path: "/api/gmail/accounts", summary: "Add a Gmail account or change its query", body: GmailAccountInput, response: Ok },
  { method: "delete", path: "/api/gmail/accounts/{name}", summary: "Remove a Gmail account: revoke and delete its token", response: Ok },
  { method: "post", path: "/api/gmail/accounts/{name}/authorize", summary: "Start the Google sign-in for an account", response: z.object({ url: z.string(), type: z.enum(["web", "installed"]) }) },
  { method: "get", path: "/api/gmail/preview", summary: "What a Gmail link points to (?link=https://mail.google.com/…): subject, sender, text and attachments, from the archive or the connected account that has it; errors carry a code (not-a-link, unsupported, no-account, not-found, failed)", response: GmailPreview },
  { method: "post", path: "/api/gmail/complete", summary: "Finish the sign-in with the address Google returned to", body: z.object({ url: z.string() }), response: z.object({ name: z.string(), address: z.string() }) },
  { method: "get", path: "/api/finance", summary: "Connection to the finance source (connector, settings without the token, capabilities) and the last sync", response: FinanceSetup },
  { method: "put", path: "/api/finance", summary: "Connect a finance source: http (address and API token) or csv (column mapping); checked, then a full sync", body: FinanceConnectInput, response: FinanceSetup },
  { method: "delete", path: "/api/finance", summary: "Disconnect the finance source: forget its settings, token and synced data", response: Ok },
  { method: "get", path: "/api/finance/data", summary: "Synced transactions, categories and templates, investments, recorded occurrences", response: FinanceData },
  { method: "post", path: "/api/finance/sync", summary: "Re-read everything from the finance source now", response: z.object({ changed: z.boolean(), transactions: z.number() }) },
  { method: "post", path: "/api/finance/transactions", summary: "Record a paid occurrence as an expense in the finance source (connectors that can write)", body: FinanceExpenseInput, response: z.object({ id: z.string() }) },
  { method: "delete", path: "/api/finance/transactions/{key}", summary: "Delete the expense recorded for an occurrence", response: Ok },
  { method: "get", path: "/api/finance/matches", summary: "Transactions of the finance source that look like the payment of an open occurrence, waiting for an answer", response: z.array(PaymentMatch) },
  { method: "post", path: "/api/finance/matches/{id}", summary: "Answer a proposal: paid (marks the occurrence done, paid by that transaction) or dismiss (never proposed again)", body: z.object({ answer: z.enum(["paid", "dismiss"]) }), response: Ok },
  { method: "get", path: "/api/events", summary: "Server-sent events: `finance` {rev} when the synced data changes; `data`, `inbox`, `archive`, `activity`, `jobs`, `chats`, `reminders`, `usage` when that part changed; `ping` every 25 s" },
  { method: "get", path: "/api/devices", summary: "Ingest tokens for shortcuts", response: z.array(Device) },
  { method: "post", path: "/api/devices", summary: "Create an ingest token for a shortcut (shown once)", body: z.object({ name: z.string() }), response: z.object({ token: z.string() }) },
  { method: "delete", path: "/api/devices/{id}", summary: "Revoke an ingest token", response: Ok },
  { method: "post", path: "/api/telegram/pair", summary: "Create a code to pair a Telegram chat with /start <code>", response: z.object({ code: z.string(), bot: z.string().nullable() }) },
  { method: "delete", path: "/api/telegram/chats/{id}", summary: "Unpair a Telegram chat", response: Ok },
]

function schema(s: z.ZodType) {
  return z.toJSONSchema(s, { unrepresentable: "any", io: "output" })
}

export function openapi(version: string) {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const r of ROUTES) {
    const params = [...r.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }))
    paths[r.path] ??= {}
    paths[r.path][r.method] = {
      summary: r.summary,
      ...(params.length ? { parameters: params } : {}),
      ...(r.body ? { requestBody: { required: true, content: { "application/json": { schema: schema(r.body) } } } } : {}),
      responses: {
        200: r.response ? { description: "OK", content: { "application/json": { schema: schema(r.response) } } } : { description: "OK" },
        401: { description: "Not logged in, or Cloudflare Access token missing" },
      },
      ...(r.open ? { security: [] } : {}),
      ...(r.scope ? { "x-scope": r.scope, security: [{ session: [] }, { ingest: [] }] } : {}),
    }
  }
  return {
    openapi: "3.1.0",
    info: { title: "Autocratico API", version },
    components: {
      securitySchemes: {
        session: { type: "apiKey", in: "cookie", name: "autocratico.session_token", description: "Set by /api/login (__Secure- prefixed in prod)" },
        ingest: { type: "http", scheme: "bearer", description: "Ingest token from cli.ts token or Settings: /api/ingest only" },
      },
    },
    security: [{ session: [] }],
    paths,
  }
}
