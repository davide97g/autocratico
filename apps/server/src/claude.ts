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
import { relative } from "node:path"

import type { ChatEvent } from "@autocratico/core"

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
      ],
      denied: ["Edit", "Write", "NotebookEdit", ...secrets],
    }
  }
  // Server-owned files stay out of the agent's reach.
  const owned = ["state.json", "chats/**", "jobs/**", "inbox/*/item.json", ".git/**"].flatMap((p) => [
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
    ],
    denied: ["WebSearch", "WebFetch", "NotebookEdit", "Task", ...secrets, ...owned],
  }
}

const CHAT_INSTRUCTIONS = `You are answering in the chat of autocratico, the user's personal register of Italian bureaucracy (web app or Telegram).
- Be direct and brief; use simple Markdown (lists, bold, small tables).
- Read the data files (deadlines.toml, state.json, profile.toml, cases/, catalog/, notes/, inbox/) before answering about facts and dates.
- Wrap every piece of personal data in ||...|| (amounts, birth dates, addresses, document numbers, names of people): the web app hides them in privacy mode and Telegram never shows them.
- To read, use Read, Glob and Grep; the only command you may run is \`python3 scripts/upcoming.py [days]\`, on its own, without pipes or other commands.
- You are read-only: do not modify files. If a change is needed, say which file and what to change.
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
}

export class Claude {
  readonly config: Config

  constructor(config: Config) {
    this.config = config
  }

  get available(): boolean {
    return this.config.claude !== null
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
    const context = `\nToday is ${new Date().toISOString().slice(0, 10)}. The data is in ${data}. Always answer in ${language}.`
    const base = o.profile === "read" ? CHAT_INSTRUCTIONS : ""
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
    if (o.session && SESSION.test(o.session)) args.push("--resume", o.session)

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
    child.stdin.end(o.prompt)

    let finished = false
    let rest = ""
    try {
      for await (const chunk of child.stdout.setEncoding("utf8")) {
        rest += chunk
        const lines = rest.split("\n")
        rest = lines.pop() ?? ""
        for (const line of lines) {
          for (const e of translate(line, [data, root])) {
            if (e.type === "end") finished = true
            yield e
          }
        }
      }
      for (const e of translate(rest, [data, root])) {
        if (e.type === "end") finished = true
        yield e
      }
      const code = await exited
      if (!finished && !o.signal?.aborted) {
        const last = stderr.trim().split("\n").at(-1)
        yield { type: "error", message: last || `claude exited with code ${code}` }
      }
    } finally {
      kill()
      o.signal?.removeEventListener("abort", kill)
    }
  }

  /** Run to the end and return the final text (jobs, Telegram). */
  async complete(o: RunOptions): Promise<{ text: string; session: string | null; error: string | null }> {
    let text = ""
    let session: string | null = null
    let error: string | null = null
    for await (const e of this.run(o)) {
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
    if (e.is_error) yield { type: "error", message: String(e.result ?? e.subtype ?? "error") }
    yield { type: "end", cost: e.total_cost_usd ?? null, duration_ms: e.duration_ms ?? null }
  }
}
