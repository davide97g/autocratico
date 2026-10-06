/**
 * Runs Claude Code headless (`claude -p`, the unmodified binary on the user's own subscription)
 * and translates its stream into simple events. Security-sensitive: the tool profiles below are
 * what stops a malicious email from making the agent write outside data/ or send data away.
 *
 * read    chat (web app, Telegram): read-only tools, WebFetch only to public bodies.
 * triage  background job on new inbox items: may edit files in the data folder, nothing else;
 *         no web access at all, since it reads untrusted content while holding write access.
 */
import { spawn } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { join, relative } from "node:path"

import { type ChatEvent, localNow } from "@autocratico/core"

import { ACTION_INSTRUCTIONS } from "./chat-actions.ts"
import type { Config } from "./config.ts"

// Pages Claude may open to check a rule. `*.x` needs Claude Code 2.1.172 or later.
export const DOMAINS = ["gov.it", "inps.it", "normattiva.it", "gazzettaufficiale.it", "europa.eu", "aci.it"]
export type Profile = "read" | "triage"
const LANGUAGES = { it: "Italian", en: "English" } as const
const SESSION = /^[0-9a-f-]{36}$/

// `//` marks an absolute path in Claude Code permission rules.
const abs = (p: string) => `/${p}`

export function tools(profile: Profile, data: string): { allowed: string[]; denied: string[] } {
  const secrets = [
    `Read(${abs(data)}/secrets/**)`,
    `Grep(${abs(data)}/secrets/**)`,
    `Glob(${abs(data)}/secrets/**)`,
    `Edit(${abs(data)}/secrets/**)`,
    `Write(${abs(data)}/secrets/**)`,
  ]
  if (profile === "read") {
    return {
      allowed: [
        "Read",
        "Glob",
        "Grep",
        "WebSearch",
        ...DOMAINS.flatMap((d) => [`WebFetch(domain:${d})`, `WebFetch(domain:*.${d})`]),
        "Bash(python3 scripts/upcoming.py:*)",
        "Bash(python3 scripts/when.py)",
        "Bash(python3 scripts/when.py:*)",
      ],
      denied: ["Edit", "Write", "NotebookEdit", ...secrets],
    }
  }
  // Server-owned files stay out of the agent's reach.
  const owned = ["state.json", "reminders.json", "chats/**", "jobs/**", "inbox/*/item.json", "finance/**", ".git/**"].flatMap((p) => [
    `Edit(${abs(data)}/${p})`,
    `Write(${abs(data)}/${p})`,
  ])
  return {
    allowed: [
      "Read",
      "Glob",
      "Grep",
      `Edit(${abs(data)}/**)`,
      `Write(${abs(data)}/**)`,
      "Bash(python3 scripts/upcoming.py:*)",
      "Bash(python3 scripts/ics.py)",
      "Bash(python3 scripts/when.py)",
      "Bash(python3 scripts/when.py:*)",
    ],
    denied: ["WebSearch", "WebFetch", "NotebookEdit", "Task", ...secrets, ...owned],
  }
}

const CHAT_INSTRUCTIONS = `You are answering in the chat of autocratico, the user's personal register of Italian bureaucracy (web app or Telegram).
- Be direct and brief; use simple Markdown (lists, bold, small tables).
- Read the data files (deadlines.toml, state.json, profile.toml, cases/, catalog/, notes/, inbox/) before answering about facts and dates. For spending and earnings read finance/summary.md (finance/mirror.json has each transaction); for investments, investments.toml.
- Wrap every piece of personal data in ||...|| (amounts, birth dates, addresses, document numbers, names of people): the web app hides them in privacy mode and Telegram never shows them.
- To read, use Read, Glob and Grep; the only commands you may run are \`python3 scripts/upcoming.py [days]\` and \`python3 scripts/when.py [WHEN ...]\`, typed exactly like that (AUTOCRATICO_DATA is already set): no prefixes, cd, absolute paths or pipes.
- You do know the date and time: each message starts with when it was sent. For date arithmetic (reminder times, "in 90 minutes", "monday at 9", days left until a date, daylight saving changes) run \`python3 scripts/when.py\` with the expressions, e.g. \`python3 scripts/when.py +90m, monday 09:00, 2026-10-16\`, and use its iso values; never say you cannot read the clock.
- Read also shows you images and PDFs: look at attachments in inbox/ and archive/ directly.
- Gmail links in the user's message are opened by the server before you answer, with the connected accounts: a [Server: ...] note after the message says which archive/email/ folders hold the conversation (message.md and its attachments), or why it could not be opened. Read those files; do not say you cannot open Gmail links. An email the user shares is new information: when it has deadlines, payments or case facts the register lacks, file it with an inbox block whose text names its folder.
- You are read-only: do not modify files yourself.
- Tell what is verified apart from what is inferred. Never send personal data to web searches.`

function detail(args: Record<string, unknown>, bases: string[]): string {
  for (const field of ["file_path", "pattern", "command", "query", "url", "path"]) {
    const v = args[field]
    if (typeof v === "string") {
      if (field !== "file_path") return v
      for (const b of bases) if (v.startsWith(`${b}/`)) return relative(b, v)
      return v
    }
  }
  return ""
}

export type RunOptions = {
  prompt: string
  profile: Profile
  session?: string | null
  /** Extra system instructions, after the profile's own. */
  instructions?: string
  locale?: string
  signal?: AbortSignal
  /** The answer may carry reminder/inbox blocks for the server (chat only). */
  actions?: boolean
}

/** Plain-language text for errors from `claude -p`, shown in the chat and on Telegram. */
export function friendlyError(message: string, locale: "it" | "en"): string {
  const it = locale === "it"
  if (/usage limit|rate.?limit|limit (reached|exceeded)|429|overloaded/i.test(message)) {
    return it
      ? "Limite di utilizzo dell'abbonamento Claude raggiunto: riprova più tardi."
      : "Claude subscription usage limit reached: try again later."
  }
  if (/401|unauthori[sz]ed|oauth|invalid api key|authentication|not logged in|\/login/i.test(message)) {
    return it
      ? "L'agente non è autenticato sul server: il token Claude va rinnovato (claude setup-token)."
      : "The agent is not signed in on the server: the Claude token needs renewing (claude setup-token)."
  }
  if (/max_turns/i.test(message)) {
    return it
      ? "La richiesta ha richiesto troppi passaggi: prova a dividerla in domande più semplici."
      : "That took too many steps: try splitting it into simpler questions."
  }
  if (/not found in PATH/i.test(message)) return it ? "L'agente non è installato su questo server." : "The agent is not installed on this server."
  return it
    ? "Non sono riuscito a rispondere per un errore dell'agente. Riprova; se succede ancora, /nuova riparte da zero."
    : "I couldn't answer because of an agent error. Try again; if it keeps happening, /nuova starts over."
}

export class Claude {
  readonly config: Config

  constructor(config: Config) {
    this.config = config
  }

  get available(): boolean {
    return this.config.claude !== null
  }

  /** Whether Claude Code still has this session on disk (resuming a missing one fails the whole run). */
  sessionExists(id: string): boolean {
    const projects = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects")
    try {
      return readdirSync(projects).some((dir) => existsSync(join(projects, dir, `${id}.jsonl`)))
    } catch {
      return false
    }
  }

  /** Yields: session {id} · text {text} · block · tool {name, detail} · end {cost, duration_ms} · error {message}. */
  async *run(o: RunOptions): AsyncGenerator<ChatEvent> {
    const executable = this.config.claude
    if (!executable) {
      yield { type: "error", message: "`claude` command not found in PATH." }
      return
    }
    const { data, root } = this.config
    const language = LANGUAGES[o.locale === "en" ? "en" : o.locale === "it" ? "it" : this.config.locale]
    const context = `\nCurrent local time: ${localNow(this.config.timeZone)} (${this.config.timeZone}). The data is in ${data}. Always answer in ${language}.`
    const base = o.profile === "read" ? [CHAT_INSTRUCTIONS, o.actions ? ACTION_INSTRUCTIONS : ""].filter(Boolean).join("\n\n") : ""
    const { allowed, denied } = tools(o.profile, data)
    const args = [
      "-p",
      "--output-format", "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--setting-sources", "project,local",
      "--permission-mode", "dontAsk",
      "--allowedTools", ...allowed,
      "--disallowedTools", ...denied,
      "--append-system-prompt", [base, o.instructions ?? "", context].filter(Boolean).join("\n\n"),
    ]
    if (relative(root, data).startsWith("..")) args.push("--add-dir", data)
    // A session lost (restart without the volume, unwritable config dir) starts a new one instead of failing.
    if (o.session && SESSION.test(o.session) && this.sessionExists(o.session)) args.push("--resume", o.session)

    const child = spawn(executable, args, {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: `autocratico-${o.profile}` },
    })
    const kill = () => child.exitCode === null && child.kill()
    o.signal?.addEventListener("abort", kill, { once: true })
    let stderr = ""
    child.stderr.setEncoding("utf8").on("data", (s: string) => (stderr = (stderr + s).slice(-4000)))
    const exited = new Promise<number | null>((resolve) => child.once("close", resolve))
    // The send time goes in the message itself, so a resumed conversation always has the current one.
    child.stdin.end(`[Sent ${localNow(this.config.timeZone)}, ${this.config.timeZone}]\n\n${o.prompt}`)

    let finished = false
    let failed = false
    let rest = ""
    try {
      for await (const chunk of child.stdout.setEncoding("utf8")) {
        rest += chunk
        const lines = rest.split("\n")
        rest = lines.pop() ?? ""
        for (const line of lines) {
          for (const e of translate(line, [data, root])) {
            if (e.type === "end") finished = true
            if (e.type === "error") {
              failed = true
              console.error(`claude (${o.profile}): ${e.message}`)
            }
            yield e
          }
        }
      }
      for (const e of translate(rest, [data, root])) {
        if (e.type === "end") finished = true
        if (e.type === "error") failed = true
        yield e
      }
      const code = await exited
      if (!finished && !o.signal?.aborted) {
        const last = stderr.trim().split("\n").at(-1)
        yield { type: "error", message: last || `claude exited with code ${code}` }
      }
      if (failed && stderr.trim()) console.error(`claude (${o.profile}): ${stderr.trim().split("\n").slice(-5).join(" | ")}`)
    } finally {
      kill()
      o.signal?.removeEventListener("abort", kill)
    }
  }

  /** Run to the end and return the final text (jobs, Telegram); `onEvent` sees every event on the way. */
  async complete(o: RunOptions, onEvent?: (e: ChatEvent) => void): Promise<{ text: string; session: string | null; error: string | null }> {
    let text = ""
    let session: string | null = null
    let error: string | null = null
    for await (const e of this.run(o)) {
      onEvent?.(e)
      if (e.type === "session") session = e.id
      else if (e.type === "text") text += e.text
      else if (e.type === "block" && text) text += "\n\n"
      else if (e.type === "error") error = e.message
    }
    return { text: text.trim(), session, error }
  }
}

function* translate(line: string, bases: string[]): Generator<ChatEvent> {
  if (!line.trim()) return
  let e: Record<string, any>
  try {
    e = JSON.parse(line)
  } catch {
    return
  }
  if (e.type === "system" && e.subtype === "init") {
    yield { type: "session", id: String(e.session_id) }
  } else if (e.type === "stream_event" && e.parent_tool_use_id == null) {
    const ev = e.event ?? {}
    if (ev.type === "content_block_start" && ev.content_block?.type === "text") yield { type: "block" }
    else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") yield { type: "text", text: String(ev.delta.text) }
  } else if (e.type === "assistant" && e.parent_tool_use_id == null) {
    for (const c of e.message?.content ?? []) {
      if (c.type === "tool_use") yield { type: "tool", name: String(c.name ?? ""), detail: detail(c.input ?? {}, bases) }
    }
  } else if (e.type === "result") {
    if (e.is_error) {
      const details = Array.isArray(e.errors) ? e.errors.map(String).join("; ") : ""
      yield { type: "error", message: [e.subtype, e.result, details].filter(Boolean).map(String).join(": ") || "error" }
    }
    yield { type: "end", cost: e.total_cost_usd ?? null, duration_ms: e.duration_ms ?? null }
  }
}
