/**
 * The files a custom widget exports (docs/generative-ui.md): written here, by the app, from what the
 * sandbox handed back and core/exports.ts checked. jsPDF is loaded only when a PDF is asked for.
 */
import { type ExportCell, type ExportFormat, type ExportPicture, type ExportTable, exportFileName, tableCsv, tableJson } from "@autocratico/core"

export type ExportLabels = { exported: string; privacy: string | null; data: string; yes: string; no: string; page: (n: number, of: number) => string }
export type ExportInput = { id: string; title: string; date: string; locale: "it" | "en"; privacy: boolean; table: ExportTable; picture: ExportPicture | null; labels: ExportLabels }

/** The file for `format`, or null when it needs a picture the sandbox could not take. */
export async function exportFile(format: ExportFormat, input: ExportInput): Promise<{ blob: Blob; name: string } | null> {
  const name = exportFileName(input.id, input.date, format)
  if (format === "csv") return { blob: new Blob([tableCsv(input.table, input.locale)], { type: "text/csv;charset=utf-8" }), name }
  if (format === "json") return { blob: new Blob([tableJson(input.table, input)], { type: "application/json" }), name }
  if (format === "png") return input.picture ? { blob: new Blob([pngBytes(input.picture)], { type: "image/png" }), name } : null
  return { blob: await pdf(input), name }
}

/** Saves a file the app wrote: a link with `download`, never opened in a tab. */
export function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.rel = "noopener"
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function pngBytes(picture: ExportPicture): Uint8Array<ArrayBuffer> {
  const bin = atob(picture.png.slice(picture.png.indexOf(",") + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b)) throw new Error("not a PNG")
  return bytes
}

/** The PDF's standard fonts speak Windows-1252: anything else becomes "?". */
const text = (s: string) => s.replace(/[^\n\x20-\x7e\xa0-\xff€‚„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, "?")

async function pdf(input: ExportInput): Promise<Blob> {
  const { jsPDF } = await import("jspdf")
  const { table, picture, labels } = input
  const wide = table.columns.length > 6 || (picture !== null && picture.width > picture.height * 1.6)
  const doc = new jsPDF({ orientation: wide ? "landscape" : "portrait", unit: "mm", format: "a4", compress: true })
  doc.setProperties({ title: text(input.title), creator: "Autocratico" })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 15
  let y = M

  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(20)
  doc.text(text(input.title), M, y + 5)
  y += 11
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(115)
  doc.text(text(labels.privacy ? `${labels.exported} · ${labels.privacy}` : labels.exported), M, y)
  y += 8

  if (picture) {
    // About as large as on screen, never wider than the page.
    let w = Math.min(W - 2 * M, picture.width * 0.3)
    let h = (w * picture.height) / picture.width
    if (h > H - y - M) {
      h = H - y - M
      w = (h * picture.width) / picture.height
    }
    doc.addImage(picture.png, "PNG", M, y, w, h, undefined, "FAST")
    y += h + 8
  }

  if (table.rows.length) {
    if (y > H - 40) {
      doc.addPage()
      y = M
    }
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(20)
    doc.text(labels.data, M, y + 4)
    y += 9

    const number = new Intl.NumberFormat(input.locale === "en" ? "en-GB" : "it-IT", { maximumFractionDigits: 2 })
    const show = (v: ExportCell) => text(v === null ? "" : typeof v === "number" ? number.format(v) : typeof v === "boolean" ? (v ? labels.yes : labels.no) : v)
    const numeric = table.columns.map((_, i) => table.rows.some((r) => typeof r[i] === "number") && table.rows.every((r) => r[i] === null || typeof r[i] === "number"))
    const size = 8
    const line = 3.6
    const pad = 1.6
    doc.setFontSize(size)
    // Columns as wide as their content (the first 200 rows); when they do not fit, the wide ones give way
    // first, down to their header.
    const least: number[] = []
    const natural = table.columns.map((c, i) => {
      doc.setFont("helvetica", "bold")
      least[i] = Math.min(30, doc.getTextWidth(text(c)) + 2 * pad)
      let w = least[i]
      doc.setFont("helvetica", "normal")
      for (const r of table.rows.slice(0, 200)) w = Math.max(w, doc.getTextWidth(show(r[i] ?? null)) + 2 * pad)
      return Math.min(70, Math.max(10, w))
    })
    const total = (ws: number[]) => ws.reduce((a, b) => a + b, 0)
    const room = W - 2 * M
    const give = Math.max(0, Math.min(1, (room - total(least)) / Math.max(1e-6, total(natural) - total(least))))
    let widths = total(natural) <= room ? natural : natural.map((w, i) => least[i] + (w - least[i]) * give)
    if (total(widths) > room) widths = widths.map((w) => (w * room) / total(widths))

    const row = (cells: string[], header: boolean) => {
      doc.setFont("helvetica", header ? "bold" : "normal").setFontSize(size)
      const lines = cells.map((c, i) => doc.splitTextToSize(c, widths[i] - 2 * pad) as string[])
      const h = Math.max(1, ...lines.map((l) => l.length)) * line + 2 * pad
      if (y + h > H - M) {
        doc.addPage()
        y = M
        if (!header) head()
      }
      if (header) {
        doc.setFillColor(240, 240, 240)
        doc.rect(M, y, widths.reduce((a, b) => a + b, 0), h, "F")
      }
      let x = M
      doc.setTextColor(header ? 60 : 25)
      lines.forEach((l, i) => {
        const right = numeric[i] && !header
        doc.text(l, right ? x + widths[i] - pad : x + pad, y + pad + line * 0.8, { align: right ? "right" : "left" })
        x += widths[i]
      })
      y += h
      doc.setDrawColor(225).setLineWidth(0.1)
      doc.line(M, y, x, y)
    }
    const head = () => row(table.columns.map(text), true)
    head()
    for (const r of table.rows) row(table.columns.map((_, i) => show(r[i] ?? null)), false)
  }

  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(140)
    doc.text(text(labels.page(p, pages)), W - M, H - 8, { align: "right" })
  }
  return doc.output("blob")
}
