/**
 * Exports of a custom widget (docs/generative-ui.md): the user picks a format in the Board's menu, the
 * app asks the sandbox, and the sandbox hands back a table (from the widget's `ac.onExport`) and, for PDF
 * and PNG, a picture of the widget as drawn. Both are data: checked here against fixed shapes, then the
 * app writes the file itself. The widget never chooses a file, a name or a moment.
 */
import { z } from "zod"

export const EXPORT_FORMATS = ["csv", "json", "pdf", "png"] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]
/** Formats that carry a picture of the widget, taken by the sandbox page. */
export const PICTURE_FORMATS: readonly ExportFormat[] = ["pdf", "png"]

export const MAX_EXPORT_COLUMNS = 40
export const MAX_EXPORT_ROWS = 5000
/** A PNG data URL, at most about 9 MB of image. */
export const MAX_PICTURE = 12_000_000

const Cell = z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()])
export type ExportCell = z.infer<typeof Cell>

/** What a widget's `ac.onExport` returns: what it shows, as a table. */
export const ExportTable = z
  .object({
    columns: z.array(z.string().trim().min(1).max(120)).min(1).max(MAX_EXPORT_COLUMNS),
    rows: z.array(z.array(Cell).max(MAX_EXPORT_COLUMNS)).max(MAX_EXPORT_ROWS),
  })
  .strict()
export type ExportTable = z.infer<typeof ExportTable>

/** The widget as drawn, rasterized by the sandbox page (never by the widget's code): its size in CSS pixels, the image up to twice as dense. */
export const ExportPicture = z
  .object({
    png: z.string().max(MAX_PICTURE).regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/, "a PNG data URL"),
    width: z.number().int().min(1).max(8000),
    height: z.number().int().min(1).max(8000),
  })
  .strict()
export type ExportPicture = z.infer<typeof ExportPicture>

/** The sandbox's answer to an export request; a part that does not check out is dropped, not the whole. */
export const ExportAnswer = z.object({
  type: z.literal("export"),
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  table: z.unknown().optional().transform((v) => ExportTable.safeParse(v).data ?? null),
  picture: z.unknown().optional().transform((v) => ExportPicture.safeParse(v).data ?? null),
})

const plain = (v: unknown): ExportCell => {
  if (v === null || v === undefined) return null
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v === "boolean") return v
  if (typeof v === "string") return v.slice(0, 2000)
  return JSON.stringify(v).slice(0, 2000)
}

/**
 * The table a widget without `ac.onExport` exports: the rows of its queries, one column per field, and a
 * first column naming the query when there are several. Queries without data (null) are left out.
 */
export function queryTable(data: Record<string, unknown[] | null>): ExportTable {
  const queries = Object.entries(data).filter((e): e is [string, unknown[]] => Array.isArray(e[1]))
  const several = queries.length > 1
  const fields: string[] = []
  for (const [, rows] of queries)
    for (const row of rows)
      if (row && typeof row === "object") for (const k of Object.keys(row)) if (!fields.includes(k) && fields.length < MAX_EXPORT_COLUMNS - 1) fields.push(k)
  const rows: ExportCell[][] = []
  for (const [name, list] of queries)
    for (const row of list) {
      if (rows.length >= MAX_EXPORT_ROWS) break
      const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>
      rows.push([...(several ? [name] : []), ...fields.map((f) => plain(r[f]))])
    }
  return { columns: [...(several ? ["data"] : []), ...(fields.length ? fields : ["value"])], rows }
}

/** A text cell a spreadsheet would read as a formula (=, +, -, @, tab, CR) is written with a leading '. */
const FORMULA = /^[=+\-@\t\r]/

/**
 * CSV for spreadsheets: in Italian with ";" and a decimal comma (what Excel and Numbers expect there), in
 * English with "," and a dot; a BOM so Excel reads UTF-8, CRLF line ends, RFC 4180 quoting.
 */
export function tableCsv(table: ExportTable, locale: "it" | "en"): string {
  const sep = locale === "it" ? ";" : ","
  const cell = (v: ExportCell): string => {
    if (v === null) return ""
    if (typeof v === "number") return locale === "it" ? String(v).replace(".", ",") : String(v)
    if (typeof v === "boolean") return v ? "true" : "false"
    const text = FORMULA.test(v) ? `'${v}` : v
    return /[",;\r\n]/.test(text) || text !== text.trim() ? `"${text.replaceAll('"', '""')}"` : text
  }
  const lines = [table.columns, ...table.rows].map((row) => row.map(cell).join(sep))
  return `﻿${lines.join("\r\n")}\r\n`
}

/** JSON: one object per row, keyed by the columns, with what was exported and when. */
export function tableJson(table: ExportTable, meta: { title: string; date: string; privacy: boolean }): string {
  const rows = table.rows.map((row) => Object.fromEntries(table.columns.map((c, i) => [c, row[i] ?? null])))
  return `${JSON.stringify({ title: meta.title, exported: meta.date, privacy: meta.privacy, rows }, null, 2)}\n`
}

/** The file's name: the widget's id (kebab-case, checked) and the day. */
export function exportFileName(id: string, date: string, format: ExportFormat): string {
  return `${id.replace(/[^a-z0-9-]/g, "") || "widget"}-${date.replace(/[^0-9-]/g, "")}.${format}`
}
