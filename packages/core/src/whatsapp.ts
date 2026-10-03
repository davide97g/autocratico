/**
 * WhatsApp "Export chat" text files (`_chat.txt` in the zip, or `WhatsApp Chat with X.txt`).
 *
 * iOS:      [03/10/26, 14:05:12] Name: text        attachments: ‎<allegato: 00000012-PHOTO.jpg>
 * Android:  03/10/26, 14:05 - Name: text           attachments: IMG-2026.jpg (file allegato)
 * Dates are day/month/year (Italian and most European locales); the year may have 2 or 4 digits.
 */

export type WhatsAppMessage = {
  /** Local date-time, YYYY-MM-DDTHH:MM[:SS]. */
  at: string
  /** Empty for system messages ("Messages are end-to-end encrypted", "X added Y"). */
  author: string
  text: string
  attachment: string | null
}

export type WhatsAppChat = { messages: WhatsAppMessage[]; participants: string[] }

const MARKS = /[‎‏‪-‮⁦-⁩﻿]/g
const IOS = /^\[(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s?[AP]M)?\] ([\s\S]*)$/i
const ANDROID = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s?[AP]M)? - ([\s\S]*)$/i
const ATTACHED = [/^<(?:allegato|attached|adjunto|pièce jointe|anhang): (.+)>$/i, /^(.+?) \((?:file allegato|file attached|archivo adjunto)\)$/i]

function pad(n: string | number, size = 2) {
  return String(n).padStart(size, "0")
}

export function parseWhatsAppExport(text: string): WhatsAppChat {
  const messages: WhatsAppMessage[] = []
  for (const raw of text.replace(MARKS, "").split(/\r?\n/)) {
    const m = IOS.exec(raw) ?? ANDROID.exec(raw)
    if (!m) {
      const last = messages.at(-1)
      if (last) last.text += `\n${raw}`
      continue
    }
    const [, d, mo, y, h, mi, s, rest] = m
    const year = y.length === 2 ? `20${y}` : y
    const at = `${year}-${pad(mo)}-${pad(d)}T${pad(h)}:${mi}${s ? `:${s}` : ""}`
    const colon = rest.indexOf(": ")
    const author = colon > 0 && colon < 60 ? rest.slice(0, colon) : ""
    const body = (author ? rest.slice(colon + 2) : rest).trim()
    let attachment: string | null = null
    for (const p of ATTACHED) {
      const a = p.exec(body)
      if (a) attachment = a[1].trim()
    }
    messages.push({ at, author, text: attachment ? "" : body, attachment })
  }
  const participants = [...new Set(messages.map((m) => m.author).filter(Boolean))]
  return { messages, participants }
}

/** Markdown transcript for the agent: one line per message, attachments as file references. */
export function whatsappToMarkdown(chat: WhatsAppChat, title: string): string {
  const lines = [`# ${title}`, "", `Participants: ${chat.participants.join(", ") || "-"}`, ""]
  for (const m of chat.messages) {
    const who = m.author || "system"
    const what = m.attachment ? `[attachment: ${m.attachment}]` : m.text.replace(/\n/g, "\n  ")
    lines.push(`- ${m.at.replace("T", " ")} **${who}**: ${what}`)
  }
  return lines.join("\n") + "\n"
}
