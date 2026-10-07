/**
 * Push notifications through ntfy (https://ntfy.sh, or a self-hosted ntfy server): the same messages
 * Telegram gets (reminders, triage summaries, digests, failures), as one POST to a topic URL.
 *
 * Security-sensitive: like Telegram, every text goes through redact() before it leaves, and nothing comes
 * back in. The topic URL acts as a password on a public server (anyone who knows it can read): pick a long
 * random topic, or self-host ntfy with an access token (NTFY_TOKEN).
 */
import { redact } from "@autocratico/core"

import type { Button, Notifier } from "./jobs.ts"

type Fetch = typeof fetch

/** ntfy's default message limit is 4096 bytes; longer ones become attachments, which we never want. */
const MAX_BYTES = 3900
const REQUEST_TIMEOUT_MS = 10_000

function cap(text: string): string {
  const bytes = new TextEncoder().encode(text)
  if (bytes.length <= MAX_BYTES) return text
  return `${new TextDecoder().decode(bytes.slice(0, MAX_BYTES)).replace(/�$/, "")}…`
}

export class Ntfy implements Notifier {
  readonly #url: string
  readonly #token: string | null
  readonly #origin: string | null
  readonly #fetch: Fetch

  constructor(settings: { url: string; token: string | null }, origin: string | null, fetcher: Fetch = fetch) {
    this.#url = settings.url
    this.#token = settings.token
    this.#origin = origin
    this.#fetch = fetcher
  }

  /** The server's host, for Settings: the topic stays on the server. */
  get host(): string {
    return new URL(this.#url).host
  }

  /**
   * Buttons are Telegram callbacks ("done", "snooze") that ntfy cannot send back: they become one "Open"
   * action to the web app when its public address is known.
   */
  async notify(text: string, buttons?: Button[][]): Promise<void> {
    const headers: Record<string, string> = { Title: "Autocratico", "Content-Type": "text/plain; charset=utf-8" }
    if (this.#token) headers.Authorization = `Bearer ${this.#token}`
    if (buttons?.length && this.#origin) headers.Actions = `view, Open, ${this.#origin}`
    try {
      const r = await this.#fetch(this.#url, {
        method: "POST",
        headers,
        body: cap(redact(text).trim() || "…"),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: "error",
      })
      if (!r.ok) console.error(`ntfy: HTTP ${r.status}`)
    } catch (e) {
      console.error(`ntfy: send failed: ${(e as Error).message}`)
    }
  }
}

/** One notifier over several channels; null when none is set up. */
export function fanOut(channels: (Notifier | null)[]): Notifier | null {
  const list = channels.filter((n): n is Notifier => n !== null)
  if (!list.length) return null
  return { notify: async (text, buttons) => void (await Promise.all(list.map((n) => n.notify(text, buttons)))) }
}
