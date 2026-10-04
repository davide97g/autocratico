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
    documents: [],
  }
}

/** Still open: some checklist item left, or no checklist yet. Closed cases are hidden by default. */
export function caseOpen(c: Pick<Case, "done" | "total">): boolean {
  return c.total === 0 || c.done < c.total
}

// ---------- Original files: what arrived (inbox/) and what was filed (archive/) ----------

/** Server-owned or derived files that are not documents. */
const NOT_DOCUMENTS = new Set(["item.json", "content.md"])

/** A data-relative path the web app may open: inside inbox/ or archive/, no hidden or parent segments. */
export function isDocumentPath(path: string): boolean {
  const parts = path.replace(/\/+$/, "").split("/")
  return (
    (parts[0] === "inbox" || parts[0] === "archive") &&
    parts.length >= 2 &&
    parts.every((p) => p !== "" && !p.startsWith(".") && !p.includes("\\")) &&
    !NOT_DOCUMENTS.has(parts.at(-1)!)
  )
}

/** Paths to inbox/ and archive/ mentioned in a Markdown text (files or folders), in order. */
export function documentRefs(md: string): string[] {
  const refs = [...md.matchAll(/(?<![\w/.-])((?:inbox|archive)\/[^\s`'"()<>[\]|*]+)/g)].map((m) => m[1].replace(/[.,;:!?]+$/, ""))
  return [...new Set(refs)].filter(isDocumentPath)
}

/** Whether a path names a file the document views list (folders are expanded by the loader). */
export function isDocumentFile(name: string): boolean {
  return !name.startsWith(".") && !NOT_DOCUMENTS.has(name)
}

export function parseCatalogEntry(name: string, md: string): CatalogEntry {
  return { name, title: heading(md, name), md }
}
