/** Shapes shared by the server, the web app and future native clients. */
import { z } from "zod"

import { SHIFTS } from "./holidays.ts"

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
  /** Moves each occurrence off weekends and holidays (`workday`, `tax`: see holidays.ts); `date` stays the nominal one. */
  shift: z.enum(SHIFTS),
  /** Last day that still counts: no occurrences after it (a deadline that ended, kept for history). */
  until: IsoDate.nullable(),
  severity: Severity,
  remind_days: z.array(z.number().int()),
  /** Amount of every occurrence; null when missing or "TODO". */
  amount: z.number().nullable(),
  /** Amounts of single occurrences, by date, taken from documents (bills, notices, receipts). */
  amounts: z.record(IsoDate, z.number()),
  /** Something to pay: an amount, `amount = "TODO"` (not known yet) or recorded amounts. */
  payment: z.boolean(),
  sensitive: z.boolean(),
  case: z.string().nullable(),
  notes: z.string(),
  source: z.string(),
  /** Category id in the finance source: preselected when a paid occurrence is recorded there. */
  finance_category: z.string().nullable(),
  /** Recurring template in the finance source that is this same payment: its projection is left out of future expenses. */
  finance_recurring: z.string().nullable(),
})
export type Deadline = z.infer<typeof Deadline>

/**
 * Where an occurrence's amount comes from: `known` (its own recorded amount, or the deadline's),
 * `estimate` (from the amounts recorded for other occurrences), `unknown` (a payment with no amount
 * to go by). null when the deadline is not a payment.
 */
export const AMOUNT_BASES = ["known", "estimate", "unknown"] as const
export const AmountBasis = z.enum(AMOUNT_BASES)
export type AmountBasis = z.infer<typeof AmountBasis>

export const Occurrence = z.object({
  /** `<id>@<date>`, the key used in state.json. */
  key: z.string(),
  id: z.string(),
  title: z.string(),
  area: z.string(),
  date: IsoDate,
  /** The nominal date when `shift` moved this occurrence off a weekend or holiday. */
  shifted_from: IsoDate.nullable(),
  days: z.number().int(),
  done_on: IsoDate.nullable(),
  repeat: z.string(),
  severity: Severity,
  /** This occurrence's amount, known or estimated (see amount_basis). */
  amount: z.number().nullable(),
  amount_basis: AmountBasis.nullable(),
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

/**
 * Sections of profile.toml edited from the web app (onboarding, profile view). Each section sent
 * replaces the one on disk, so clients send whole rows, unknown keys included. Empty strings are
 * left out; YYYY-MM-DD strings become TOML dates. `person.name` belongs to the account.
 */
const ProfileRow = z.record(z.string().max(60), z.union([z.string().max(500), z.number(), z.boolean(), z.null()]))
export const ProfileInput = z.object({
  person: ProfileRow.optional(),
  work: ProfileRow.optional(),
  property: z.array(ProfileRow).max(20).optional(),
  vehicle: z.array(ProfileRow).max(20).optional(),
})
export type ProfileInput = z.infer<typeof ProfileInput>

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
  /** Email only: marked Important in Gmail. Triaged first; other emails are paced. */
  important: z.boolean().default(false),
  /** Email only: newsletters and promotions, archived without going to the agent. */
  marketing: z.boolean().default(false),
})
export type InboxItem = z.infer<typeof InboxItem>

export const InboxDetail = InboxItem.extend({ content: z.string() })
export type InboxDetail = z.infer<typeof InboxDetail>

/**
 * Where a deadline (or a case line) comes from, for the details view: the email, inbox item or
 * file behind a `source` path, with its text and its files.
 */
export const SourceInfo = z.object({
  path: z.string(),
  kind: z.enum(["email", "inbox", "file", "folder"]),
  title: z.string(),
  from: z.string(),
  /** ISO date-time when it was sent or arrived, when known. */
  date: z.string().nullable(),
  /** Gmail mailbox name (gmail.toml) or the device/chat it came from. */
  account: z.string(),
  /** Opens the original outside the app (the message in Gmail). */
  link: z.string().nullable(),
  /** The email body or the item's text, cut at 20 000 characters. */
  text: z.string(),
  truncated: z.boolean(),
  /** Original files (data-relative), openable through /api/file. */
  files: z.array(z.string()),
})
export type SourceInfo = z.infer<typeof SourceInfo>

/** One entry of the Archive view: a filed email (archive/email/<folder>) or a document. */
export const ArchiveEntry = z.object({
  path: z.string(),
  kind: z.enum(["email", "file"]),
  title: z.string(),
  from: z.string(),
  date: z.string().nullable(),
  account: z.string(),
  /** Attachments of an email; 0 for a document. */
  files: z.number().int(),
})
export type ArchiveEntry = z.infer<typeof ArchiveEntry>

/**
 * The conversation a Gmail link points to (`scripts/gmail.py preview` / `fetch`): read from the
 * archive when it is there, else from the connected account that has it.
 */
export const GmailPreview = z.object({
  /** Mailbox name in gmail.toml. */
  account: z.string(),
  thread: z.string(),
  /** The first message's subject. */
  subject: z.string(),
  /** Sender, date and text of the latest message. */
  from: z.string(),
  date: z.string().nullable(),
  snippet: z.string(),
  messages: z.number().int(),
  attachments: z.array(z.string()),
  /** archive/email/<folder> of each message saved, oldest first (all of them after a fetch). */
  folders: z.array(z.string()),
  /** The conversation in Gmail's web app, in the mailbox that has it. */
  link: z.string().nullable(),
})
export type GmailPreview = z.infer<typeof GmailPreview>

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

/** Bearer tokens for shortcuts: they can only add documents to the inbox. */
export const SCOPES = ["ingest"] as const
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

/** A conversation in the history list: its first question stands for it. */
export const ChatSummary = z.object({
  id: z.string(),
  channel: z.enum(["web", "telegram"]),
  updated: z.string(),
  title: z.string(),
  messages: z.number(),
})
export type ChatSummary = z.infer<typeof ChatSummary>

// ---------- Account: the one user of this instance ----------

export const AUTH_MODES = ["dev", "prod"] as const

/** GET /api/session: what the web app shows first (onboarding, login or the register). */
export const Session = z.object({
  auth: z.enum(AUTH_MODES),
  /** The owner exists: the masterpass has been set. */
  owner: z.boolean(),
  authenticated: z.boolean(),
  user: z.object({ name: z.string(), onboarded: z.boolean() }).nullable(),
  /** The first setup needs the one-time code printed by the server (prod). */
  needsCode: z.boolean(),
})
export type Session = z.infer<typeof Session>

/** A browser logged in with the masterpass. */
export const AccountSession = z.object({
  id: z.string(),
  /** Guessed from the browser: iPhone, iPad, Mac, Windows, Android, browser. */
  name: z.string(),
  created: z.string(),
  last_seen: z.string(),
  current: z.boolean(),
})
export type AccountSession = z.infer<typeof AccountSession>

export const Status = z.object({
  version: z.string(),
  auth: z.enum(AUTH_MODES),
  claude: z.boolean(),
  /** Local speech to text for voice messages. */
  speech: z.boolean(),
  telegram: z.object({ enabled: z.boolean(), chats: z.number().int() }),
  /** Push notifications through ntfy: the server's host only, the topic stays on the server. */
  ntfy: z.object({ enabled: z.boolean(), host: z.string().nullable() }),
  gmail: z.array(z.object({ name: z.string(), connected: z.boolean() })),
  finance: z.object({ connected: z.boolean(), live: z.boolean(), synced_at: z.string().nullable() }),
  inbox: z.object({ new: z.number().int(), failed: z.number().int() }),
  jobs: z.array(z.object({ job: z.string(), last: JobRun.nullable(), next: z.string().nullable() })),
})
export type Status = z.infer<typeof Status>

/** Gmail mailbox names in gmail.toml and secrets/gmail/<name>.json (same rule as scripts/gmail.py). */
export const GMAIL_NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/
export const GMAIL_DEFAULT_QUERY = "-in:spam -in:trash -category:promotions newer_than:1y"
/** Where Google sends the browser back after sign-in, with a "Web application" OAuth client. */
export const GMAIL_REDIRECT_PATH = "/oauth/gmail"

export const GmailAccount = z.object({
  name: z.string(),
  query: z.string(),
  /** reconnect: the token belongs to an OAuth client that has been replaced since. */
  state: z.enum(["connected", "disconnected", "reconnect"]),
  /** The Gmail address, once signed in. */
  address: z.string().nullable(),
})
export type GmailAccount = z.infer<typeof GmailAccount>

export const GmailSetup = z.object({
  /** The OAuth client in secrets/credentials.json (its secret never leaves the server). */
  client: z
    .object({
      type: z.enum(["web", "installed"]),
      clientId: z.string(),
      project: z.string().nullable(),
      /** Redirect URIs listed in the downloaded file (web clients). */
      redirects: z.array(z.string()),
    })
    .nullable(),
  accounts: z.array(GmailAccount),
})
export type GmailSetup = z.infer<typeof GmailSetup>

export const GmailAccountInput = z.object({
  name: z.string().regex(GMAIL_NAME),
  query: z.string().trim().min(1).max(500),
})
export type GmailAccountInput = z.infer<typeof GmailAccountInput>

// ---------- Finance: mirror of a finance source (expenses, earnings), investments ----------

export const FINANCE_TYPES = ["expense", "earning"] as const
export const FinanceType = z.enum(FINANCE_TYPES)
export type FinanceType = z.infer<typeof FinanceType>

/** A transaction of the finance source, in the shape every connector returns (optional fields as null). */
export const FinanceTransaction = z.object({
  id: z.string(),
  date: IsoDate,
  amount: z.number(),
  description: z.string(),
  category: z.string(),
  type: FinanceType,
  tag: z.string().nullable(),
  recurringId: z.string().nullable(),
})
export type FinanceTransaction = z.infer<typeof FinanceTransaction>

export const FinanceCategory = z.object({
  id: z.string(),
  name: z.string(),
  type: FinanceType,
  color: z.string().nullable(),
  /** Left out of the monthly budget (savings transfers, reimbursements…). */
  excludeFromBudget: z.boolean(),
})
export type FinanceCategory = z.infer<typeof FinanceCategory>

export const FinanceTag = z.object({ id: z.string(), name: z.string(), color: z.string().nullable() })
export type FinanceTag = z.infer<typeof FinanceTag>

/** Monthly template: the finance source adds the transaction on `dayOfMonth` (clamped) after `lastPeriod`. */
export const FinanceRecurring = z.object({
  id: z.string(),
  description: z.string(),
  amount: z.number(),
  category: z.string(),
  type: FinanceType,
  tag: z.string().nullable(),
  dayOfMonth: z.number().int(),
  active: z.boolean(),
  /** Last month generated, YYYY-MM. */
  lastPeriod: z.string(),
})
export type FinanceRecurring = z.infer<typeof FinanceRecurring>

/** data/finance/mirror.json: the finance source's data as last synced. Server-owned. */
export const FinanceMirror = z.object({
  synced_at: z.string(),
  transactions: z.array(FinanceTransaction),
  categories: z.array(FinanceCategory),
  tags: z.array(FinanceTag),
  recurring: z.array(FinanceRecurring),
})
export type FinanceMirror = z.infer<typeof FinanceMirror>

export const FINANCE_CONNECTORS = ["http", "csv"] as const
export const FinanceConnectorKind = z.enum(FINANCE_CONNECTORS)
export type FinanceConnectorKind = z.infer<typeof FinanceConnectorKind>

/** What the connected source can do beyond being read. */
export const FinanceCapabilities = z.object({
  /** Paid occurrences can be recorded there as expenses (and deleted again). */
  write: z.boolean(),
  /** It tells the server about changes as they happen (otherwise the hourly sync picks them up). */
  live: z.boolean(),
  /** It has monthly recurring templates, projected into the future expenses. */
  recurring: z.boolean(),
})
export type FinanceCapabilities = z.infer<typeof FinanceCapabilities>

export const CSV_DATE_FORMATS = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY", "DD.MM.YYYY", "DD-MM-YYYY"] as const
const column = z.string().trim().min(1).max(100)

/** How to read the bank exports dropped in finance/import/: which column is which, and how numbers and dates are written. */
export const FinanceCsvMapping = z.object({
  date: column,
  amount: column,
  description: column,
  /** Left out when the export has no category column: everything is "Uncategorized". */
  category: column.optional(),
  delimiter: z.enum([",", ";", "\t"]).default(","),
  decimal: z.enum([".", ","]).default("."),
  date_format: z.enum(CSV_DATE_FORMATS).default("YYYY-MM-DD"),
  /** Most banks write expenses as negative amounts; some write them positive and earnings negative. */
  expense_sign: z.enum(["negative", "positive"]).default("negative"),
})
export type FinanceCsvMapping = z.infer<typeof FinanceCsvMapping>

/** The connection to the finance source, as the web app sees it (a token never leaves the server). */
export const FinanceSetup = z.object({
  /** null until something is connected. */
  connector: FinanceConnectorKind.nullable(),
  /** http: the finance server's address. */
  url: z.string().nullable(),
  /** csv: the column mapping. */
  csv: FinanceCsvMapping.nullable(),
  /** Ready to sync (http: address and token saved; csv: a mapping saved). */
  connected: z.boolean(),
  /** The change feed is open: edits show up within seconds. */
  live: z.boolean(),
  capabilities: FinanceCapabilities.nullable(),
  synced_at: z.string().nullable(),
  error: z.string().nullable(),
  counts: z.object({ transactions: z.number().int(), categories: z.number().int(), recurring: z.number().int() }),
})
export type FinanceSetup = z.infer<typeof FinanceSetup>

/** A bearer token: whatever the finance server issues, without spaces. */
export const FINANCE_TOKEN = /^\S{8,512}$/
export const FinanceConnectInput = z.discriminatedUnion("connector", [
  z.object({
    /** A server speaking the finance HTTP contract (docs/customize/finance-connector.md). */
    connector: z.literal("http"),
    url: z.url({ protocol: /^https?$/ }).max(300),
    /** Left out to keep the saved one (changing only the address). */
    token: z.string().trim().regex(FINANCE_TOKEN).optional(),
  }),
  z.object({
    /** Bank exports (CSV) dropped in finance/import/, read-only. */
    connector: z.literal("csv"),
    csv: FinanceCsvMapping,
  }),
])
export type FinanceConnectInput = z.infer<typeof FinanceConnectInput>

/** A paid occurrence recorded as an expense in the finance source. */
export const FinanceExpenseInput = z.object({
  key: z.string().regex(/^.+@\d{4}-\d{2}-\d{2}$/).max(200),
  date: IsoDate,
  amount: z.number().positive().max(10_000_000),
  category: z.string().min(1).max(100),
  description: z.string().max(200),
})
export type FinanceExpenseInput = z.infer<typeof FinanceExpenseInput>

/**
 * A transaction of the finance source that looks like the payment of an open occurrence: proposed to the
 * user, who marks the occurrence paid (linking it to that transaction) or dismisses it.
 */
export const PaymentMatch = z.object({
  id: z.string(),
  key: z.string(),
  title: z.string(),
  date: IsoDate,
  /** The occurrence's amount, known or estimated; null when unknown. */
  amount: z.number().nullable(),
  amount_basis: AmountBasis.nullable(),
  /** Why it matches: the source's recurring template, the amount, the category, words of the description. */
  reasons: z.array(z.enum(["recurring", "amount", "category", "words"])),
  transaction: FinanceTransaction.pick({ id: true, date: true, amount: true, description: true }),
})
export type PaymentMatch = z.infer<typeof PaymentMatch>

export const InvestmentPosition = z.object({
  name: z.string(),
  isin: z.string().nullable(),
  quantity: z.number().nullable(),
  /** Market value in euro on the snapshot's date. */
  value: z.number(),
  /** What was paid for it, when the broker shows it. */
  cost: z.number().nullable(),
})
export type InvestmentPosition = z.infer<typeof InvestmentPosition>

/** One `[[snapshot]]` of investments.toml: a broker's portfolio on a day, from a screenshot or an export. */
export const InvestmentSnapshot = z.object({
  date: IsoDate,
  broker: z.string(),
  cash: z.number(),
  positions: z.array(InvestmentPosition),
  source: z.string(),
})
export type InvestmentSnapshot = z.infer<typeof InvestmentSnapshot>

export const FinanceData = z.object({
  today: IsoDate,
  /** The finance source's change feed is open. */
  live: z.boolean(),
  /** Paid occurrences can be recorded in the finance source as expenses. */
  write: z.boolean(),
  mirror: FinanceMirror.nullable(),
  investments: z.array(InvestmentSnapshot),
  /** Occurrence key -> transaction id in the finance source, for paid occurrences recorded there. */
  links: z.record(z.string(), z.string()),
  /** Occurrence key -> transaction id already in the finance source that the user confirmed as its payment. */
  matched: z.record(z.string(), z.string()),
  /** Deadlines tied to the finance source (finance_category / finance_recurring set). */
  deadlines: z.array(z.object({ id: z.string(), finance_category: z.string().nullable(), finance_recurring: z.string().nullable() })),
})
export type FinanceData = z.infer<typeof FinanceData>

/** One limit window of the Claude subscription (`five_hour`, `seven_day`, `seven_day_opus`…), as Claude Code reports it. */
export const UsageWindow = z.object({
  id: z.string(),
  /** 0..1 of the window's allowance; null when Claude Code did not say. */
  utilization: z.number().nullable(),
  resets_at: z.string().nullable(),
})
export type UsageWindow = z.infer<typeof UsageWindow>

/** The subscription's limits as of the latest agent run (`rate_limit_event` in `claude -p` output). */
export const UsageLimits = z.object({
  at: z.string(),
  /** allowed, allowed_warning or rejected. */
  status: z.string(),
  windows: z.array(UsageWindow),
  overage: z.object({ status: z.string().nullable(), using: z.boolean() }),
})
export type UsageLimits = z.infer<typeof UsageLimits>

export const USAGE_SOURCES = ["chat", "telegram", "triage", "digest", "taxreturn", "rules"] as const
export type UsageSource = (typeof USAGE_SOURCES)[number]

/** One finished agent run: what it took, priced at API list rates by Claude Code (the subscription pays nothing extra). */
export const UsageRun = z.object({
  at: z.string(),
  source: z.enum(USAGE_SOURCES),
  cost: z.number().nullable(),
  duration_ms: z.number().nullable(),
  input: z.number().int(),
  output: z.number().int(),
  cache_read: z.number().int(),
  cache_write: z.number().int(),
  error: z.boolean(),
})
export type UsageRun = z.infer<typeof UsageRun>

/** data/usage.json (server-owned) and GET /api/usage: latest limits, their history, the agent's runs. */
export const Usage = z.object({
  limits: UsageLimits.nullable(),
  samples: z.array(z.object({ at: z.string(), windows: z.record(z.string(), z.number()) })),
  runs: z.array(UsageRun),
})
export type Usage = z.infer<typeof Usage>
