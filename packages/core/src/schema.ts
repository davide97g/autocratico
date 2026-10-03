/** Shapes shared by the server, the web app and future native clients. */
import { z } from "zod"

export const SEVERITIES = ["high", "medium", "low"] as const
export const Severity = z.enum(SEVERITIES)
export type Severity = z.infer<typeof Severity>

/** ISO date, YYYY-MM-DD. */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const Deadline = z.object({
  id: z.string().min(1),
  title: z.string(),
  area: z.string(),
  /** First occurrence; null when the date is still "TODO". */
  date: IsoDate.nullable(),
  repeat: z.string(),
  severity: Severity,
  remind_days: z.array(z.number().int()),
  amount: z.number().nullable(),
  sensitive: z.boolean(),
  case: z.string().nullable(),
  notes: z.string(),
  source: z.string(),
})
export type Deadline = z.infer<typeof Deadline>

export const Occurrence = z.object({
  /** `<id>@<date>`, the key used in state.json. */
  key: z.string(),
  id: z.string(),
  title: z.string(),
  area: z.string(),
  date: IsoDate,
  days: z.number().int(),
  done_on: IsoDate.nullable(),
  repeat: z.string(),
  severity: Severity,
  amount: z.number().nullable(),
  sensitive: z.boolean(),
  case: z.string().nullable(),
  notes: z.string(),
  source: z.string(),
})
export type Occurrence = z.infer<typeof Occurrence>

export const Incomplete = z.object({
  id: z.string(),
  title: z.string(),
  area: z.string(),
  severity: Severity,
  notes: z.string(),
})
export type Incomplete = z.infer<typeof Incomplete>

export const State = z.object({ done: z.record(z.string(), IsoDate) })
export type State = z.infer<typeof State>

export const Case = z.object({
  slug: z.string(),
  title: z.string(),
  status: z.string(),
  done: z.number().int(),
  total: z.number().int(),
  md: z.string(),
  /** Original files the case mentions (inbox/, archive/), folders expanded: data-relative paths. */
  documents: z.array(z.string()).default([]),
})
export type Case = z.infer<typeof Case>

export const CatalogEntry = z.object({ name: z.string(), title: z.string(), md: z.string() })
export type CatalogEntry = z.infer<typeof CatalogEntry>

export const Value = z.union([z.string(), z.number(), z.boolean(), z.null()])
export type Value = z.infer<typeof Value>
export const Profile = z.record(
  z.string(),
  z.union([z.record(z.string(), Value), z.array(z.record(z.string(), Value))])
)
export type Profile = z.infer<typeof Profile>

export const Data = z.object({
  today: IsoDate,
  agenda: z.array(Occurrence),
  incomplete: z.array(Incomplete),
  cases: z.array(Case),
  profile: Profile,
  catalog: z.array(CatalogEntry),
})
export type Data = z.infer<typeof Data>

// ---------- Inbox: everything that arrives, from any entry point ----------

export const INBOX_SOURCES = ["email", "telegram", "upload", "shortcut", "whatsapp", "chat"] as const
export const InboxSource = z.enum(INBOX_SOURCES)
export type InboxSource = z.infer<typeof InboxSource>

export const INBOX_STATUSES = ["new", "processing", "processed", "ignored", "failed"] as const
export const InboxStatus = z.enum(INBOX_STATUSES)
export type InboxStatus = z.infer<typeof InboxStatus>

/** Stored as `inbox/<folder>/item.json`, next to `content.md` and the attachments. */
export const InboxItem = z.object({
  id: z.string(),
  folder: z.string(),
  source: InboxSource,
  status: InboxStatus,
  /** ISO date-time when it reached autocratico. */
  received: z.string(),
  title: z.string(),
  from: z.string().default(""),
  /** Mailbox name for email, device name for uploads, chat for Telegram. */
  account: z.string().default(""),
  files: z.array(z.string()).default([]),
  /** For email: the folder in archive/email that holds the message. */
  ref: z.string().default(""),
  /** What the agent did with it, one line. */
  outcome: z.string().default(""),
})
export type InboxItem = z.infer<typeof InboxItem>

export const InboxDetail = InboxItem.extend({ content: z.string() })
export type InboxDetail = z.infer<typeof InboxDetail>

// ---------- Reminders ----------

/** A one-off reminder, set from the chat; sent on Telegram when due. Stored in reminders.json. */
export const Reminder = z.object({
  id: z.string(),
  /** ISO instant. */
  at: z.string(),
  text: z.string(),
  created: z.string(),
  /** Where it was asked: telegram, web. */
  source: z.string(),
  sent: z.string().nullable(),
})
export type Reminder = z.infer<typeof Reminder>

// ---------- Devices, jobs, chats ----------

export const SCOPES = ["full", "ingest"] as const
export const Scope = z.enum(SCOPES)
export type Scope = z.infer<typeof Scope>

export const Device = z.object({
  id: z.string(),
  name: z.string(),
  scope: Scope,
  created: z.string(),
  last_seen: z.string().nullable(),
})
export type Device = z.infer<typeof Device>

/** One thing the agent did during a run: a tool call (`tool` set) or a piece of its own text. */
export const JobStep = z.object({
  at: z.string(),
  tool: z.string().optional(),
  text: z.string(),
})
export type JobStep = z.infer<typeof JobStep>

export const JobRun = z.object({
  id: z.string(),
  job: z.string(),
  started: z.string(),
  finished: z.string().nullable(),
  ok: z.boolean().nullable(),
  summary: z.string(),
  /** Inbox items the run worked on (triage). */
  items: z.array(z.object({ id: z.string(), title: z.string() })).optional(),
  /** What the agent did (agent jobs only). */
  steps: z.array(JobStep).optional(),
})
export type JobRun = z.infer<typeof JobRun>

/** What the server is doing right now. */
export const LiveJobs = z.object({
  current: JobRun.nullable(),
  /** Jobs waiting for the current one to finish (they run one at a time). */
  waiting: z.array(z.string()),
  /** Triage scheduled for new inbox items: when, and how many are waiting. */
  triage: z.object({ at: z.string(), items: z.number().int() }).nullable(),
})
export type LiveJobs = z.infer<typeof LiveJobs>

export const Commit = z.object({
  hash: z.string(),
  date: z.string(),
  subject: z.string(),
  files: z.array(z.string()),
})
export type Commit = z.infer<typeof Commit>

export const Activity = z.object({ runs: z.array(JobRun), commits: z.array(Commit) })
export type Activity = z.infer<typeof Activity>

export const ChatEvent = z.discriminatedUnion("type", [
  /** First event of a web chat answer: the conversation it was saved in. */
  z.object({ type: z.literal("chat"), id: z.string() }),
  z.object({ type: z.literal("session"), id: z.string() }),
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("block") }),
  z.object({ type: z.literal("tool"), name: z.string(), detail: z.string() }),
  z.object({
    type: z.literal("end"),
    cost: z.number().nullable(),
    duration_ms: z.number().nullable(),
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
])
export type ChatEvent = z.infer<typeof ChatEvent>

export const ChatMessage = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  tools: z.array(z.object({ name: z.string(), detail: z.string() })).default([]),
  error: z.string().optional(),
})
export type ChatMessage = z.infer<typeof ChatMessage>

/** One conversation, shared by every client (web, Telegram). */
export const Chat = z.object({
  id: z.string(),
  /** Claude Code session id, to resume the conversation. */
  session: z.string().nullable(),
  channel: z.enum(["web", "telegram"]),
  updated: z.string(),
  messages: z.array(ChatMessage),
})
export type Chat = z.infer<typeof Chat>

export const Status = z.object({
  version: z.string(),
  auth: z.enum(["dev", "prod"]),
  claude: z.boolean(),
  /** Local speech to text for voice messages. */
  speech: z.boolean(),
  telegram: z.object({ enabled: z.boolean(), chats: z.number().int() }),
  gmail: z.array(z.object({ name: z.string(), connected: z.boolean() })),
  inbox: z.object({ new: z.number().int(), failed: z.number().int() }),
  jobs: z.array(z.object({ job: z.string(), last: JobRun.nullable(), next: z.string().nullable() })),
})
export type Status = z.infer<typeof Status>
