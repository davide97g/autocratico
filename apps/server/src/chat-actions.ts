/**
 * Carries out what the read-only chat agent asked for in its answer (see core/actions.ts):
 * reminders and notes for the inbox. Returns one confirmation line per action, for the user.
 */
import { type Actions, extractActions } from "@autocratico/core"

import type { Inbox } from "./inbox.ts"
import type { Jobs } from "./jobs.ts"
import type { Reminders } from "./reminders.ts"

export const ACTION_INSTRUCTIONS = `You cannot change files, but the server acts on two kinds of blocks you put at the end of your answer:
- When the user asks to be reminded of something at a time ("in two hours", "tomorrow at 9", "on the 10th"): a block
\`\`\`reminder
{"at": "YYYY-MM-DDTHH:MM", "text": "<what to remember, short, in the user's language>"}
\`\`\`
with the local time (the zone of the current time given below). Reminders arrive on Telegram.
- When the user gives information to record in the register (a payment made, a notice received, a new date or amount, facts about a case): a block
\`\`\`inbox
{"title": "<short title>", "text": "<everything needed: what, dates, amounts, which deadline or case>"}
\`\`\`
The background agent files it within minutes: it updates deadlines.toml and cases, and marks paid deadlines as done.
Use them instead of telling the user to edit files. Write the block contents in plain text (no ||...||): the server needs them readable and masks personal data itself on Telegram. After the blocks, nothing else; before them, one short sentence saying what you set up.`

const TEXT = {
  it: {
    reminder: (when: string, text: string) => `⏰ Promemoria per ${when}: ${text}`,
    badTime: (at: string) => `⚠️ Non ho potuto impostare il promemoria: orario non valido (${at}).`,
    noTelegram: "⚠️ Promemoria non disponibili: il bot Telegram non è configurato.",
    inbox: (title: string) => `📥 Aggiunto all'inbox: ${title}. L'agente lo archivia tra poco.`,
  },
  en: {
    reminder: (when: string, text: string) => `⏰ Reminder for ${when}: ${text}`,
    badTime: (at: string) => `⚠️ Could not set the reminder: invalid time (${at}).`,
    noTelegram: "⚠️ Reminders are not available: the Telegram bot is not configured.",
    inbox: (title: string) => `📥 Added to the inbox: ${title}. The agent will file it shortly.`,
  },
}

type Deps = { reminders: Reminders; inbox: Inbox; jobs: Jobs | null; telegram: boolean; locale: "it" | "en" }

export async function applyActions(actions: Actions, source: string, from: string, d: Deps): Promise<string[]> {
  const t = TEXT[d.locale]
  const lines: string[] = []
  for (const r of actions.reminders) {
    if (!d.telegram) {
      lines.push(t.noTelegram)
      break
    }
    const saved = await d.reminders.add(r.at, r.text, source)
    lines.push(saved ? t.reminder(d.reminders.format(saved.at, d.locale), saved.text) : t.badTime(r.at))
  }
  for (const n of actions.inbox) {
    const item = await d.inbox.add({ source: "chat", title: n.title || n.text.slice(0, 60), text: n.text, from, account: source })
    lines.push(t.inbox(item.title))
  }
  if (actions.inbox.length) d.jobs?.queueTriage()
  return lines
}

/** Clean answer plus confirmations, after acting on its blocks. */
export async function finishAnswer(answer: string, source: string, from: string, d: Deps): Promise<string> {
  const { text, actions } = extractActions(answer)
  const lines = await applyActions(actions, source, from, d)
  return [text, lines.join("\n")].filter(Boolean).join("\n\n")
}
