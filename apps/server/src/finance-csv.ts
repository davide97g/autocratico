/**
 * `csv` finance connector: bank exports dropped in data/finance/import/ (by hand, or filed there by the
 * agent from the inbox), read with the column mapping saved in finance.toml. Read-only: nothing is ever
 * written back to the bank.
 *
 * Overlapping exports (January–March, then February–April) do not double count: a transaction's id comes
 * from its date, amount and description plus how many identical rows came before it in the same file, so
 * the same row in two files has the same id.
 *
 * Files come from strangers (banks, emails): parsed as text, size-capped, never executed.
 */
import { createHash } from "node:crypto"
import { existsSync, type FSWatcher, mkdirSync, readdirSync, readFileSync, statSync, watch } from "node:fs"
import { join } from "node:path"

import type { FinanceCategory, FinanceCsvMapping, FinanceTransaction } from "@autocratico/core"

import { type FinanceConnector, FinanceError, type FinanceFeed, type FinanceRead } from "./finance-connector.ts"

const MAX_FILE_BYTES = 20 * 1024 * 1024
const UNCATEGORIZED = { id: "uncategorized", name: "Uncategorized" }

/** RFC 4180 rows: quoted fields may hold the delimiter, newlines and doubled quotes. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const out: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"' && field === "") quoted = true
    else if (c === delimiter) {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      row.push(field)
      if (row.some((f) => f.trim() !== "")) out.push(row)
      row = []
      field = ""
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f.trim() !== "")) out.push(row)
  return out
}

/** UTF-8 when it is valid, else Latin-1 (what many banks still export). */
function decode(bytes: Buffer): string {
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    text = new TextDecoder("latin1").decode(bytes)
  }
  return text.replace(/^﻿/, "")
}

/** "1.234,56" with decimal "," or "1,234.56" with decimal "."; currency signs and spaces are ignored. */
export function parseAmount(raw: string, decimal: "." | ","): number | null {
  let s = raw.trim()
  const negative = /^-|-$|^\(.*\)$/.test(s.replace(/[^\d.,()-]/g, ""))
  s = s.replace(/[^\d.,]/g, "")
  s = decimal === "," ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "")
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return negative ? -n : n
}

export function parseDate(raw: string, format: FinanceCsvMapping["date_format"]): string | null {
  const s = raw.trim()
  let y: string, m: string, d: string
  if (format === "YYYY-MM-DD") {
    const x = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
    if (!x) return null
    ;[, y, m, d] = x
  } else {
    const x = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/.exec(s)
    if (!x) return null
    ;[, d, m, y] = x
    if (format === "MM/DD/YYYY") [d, m] = [m, d]
    if (y.length === 2) y = `20${y}`
  }
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  const date = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso
}

export class CsvConnector implements FinanceConnector {
  readonly kind = "csv"
  readonly capabilities = { write: false, live: true, recurring: false }
  readonly incremental = false
  readonly #dir: string
  readonly #map: FinanceCsvMapping

  constructor(dir: string, mapping: FinanceCsvMapping) {
    this.#dir = dir
    this.#map = mapping
  }

  #files(): string[] {
    if (!existsSync(this.#dir)) return []
    return readdirSync(this.#dir)
      .filter((f) => /\.csv$/i.test(f) && !f.startsWith("."))
      .sort()
  }

  /** Creates the folder; every file already there must have the mapped columns. */
  async check(): Promise<void> {
    mkdirSync(this.#dir, { recursive: true })
    await this.read()
  }

  async read(): Promise<FinanceRead> {
    const m = this.#map
    const byId = new Map<string, FinanceTransaction>()
    const categories = new Map<string, FinanceCategory>()
    for (const file of this.#files()) {
      const path = join(this.#dir, file)
      if (statSync(path).size > MAX_FILE_BYTES) throw new FinanceError(400, `${file}: larger than 20 MB`)
      const [header, ...lines] = parseCsv(decode(readFileSync(path)), m.delimiter)
      if (!header) continue
      const names = header.map((h) => h.trim().toLowerCase())
      const col = (name: string | undefined) => {
        if (name === undefined) return -1
        const i = names.indexOf(name.trim().toLowerCase())
        if (i < 0) throw new FinanceError(400, `${file}: no column "${name}" (found: ${header.map((h) => h.trim()).join(", ")})`)
        return i
      }
      const [di, ai, ti, ci] = [col(m.date), col(m.amount), col(m.description), col(m.category)]
      const seen = new Map<string, number>()
      for (const cells of lines) {
        const date = parseDate(cells[di] ?? "", m.date_format)
        const value = parseAmount(cells[ai] ?? "", m.decimal)
        if (!date || value === null || value === 0) continue // totals, notes and pending rows
        const description = (cells[ti] ?? "").trim().replace(/\s+/g, " ")
        const expense = m.expense_sign === "negative" ? value < 0 : value > 0
        const type = expense ? "expense" : "earning"
        const name = ci >= 0 ? (cells[ci] ?? "").trim() : ""
        const category = name ? { id: name.toLowerCase(), name } : UNCATEGORIZED
        const key = `${date}|${value}|${description}`
        const n = (seen.get(key) ?? 0) + 1
        seen.set(key, n)
        const id = `csv-${createHash("sha256").update(`${key}#${n}`).digest("hex").slice(0, 16)}`
        byId.set(id, { id, date, amount: Math.abs(value), description, category: category.id, type, tag: null, recurringId: null })
        const known = categories.get(category.id)
        // A category is an earning one only when every row in it is an earning.
        categories.set(category.id, { id: category.id, name: known?.name ?? category.name, type: known?.type === "expense" || type === "expense" ? "expense" : "earning", color: null, excludeFromBudget: false })
      }
    }
    return { transactions: [...byId.values()], categories: [...categories.values()], tags: [], recurring: [] }
  }

  /** Watches the folder: a file added, replaced or removed is a change. */
  watch(on: { ready(): void; change(): void }): FinanceFeed {
    let watcher: FSWatcher | null = null
    try {
      mkdirSync(this.#dir, { recursive: true })
      watcher = watch(this.#dir, () => on.change())
      watcher.on("error", () => {
        watcher?.close()
        watcher = null
      })
      on.ready()
    } catch (e) {
      console.error(`finance: cannot watch ${this.#dir}: ${(e as Error).message}`)
    }
    return {
      get live() {
        return watcher !== null
      },
      close() {
        watcher?.close()
        watcher = null
      },
    }
  }
}
