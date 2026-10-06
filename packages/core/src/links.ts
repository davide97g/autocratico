/**
 * Links to Gmail conversations in a chat message. The server fetches them before the agent answers
 * (scripts/gmail.py fetch); the web app shows each one as a preview card.
 */

const GMAIL_URL = /https?:\/\/mail\.google\.com\/mail\/[^\s<>()[\]"'`]+/g
export const MAX_GMAIL_LINKS = 3

/** Whether the address names one conversation or message (#inbox/<id>, ?th=, ?permmsgid=), not just a Gmail page. */
function namesConversation(url: string): boolean {
  if (/[?&](th|permmsgid|permthid)=/.test(url)) return true
  const last = (url.split("#")[1] ?? "").split("?")[0].replace(/\/+$/, "").split("/").at(-1) ?? ""
  // Hex API ids, or the consonant-only names Gmail's web app uses (decoded by scripts/gmail.py).
  return /^[0-9a-f]{12,20}$/.test(last) || /^[BCDFGHJKLMNPQRSTVWXZbcdfghjklmnpqrstvwxz]{16,}$/.test(last)
}

/** The distinct Gmail links in `text` that name a conversation, in order, at most MAX_GMAIL_LINKS. Trailing punctuation is not part of a link. */
export function gmailLinks(text: string): string[] {
  const found = (text.match(GMAIL_URL) ?? []).map((u) => u.replace(/[.,;:!?]+$/, "")).filter(namesConversation)
  return [...new Set(found)].slice(0, MAX_GMAIL_LINKS)
}

/** `text` without its Gmail links (and the empty lines they leave), for showing the links as cards. */
export function withoutGmailLinks(text: string): string {
  let rest = text
  for (const link of gmailLinks(text)) rest = rest.split(link).join("")
  return rest.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim()
}
