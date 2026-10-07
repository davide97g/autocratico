/** Catalog entries (catalog/*.md): researched rules, each with the date it was last checked on official sources. */

/** The date in a `Last verified: YYYY-MM-DD` (or `Ultima verifica: …`) line, null when there is none. */
export function catalogVerified(md: string): string | null {
  return /^\s*(?:\*\*)?(?:last verified|ultima verifica)(?:\*\*)?\s*:\s*(?:\*\*)?\s*(\d{4}-\d{2}-\d{2})/im.exec(md)?.[1] ?? null
}
