/**
 * Forms the chat agent fills in for the user: a PDF it was given (a supplier's data sheet, an
 * application, a consent) comes back filled, to download, check, sign and send.
 *
 * The agent reads the form's layout (`node apps/server/src/form-layout.ts PATH`, which prints
 * `layoutText`), then writes a block at the end of its answer:
 * ```form
 * {"source": "chats/files/.../form.pdf", "fields": [
 *   {"blank": "p1.3", "text": "Via Roma 1"},
 *   {"field": "Nome", "value": "Mario"},
 *   {"page": 2, "x": 80, "y": 700, "text": "26/10/2026"},
 *   {"page": 1, "x": 52, "y": 300, "check": true}]}
 * ```
 * The server fills it (apps/server/src/forms.ts) and keeps a ```filled block in the answer, which
 * the web chat shows as the new PDF. Nothing is signed or sent: the user does that.
 *
 * Coordinates are PDF points from the top-left corner of the page as shown, y on the text baseline.
 */

/** A run of text on a page, as the PDF draws it. */
export type TextRun = { x: number; y: number; w: number; size: number; text: string }
export type FormPage = { width: number; height: number; runs: TextRun[] }
/** A field of a fillable PDF (AcroForm). */
export type AcroField = { name: string; type: "text" | "checkbox" | "radio" | "choice" | "signature" | "button"; page: number | null; options?: string[]; value?: string }

/** A space to write on in a flat form: a dotted, dashed or underscored line, with the words before it. */
export type Blank = { id: string; page: number; x: number; y: number; w: number; size: number; label: string }

export type FormField =
  | { kind: "field"; field: string; value: string | boolean }
  | { kind: "blank"; blank: string; text: string; size?: number; mask?: boolean }
  | { kind: "text"; page: number; x: number; y: number; text: string; size?: number; mask?: boolean }
  | { kind: "check"; page: number; x: number; y: number; size?: number }

export type FormRequest = { source: string; fields: FormField[] }

/** What the server keeps in the answer once a form is filled: the web chat shows it. */
export type FilledForm = { path: string; name: string; pages: number; filled: number }

export const MAX_FORM_FIELDS = 200

// Dots, ellipses, underscores and dashes: what a form prints where something is to be written.
const LEADER = /[.…_\-–—·]{3,}(?:[ \t]*[.…_\-–—·]+)*/g

/**
 * The blanks of a flat form, page by page in reading order: `p<page>.<n>`. The same ids come out of
 * the same PDF every time, so the agent's block names what the layout listed.
 */
export function findBlanks(pages: FormPage[]): Blank[] {
  const blanks: Blank[] = []
  pages.forEach((page, i) => {
    let n = 0
    for (const line of lines(page.runs)) {
      // The words since the previous blank (a label may span runs: "Ragione Sociale" + ":").
      let label = ""
      let labelEnd = 0
      let last: Blank | null = null
      for (const run of line) {
        // Pieces of the run: text and leaders, placed by the share of the run's width their characters take.
        const scale = run.w / (advance(run.text) || 1)
        const at = (i: number) => run.x + advance(run.text.slice(0, i)) * scale
        let from = 0
        const pieces: { leader: boolean; text: string; x: number; w: number }[] = []
        const piece = (leader: boolean, a: number, b: number) => pieces.push({ leader, text: run.text.slice(a, b), x: at(a), w: at(b) - at(a) })
        for (const m of run.text.matchAll(LEADER)) {
          if (m.index > from) piece(false, from, m.index)
          piece(true, m.index, m.index + m[0].length)
          from = m.index + m[0].length
        }
        if (from < run.text.length) piece(false, from, run.text.length)
        for (const p of pieces) {
          if (!p.leader && !p.text.trim()) continue
          if (!p.leader) {
            // Words after a blank end it and start the next label.
            if (last) label = ""
            label += (label && p.x - labelEnd > 1.5 ? " " : "") + p.text.trim()
            labelEnd = p.x + p.w
            last = null
            continue
          }
          // A leader right after another (split runs, "…" then "....."): one blank.
          if (last && p.x - (last.x + last.w) < 6) {
            last.w = p.x + p.w - last.x
            continue
          }
          last = { id: `p${i + 1}.${++n}`, page: i + 1, x: p.x, y: run.y, w: p.w, size: run.size, label: label.slice(-60) }
          blanks.push(last)
        }
      }
    }
  })
  return blanks.map((b) => ({ ...b, x: round(b.x), y: round(b.y), w: round(b.w), size: round(b.size) }))
}

/** Runs grouped into lines (same baseline, within a third of the text size), top to bottom, left to right. */
function lines(runs: TextRun[]): TextRun[][] {
  const sorted = runs.filter((r) => r.text && r.w > 0).sort((a, b) => a.y - b.y || a.x - b.x)
  const out: TextRun[][] = []
  for (const r of sorted) {
    const line = out.at(-1)
    if (line && Math.abs(line[0].y - r.y) <= Math.max(2, Math.min(line[0].size, r.size) / 3)) line.push(r)
    else out.push([r])
  }
  return out.map((l) => l.sort((a, b) => a.x - b.x))
}

const round = (n: number) => Math.round(n * 10) / 10

/** A string's width in em, roughly as Helvetica or Arial draw it: dots are narrow, capitals wide. */
function advance(s: string): number {
  let w = 0
  for (const c of s) {
    if (".,:;'’|!ijlI ".includes(c)) w += 0.278
    else if ("-()[]/f t".includes(c)) w += 0.333
    else if (c === "…" || c === "—" || "mwMW%".includes(c)) w += 0.9
    else if (/[A-Z]/.test(c)) w += 0.68
    else w += 0.556
  }
  return w
}

/** What the agent reads before writing a form block: the pages, their fields or blanks, and their lines of text. */
export function layoutText(pages: FormPage[], fields: AcroField[]): string {
  const blanks = findBlanks(pages)
  const out: string[] = [
    "Coordinates: PDF points from the top-left corner of the page, y on the text baseline.",
    fields.length
      ? `Fillable form: ${fields.length} fields. Fill them by name with {"field": NAME, "value": ...} (true/false for checkboxes, one of the options for radio and choice fields). Never fill signature fields.`
      : "Flat form (no fillable fields): write on its blanks with {\"blank\": ID, \"text\": ...}, anywhere else with {\"page\", \"x\", \"y\", \"text\"}, and tick a box with {\"page\", \"x\", \"y\", \"check\": true} (x, y: the box's centre).",
  ]
  if (fields.length) {
    out.push("", "Fields:")
    for (const f of fields)
      out.push(`- ${JSON.stringify(f.name)} ${f.type}${f.page ? ` (page ${f.page})` : ""}${f.options?.length ? ` options: ${f.options.map((o) => JSON.stringify(o)).join(", ")}` : ""}${f.value ? ` now: ${JSON.stringify(f.value)}` : ""}`)
  }
  pages.forEach((page, i) => {
    const n = i + 1
    const own = blanks.filter((b) => b.page === n)
    out.push("", `## Page ${n} (${round(page.width)} x ${round(page.height)} pt)`)
    if (!page.runs.some((r) => r.text.trim())) {
      out.push("No text on this page: it is a scan or a picture. Look at the page and place text with x and y, measured on the page's size above.")
      return
    }
    if (own.length) {
      out.push("Blanks (id, after which words, where: x from–to, baseline y):")
      for (const b of own) out.push(`- ${b.id} after ${JSON.stringify(b.label)}: x ${b.x}–${round(b.x + b.w)}, y ${b.y}`)
    }
    out.push("Text (y, x: words):")
    for (const line of lines(page.runs)) {
      const text = line.map((r) => `${round(r.x)}: ${r.text.replace(LEADER, "…").trim().slice(0, 90)}`).filter((s) => !s.endsWith(": "))
      if (text.length) out.push(`y ${round(line[0].y)}  ${text.join(" | ")}`)
    }
  })
  return out.join("\n")
}

// ---------- blocks in the chat ----------

const FORM_BLOCK = /```form[ \t]*\n([\s\S]*?)```/g
const FILLED_BLOCK = /```filled[ \t]*\n([\s\S]*?)```/g

const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : undefined)
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r/g, "").slice(0, max) : undefined)

/** One entry of a form block, or why it cannot be used. */
export function parseFormField(raw: unknown): FormField | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "not an object" }
  const o = raw as Record<string, unknown>
  const size = num(o.size, 4, 36)
  const mask = typeof o.mask === "boolean" ? o.mask : undefined
  if (typeof o.field === "string") {
    const value = typeof o.value === "boolean" ? o.value : text(o.value, 2000)
    if (value === undefined) return { error: `field ${JSON.stringify(o.field)}: no value` }
    return { kind: "field", field: o.field.slice(0, 200), value }
  }
  const t = text(o.text, 2000)
  if (typeof o.blank === "string") {
    if (!/^p\d{1,3}\.\d{1,4}$/.test(o.blank)) return { error: `blank ${JSON.stringify(o.blank)}: not an id of the layout` }
    if (!t) return { error: `blank ${o.blank}: no text` }
    return { kind: "blank", blank: o.blank, text: t, size, mask }
  }
  const page = num(o.page, 1, 999)
  const x = num(o.x, 0, 5000)
  const y = num(o.y, 0, 5000)
  if (!page || x === undefined || y === undefined) return { error: "needs field, blank, or page, x and y" }
  if (o.check === true) return { kind: "check", page, x, y, size }
  if (!t) return { error: `page ${page} at ${x}, ${y}: no text` }
  return { kind: "text", page, x, y, text: t, size, mask }
}

/** The form blocks of an answer, with what could not be read in each. */
export function formBlocks(answer: string): ({ request: FormRequest; errors: string[] } | { error: string })[] {
  return [...answer.matchAll(FORM_BLOCK)].map((m) => {
    let o: Record<string, unknown>
    try {
      o = JSON.parse(m[1])
    } catch {
      return { error: "not JSON" }
    }
    if (!o || typeof o !== "object" || typeof o.source !== "string") return { error: "no source" }
    if (!Array.isArray(o.fields) || !o.fields.length) return { error: "no fields" }
    const fields: FormField[] = []
    const errors: string[] = []
    for (const f of o.fields.slice(0, MAX_FORM_FIELDS)) {
      const r = parseFormField(f)
      if ("error" in r) errors.push(r.error)
      else fields.push(r)
    }
    return { request: { source: o.source.trim(), fields }, errors }
  })
}

export function filledBlock(f: FilledForm): string {
  return "```filled\n" + JSON.stringify(f) + "\n```"
}

/** The filled forms of an answer, as the server kept them. */
export function answerForms(answer: string): FilledForm[] {
  return [...answer.matchAll(FILLED_BLOCK)].flatMap((m) => {
    try {
      const o = JSON.parse(m[1]) as Record<string, unknown>
      if (typeof o.path === "string" && /^chats\/files\/[^/]+\/[^/]+\.pdf$/.test(o.path) && typeof o.name === "string")
        return [{ path: o.path, name: o.name, pages: Number(o.pages) || 0, filled: Number(o.filled) || 0 }]
    } catch {
      // not ours
    }
    return []
  })
}

export const FORM_INSTRUCTIONS = `- When the user asks you to fill in a form they gave you (a PDF attached to the chat, or one in inbox/ or archive/), fill it yourself and give it back as a PDF to download:
  1. Run \`node apps/server/src/form-layout.ts <path of the PDF>\` (typed exactly like that, path relative to the data folder): it prints the form's fillable fields or, for a flat form, its blanks (the dotted or underlined spaces, with an id like p1.3 and the words before each) and every line of text with its position.
  2. Look at the PDF itself too (Read it) to understand what each space asks for.
  3. Take the values from profile.toml, cases/ and what the user said; when the form is for a company (a sole proprietorship…) use its data. Leave empty what you do not know, and never sign: signature, stamp and handwritten parts stay for the user.
  4. End your answer with one block
\`\`\`form
{"source": "<path of the PDF>", "fields": [<entries>]}
\`\`\`
  Entries: {"field": "<name>", "value": "<text>" or true/false} for a fillable form; for a flat form {"blank": "<id>", "text": "..."} writes on that blank (from its start, small, covering its dots), and {"page": N, "x": X, "y": Y, "text": "..."} writes anywhere else (y is the baseline: to write above a line of dashes or underscores, such as the date over "DATA ------", use the line's x and a y about 10 points smaller than its y), {"page": N, "x": X, "y": Y, "check": true} puts an X on a box (x, y: its centre). Optional: "size" (points; default 9, smaller when it does not fit), "mask": false to keep what is printed under the text. Lines of text can be split with \\n.
  Copy codes exactly as they are (tax code, VAT number, IBAN, SDI code); the user's own data goes in plain text in the block, never ||...||. Before the block, list what you wrote where and what the user must still check, add or sign. The server writes the PDF and the web app shows it with a download button; when the user asks to fix something, send a new block with every entry again (the original stays as it was). This works in the web app only.`
