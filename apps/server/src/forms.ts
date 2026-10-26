/**
 * PDF forms filled in for the user (see core/forms.ts): pdf.js reads where a form's text and blanks
 * are, pdf-lib writes the values. The original is never touched; the filled copy is a new chat
 * attachment (chats/files/), deleted with the chat. All of it runs here: nothing leaves the server.
 * The source is only a chat attachment or a file of inbox/ or archive/ (real paths checked).
 */
import { type AcroField, type Blank, type FilledForm, findBlanks, type FormPage, type FormRequest, layoutText, type TextRun } from "@autocratico/core"

import { readFileSync } from "node:fs"
import { basename, extname } from "node:path"

import { PDFCheckBox, PDFDocument, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFSignature, PDFTextField, type PDFFont, type PDFPage, StandardFonts, degrees, rgb } from "pdf-lib"
import { getDocument, Util } from "pdfjs-dist/legacy/build/pdf.mjs"

import { chatFile, saveChatFiles } from "./chat-files.ts"
import { documentFile } from "./inbox.ts"

export class FormError extends Error {}

const MAX_PAGES = 30
// Dark blue, like a pen: what was written stands apart from what was printed.
const INK = rgb(0.07, 0.16, 0.45)
const DEFAULT_SIZE = 9
const MIN_SIZE = 6

/** Absolute path of a PDF the agent may fill: a chat attachment, or a file of inbox/ or archive/. */
export function formSource(data: string, path: string): string | null {
  if (extname(path).toLowerCase() !== ".pdf") return null
  return chatFile(data, path) ?? documentFile(data, path)
}

type Viewport = { width: number; height: number; transform: number[]; convertToPdfPoint(x: number, y: number): number[] }
type Layout = { pages: FormPage[]; viewports: Viewport[]; rotations: number[]; fields: AcroField[] }

/** Where the text of each page is (top-left coordinates, baselines), and the form's fields. */
export async function readLayout(bytes: Uint8Array): Promise<Layout> {
  const task = getDocument({ data: bytes.slice(), disableFontFace: true, verbosity: 0 })
  try {
    const doc = await task.promise
    if (doc.numPages > MAX_PAGES) throw new FormError(`too many pages (${doc.numPages}, ${MAX_PAGES} at most)`)
    const layout: Layout = { pages: [], viewports: [], rotations: [], fields: [] }
    const pages = new Map<string, number>()
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const vp = page.getViewport({ scale: 1 }) as unknown as Viewport
      const runs: TextRun[] = []
      for (const item of (await page.getTextContent()).items) {
        if (!("str" in item) || !item.str) continue
        const [a, b, , , x, y] = Util.transform(vp.transform, item.transform)
        const size = Math.hypot(a, b)
        // Only horizontal text: rotated stamps and margins are not where a form is filled.
        if (Math.abs(b) > size / 10 || a <= 0) continue
        runs.push({ x, y, w: item.width, size, text: item.str })
      }
      layout.pages.push({ width: vp.width, height: vp.height, runs })
      layout.viewports.push(vp)
      layout.rotations.push(page.rotate)
      for (const a of await page.getAnnotations()) if (a.fieldName && !pages.has(a.fieldName)) pages.set(a.fieldName, n)
    }
    layout.fields = await acroFields(bytes, pages)
    return layout
  } finally {
    await task.destroy()
  }
}

async function load(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false })
  } catch (e) {
    if ((e as Error).name === "EncryptedPDFError") throw new FormError("the PDF is protected: it cannot be filled in")
    throw new FormError(`not a readable PDF (${(e as Error).message})`)
  }
}

async function acroFields(bytes: Uint8Array, pages: Map<string, number>): Promise<AcroField[]> {
  const form = (await load(bytes)).getForm()
  return form.getFields().map((f): AcroField => {
    const name = f.getName()
    const page = pages.get(name) ?? null
    if (f instanceof PDFTextField) return { name, type: "text", page, value: f.getText() ?? undefined }
    if (f instanceof PDFCheckBox) return { name, type: "checkbox", page, value: f.isChecked() ? "true" : undefined }
    if (f instanceof PDFRadioGroup) return { name, type: "radio", page, options: f.getOptions(), value: f.getSelected() ?? undefined }
    if (f instanceof PDFDropdown || f instanceof PDFOptionList) return { name, type: "choice", page, options: f.getOptions(), value: f.getSelected()[0] }
    if (f instanceof PDFSignature) return { name, type: "signature", page }
    return { name, type: "button", page }
  })
}

/** The form's layout as the agent reads it (`form-layout.ts`). */
export async function describeForm(data: string, path: string): Promise<string> {
  const file = formSource(data, path)
  if (!file) throw new FormError(`not a PDF in chats/files/, inbox/ or archive/: ${path}`)
  const layout = await readLayout(new Uint8Array(readFileSync(file)))
  return layoutText(layout.pages, layout.fields)
}

/** Text a standard font can write: accents kept, anything else spelled out or replaced. */
function writable(font: PDFFont, s: string): string {
  const ok = new Set(font.getCharacterSet())
  return [...s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\t/g, " ")]
    .map((c) => (c === "\n" || ok.has(c.codePointAt(0)!) ? c : c.normalize("NFKD").replace(/[̀-ͯ]/g, "")))
    .map((c) => (c === "\n" || [...c].every((x) => ok.has(x.codePointAt(0)!)) ? c : "?"))
    .join("")
}

type Placed = { page: number; x: number; y: number; text: string; size?: number; mask: boolean; width?: number }

/** Writes `text` at a top-left point of the page, on its baseline, shrinking it to fit `width`. */
function write(page: PDFPage, vp: Viewport, rotation: number, font: PDFFont, p: Placed): boolean {
  const lines = writable(font, p.text).split("\n")
  let size = p.size ?? DEFAULT_SIZE
  const widest = () => Math.max(...lines.map((l) => font.widthOfTextAtSize(l, size)))
  if (p.width) while (size > MIN_SIZE && widest() > p.width) size -= 0.25
  const fits = !p.width || widest() <= p.width
  lines.forEach((line, i) => {
    if (!line.trim()) return
    const y = p.y + i * size * 1.2
    const w = font.widthOfTextAtSize(line, size)
    const [x0, y0] = vp.convertToPdfPoint(p.x, y)
    const rotate = degrees(rotation)
    if (p.mask) {
      const [mx, my] = vp.convertToPdfPoint(p.x - 1, y + size * 0.3)
      page.drawRectangle({ x: mx, y: my, width: w + 3, height: size * 1.25, color: rgb(1, 1, 1), rotate })
    }
    page.drawText(line, { x: x0, y: y0, size, font, color: INK, rotate })
  })
  return fits
}

export type FillResult = { form: FilledForm; warnings: string[] }

/** Fills a form as the agent asked and saves the copy beside the chat's attachments. */
export async function fillForm(data: string, request: FormRequest, timeZone: string, locale: "it" | "en"): Promise<FillResult> {
  const file = formSource(data, request.source)
  if (!file) throw new FormError(`not a PDF in chats/files/, inbox/ or archive/: ${request.source}`)
  const bytes = new Uint8Array(readFileSync(file))
  const layout = await readLayout(bytes)
  const doc = await load(bytes)
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const pages = doc.getPages()
  const blanks = new Map<string, Blank>(findBlanks(layout.pages).map((b) => [b.id, b]))
  const form = doc.getForm()
  const warnings: string[] = []
  let filled = 0

  for (const f of request.fields) {
    if (f.kind === "field") {
      const field = form.getFieldMaybe(f.field)
      if (!field) {
        warnings.push(`no field ${JSON.stringify(f.field)}`)
        continue
      }
      try {
        if (field instanceof PDFTextField) field.setText(writable(font, String(f.value)))
        else if (field instanceof PDFCheckBox) (f.value === true || f.value === "true" ? field.check() : field.uncheck())
        else if (field instanceof PDFRadioGroup || field instanceof PDFDropdown || field instanceof PDFOptionList) field.select(String(f.value))
        else {
          warnings.push(`${JSON.stringify(f.field)} is a ${field instanceof PDFSignature ? "signature" : "button"}: left for the user`)
          continue
        }
        filled++
      } catch (e) {
        warnings.push(`${JSON.stringify(f.field)}: ${(e as Error).message}`)
      }
      continue
    }
    let placed: Placed
    if (f.kind === "blank") {
      const b = blanks.get(f.blank)
      if (!b) {
        warnings.push(`no blank ${f.blank}`)
        continue
      }
      // On the dotted line, just after its start; the dots under the text are covered.
      placed = { page: b.page, x: b.x + 1.5, y: b.y, text: f.text, size: f.size, mask: f.mask ?? true, width: b.w - 3 }
    } else if (f.kind === "check") {
      placed = { page: f.page, x: f.x, y: f.y, text: "X", size: f.size ?? 10, mask: false }
      placed.x -= font.widthOfTextAtSize("X", placed.size!) / 2
      placed.y += placed.size! * 0.35
    } else {
      placed = { page: f.page, x: f.x, y: f.y, text: f.text, size: f.size, mask: f.mask ?? false }
    }
    const page = pages[placed.page - 1]
    if (!page) {
      warnings.push(`no page ${placed.page}`)
      continue
    }
    if (!write(page, layout.viewports[placed.page - 1], layout.rotations[placed.page - 1], font, placed))
      warnings.push(`"${f.kind === "blank" ? f.blank : `page ${placed.page}`}": the text is longer than the space`)
    filled++
  }
  if (!filled) throw new FormError(warnings[0] ?? "nothing to write")

  if (form.getFields().length) form.updateFieldAppearances(font)
  const out = await doc.save()
  const stem = basename(file, extname(file)).replace(/[ -]+(compilato|filled)( \(\d+\))?$/i, "")
  const name = `${stem} - ${locale === "it" ? "compilato" : "filled"}.pdf`
  const [saved] = await saveChatFiles(data, [{ name, data: out }], timeZone)
  return { form: { path: saved.path, name: saved.name, pages: pages.length, filled }, warnings }
}
