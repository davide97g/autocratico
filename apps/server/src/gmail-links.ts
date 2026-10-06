/**
 * Gmail links pasted in the chat: what they point to (the preview card), and, when the message is
 * sent, the conversation saved in archive/email for the agent to read. Both run scripts/gmail.py
 * (`preview` / `fetch`) with the connected accounts' read-only tokens, which never leave it; the
 * browser gets only the preview's plain fields. The link is checked to be a Gmail address before
 * it reaches the script.
 */
import { execFile } from "node:child_process"

import { GmailPreview, gmailLinks } from "@autocratico/core"
import { z } from "zod"

import type { Config } from "./config.ts"
import { gmailLink, mailboxes } from "./sources.ts"

export const GMAIL_LINK_CODES = ["not-a-link", "unsupported", "no-account", "not-found", "failed"] as const
export type GmailLinkCode = (typeof GMAIL_LINK_CODES)[number]
const STATUS: Record<GmailLinkCode, 400 | 404 | 409 | 422 | 502> = { "not-a-link": 400, unsupported: 422, "no-account": 409, "not-found": 404, failed: 502 }
/** What the agent is told when a link could not be opened; it explains it to the user in their language. */
const REASONS: Record<GmailLinkCode, string> = {
  "not-a-link": "it does not point to one email",
  unsupported: "Gmail's API cannot open this kind of link (drafts, some sent messages): forwarding the email or pasting its text works",
  "no-account": "no Gmail account is connected (Settings → Gmail)",
  "not-found": "it is not in any connected Gmail account",
  failed: "Gmail did not answer",
}
const PREVIEW_TIMEOUT = 20_000
const FETCH_TIMEOUT = 120_000

export class GmailLinkError extends Error {
  readonly code: GmailLinkCode

  constructor(code: GmailLinkCode, message: string) {
    super(message)
    this.code = code
  }

  get status() {
    return STATUS[this.code]
  }
}

/** Runs scripts/gmail.py with these arguments; resolves with its output whatever the exit code. */
export type GmailScript = (args: string[], timeout: number) => Promise<{ ok: boolean; stdout: string; stderr: string }>

const Result = GmailPreview.omit({ link: true }).extend({
  mailbox: z.string().default(""),
  /** fetch: messages saved by this call. */
  new: z.number().int().optional(),
  /** fetch: Gmail could not be asked, this is the archive's copy. */
  stale: z.string().optional(),
})
export type GmailFetched = GmailPreview & { new?: number; stale?: string }

export function gmailScript(config: Config): GmailScript {
  return (args, timeout) =>
    new Promise((resolve) => {
      execFile(
        config.python,
        ["scripts/gmail.py", ...args],
        { cwd: config.root, env: { ...process.env, AUTOCRATICO_DATA: config.data }, timeout, maxBuffer: 4 * 1024 * 1024 },
        (error, stdout, stderr) => resolve({ ok: !error, stdout: String(stdout), stderr: String(stderr) })
      )
    })
}

export class GmailLinks {
  readonly #data: string
  readonly #script: GmailScript
  /** The same link asked twice at once (the composer and a sent message) runs the script once. */
  readonly #running = new Map<string, Promise<GmailFetched>>()

  constructor(data: string, script: GmailScript) {
    this.#data = data
    this.#script = script
  }

  /** What `link` points to, without saving it. */
  preview(link: string): Promise<GmailFetched> {
    return this.#once("preview", link, PREVIEW_TIMEOUT)
  }

  /** Saves the conversation in archive/email (the messages not there yet) and describes it. */
  fetch(link: string): Promise<GmailFetched> {
    return this.#once("fetch", link, FETCH_TIMEOUT)
  }

  #once(command: "preview" | "fetch", link: string, timeout: number): Promise<GmailFetched> {
    const key = `${command} ${link}`
    let running = this.#running.get(key)
    if (!running) {
      running = this.#call(command, link, timeout).finally(() => this.#running.delete(key))
      this.#running.set(key, running)
    }
    return running
  }

  async #call(command: "preview" | "fetch", link: string, timeout: number): Promise<GmailFetched> {
    // Only a Gmail address goes to the script, never something it could take for an option.
    if (gmailLinks(link)[0] !== link) throw new GmailLinkError("not-a-link", "not a link to a Gmail conversation")
    const r = await this.#script([command, "--json", link], timeout)
    let body: unknown = null
    try {
      body = JSON.parse(r.stdout.trim().split("\n").at(-1) ?? "")
    } catch {
      // no JSON: the script failed before answering (timeout, crash)
    }
    const failure = z.object({ error: z.string(), code: z.enum(GMAIL_LINK_CODES).catch("failed") }).safeParse(body)
    if (failure.success) throw new GmailLinkError(failure.data.code, failure.data.error)
    const result = Result.safeParse(body)
    if (!r.ok || !result.success) {
      throw new GmailLinkError("failed", r.stderr.trim().split("\n").at(-1) || (r.ok ? "unexpected answer from gmail.py" : "gmail.py did not finish"))
    }
    const { mailbox, ...rest } = result.data
    return { ...rest, link: gmailLink({ thread: rest.thread, mailbox, account: rest.account }, mailboxes(this.#data)) }
  }

  /**
   * The prompt for the agent: `message` followed by one note per Gmail link in it, saying where the
   * conversation was saved or why it could not be opened. `onStep` sees one step per link.
   */
  async prompt(message: string, onStep: (step: { name: string; detail: string }) => unknown): Promise<string> {
    const links = gmailLinks(message)
    if (!links.length) return message
    const notes: string[] = []
    for (const [i, link] of links.entries()) {
      const which = links.length > 1 ? `Gmail link ${i + 1}` : "The Gmail link"
      try {
        const r = await this.fetch(link)
        await onStep({ name: "Gmail", detail: r.folders.at(-1) ?? r.thread })
        const where = r.folders.map((f) => `${f}/`).join(", ")
        const stale = r.stale ? " Gmail could not be asked for newer messages: this is the copy already in the archive." : ""
        notes.push(`[Server: ${which} is the conversation from the "${r.account}" mailbox, saved in ${where} (oldest first; message.md and the attachments in each folder).${stale} Read it before answering.]`)
      } catch (e) {
        const error = e instanceof GmailLinkError ? e : new GmailLinkError("failed", (e as Error).message)
        if (error.code === "failed") console.error(`gmail link: ${error.message}`)
        await onStep({ name: "Gmail", detail: error.code })
        notes.push(`[Server: ${which} could not be opened: ${REASONS[error.code]}. Tell the user; do not guess what the email says.]`)
      }
    }
    return `${message}\n\n${notes.join("\n")}`
  }
}
