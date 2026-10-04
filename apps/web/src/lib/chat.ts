import type { ChatEvent } from "@autocratico/core"

import { API_BASE, Unauthenticated } from "@/lib/api"

export type { ChatEvent }

/** Send a question to Claude Code through the server and read the NDJSON stream. */
export async function ask(
  request: { message: string; chat: string | null; view: string; locale: string },
  onEvent: (e: ChatEvent) => void,
  signal: AbortSignal
): Promise<void> {
  const r = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(request),
    signal,
  })
  if (r.status === 401) throw new Unauthenticated("not logged in")
  if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`)
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader()
  let rest = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    rest += value
    const lines = rest.split("\n")
    rest = lines.pop() ?? ""
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line))
  }
  if (rest.trim()) onEvent(JSON.parse(rest))
}
