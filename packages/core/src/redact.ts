/**
 * Redaction for text that leaves the machine through third parties (Telegram).
 * `||...||` marks personal data in the agent's answers and in case files; the patterns below
 * are a safety net for data the agent forgot to mark.
 */

export const MASK = "•••"

const PATTERNS: RegExp[] = [
  // IBAN (IT60X0542811101000000123456 and other countries, with or without spaces)
  /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/g,
  // Italian tax code (codice fiscale)
  /\b[A-Z]{6}\d{2}[A-EHLMPR-T]\d{2}[A-Z]\d{3}[A-Z]\b/gi,
  // Amounts in euro: € 1.234,56 · 1234.56 € · 120 euro · EUR 50
  /(?:€|\bEUR)\s?\d[\d.,']*\d?|\b\d[\d.,']*\s?(?:€|EUR\b|euro\b)/gi,
  // Card numbers
  /\b(?:\d[ -]?){13,19}\b/g,
  // Email addresses
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,
]

export function redact(text: string): string {
  let out = text.replace(/\|\|([\s\S]+?)\|\|/g, MASK)
  for (const p of PATTERNS) out = out.replace(p, MASK)
  return out
}

/** Remove the `||` markers, keeping the content (for places where it may be shown). */
export function unmark(text: string): string {
  return text.replace(/\|\|([\s\S]+?)\|\|/g, "$1")
}
