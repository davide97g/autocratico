export type ChatEvent =
  | { type: "session"; id: string }
  | { type: "text"; text: string }
  | { type: "block" }
  | { type: "tool"; name: string; detail: string }
  | { type: "end"; cost: number | null; duration_ms: number | null }
  | { type: "error"; message: string }

/** Send a question to Claude Code through the local server and read the NDJSON stream. */
export async function ask(
  request: { message: string; session: string | null; view: string; locale: string },
  onEvent: (e: ChatEvent) => void,
  signal: AbortSignal
): Promise<void> {
  const r = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  })
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
