/** Cases and catalog: Markdown files read as-is, with a few fields pulled out. */
import type { Case, CatalogEntry } from "./schema.ts"

function heading(md: string, fallback: string): string {
  const line = md.split(/\r?\n/).find((r) => r.startsWith("# "))
  return line ? line.slice(2).trim() : fallback
}

/** `cases/<slug>/README.md`: `# Title`, a `**Status:** ...` line, `- [ ]` checklist. */
export function parseCase(slug: string, md: string): Case {
  const status = /^\*\*Status:\*\*\s*(.+)$/m.exec(md)
  return {
    slug,
    title: heading(md, slug),
    status: status ? status[1].trim() : "",
    done: (md.match(/^\s*- \[x\]/gim) ?? []).length,
    total: (md.match(/^\s*- \[[ x]\]/gim) ?? []).length,
    md,
  }
}

export function parseCatalogEntry(name: string, md: string): CatalogEntry {
  return { name, title: heading(md, name), md }
}
