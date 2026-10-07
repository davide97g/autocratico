import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import type { FinanceData, FinanceSetup } from "@autocratico/core"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Account } from "../src/account.ts"
import { createApp } from "../src/app.ts"
import { loadConfig } from "../src/config.ts"
import { Finance } from "../src/finance.ts"
import { parseAmount, parseCsv, parseDate } from "../src/finance-csv.ts"
import { services } from "../src/services.ts"
import { owner, setup } from "./helpers.ts"

const MAPPING = { date: "Data", amount: "Importo", description: "Descrizione", category: "Categoria", delimiter: ";", decimal: ",", date_format: "DD/MM/YYYY", expense_sign: "negative" }

const JANUARY = `Data;Importo;Descrizione;Categoria
02/01/2026;-42,50;"Spesa; supermercato";Food
02/01/2026;-42,50;"Spesa; supermercato";Food
27/01/2026;2.000,00;Stipendio;Salary
;;Saldo finale;
`
// Overlaps January: the same rows must not count twice.
const JAN_FEB = `Data;Importo;Descrizione;Categoria
02/01/2026;-42,50;"Spesa; supermercato";Food
02/01/2026;-42,50;"Spesa; supermercato";Food
27/01/2026;2.000,00;Stipendio;Salary
03/02/2026;-9,99;Musica;
`

function withFinance() {
  const { data } = setup()
  const config = loadConfig({ data, jobs: false, telegramToken: null, claude: null })
  const finance = new Finance(data, { debounceMs: 10 })
  const s = services(config, { jobs: null, telegram: null, verifyAccess: null, account: new Account(config, ":memory:"), finance })
  const dir = join(data, "finance", "import")
  return { app: createApp(s), data, finance, dir }
}

async function json<T>(r: Response | Promise<Response>): Promise<T> {
  return (await (await r).json()) as T
}

const put = (app: ReturnType<typeof createApp>, h: Record<string, string>, body: unknown) =>
  app.request("/api/finance", { method: "PUT", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify(body) })

let stop: (() => void) | null = null
afterEach(() => {
  stop?.()
  stop = null
})

describe("CSV parsing", () => {
  it("handles quotes, delimiters inside quotes and CRLF", () => {
    expect(parseCsv('a;"b;c";"say ""hi"""\r\n1;2;3\r\n\r\n', ";")).toEqual([
      ["a", "b;c", 'say "hi"'],
      ["1", "2", "3"],
    ])
  })

  it("reads amounts and dates as banks write them", () => {
    expect(parseAmount("-1.234,56 €", ",")).toBe(-1234.56)
    expect(parseAmount("$1,234.56", ".")).toBe(1234.56)
    expect(parseAmount("(12.00)", ".")).toBe(-12)
    expect(parseAmount("n/a", ".")).toBeNull()
    expect(parseDate("02/01/2026", "DD/MM/YYYY")).toBe("2026-01-02")
    expect(parseDate("01/02/2026", "MM/DD/YYYY")).toBe("2026-01-02")
    expect(parseDate("2.1.26", "DD.MM.YYYY")).toBe("2026-01-02")
    expect(parseDate("2026-01-02T10:00", "YYYY-MM-DD")).toBe("2026-01-02")
    expect(parseDate("31/02/2026", "DD/MM/YYYY")).toBeNull()
  })
})

describe("Finance: csv connector", () => {
  it("rejects a mapping whose columns are not in the files", async () => {
    const { app, dir } = withFinance()
    const h = await owner(app)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "jan.csv"), JANUARY)
    const r = await put(app, h, { connector: "csv", csv: { ...MAPPING, amount: "Amount" } })
    expect(r.status).toBe(400)
    expect(((await r.json()) as { error: string }).error).toContain('no column "Amount"')
  })

  it("reads overlapping exports once, read-only", async () => {
    const { app, data, dir } = withFinance()
    const h = await owner(app)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "jan.csv"), JANUARY)
    writeFileSync(join(dir, "jan-feb.csv"), new Uint8Array(Buffer.from(JAN_FEB, "latin1")))

    const setupInfo = await json<FinanceSetup>(put(app, h, { connector: "csv", csv: MAPPING }))
    expect(setupInfo).toMatchObject({ connector: "csv", url: null, connected: true, capabilities: { write: false, live: true, recurring: false } })
    expect(readFileSync(join(data, "finance.toml"), "utf8")).toContain('connector = "csv"')

    const d = await json<FinanceData>(app.request("/api/finance/data", { headers: h }))
    expect(d.write).toBe(false)
    const tx = d.mirror!.transactions
    expect(tx.map((t) => [t.date, t.amount, t.type, t.category])).toEqual([
      ["2026-01-02", 42.5, "expense", "food"],
      ["2026-01-02", 42.5, "expense", "food"],
      ["2026-01-27", 2000, "earning", "salary"],
      ["2026-02-03", 9.99, "expense", "uncategorized"],
    ])
    expect(tx[0].description).toBe("Spesa; supermercato")
    expect(new Set(tx.map((t) => t.id)).size).toBe(4)
    expect(d.mirror!.categories.find((c) => c.id === "salary")?.type).toBe("earning")

    const expense = { key: "car-tax@2026-11-30", date: "2026-11-28", amount: 210.4, category: "food", description: "Car tax" }
    const w = await app.request("/api/finance/transactions", { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify(expense) })
    expect(w.status).toBe(400)
  })

  it("syncs when a file lands in the folder, and keeps the files when disconnected", async () => {
    const { app, finance, dir } = withFinance()
    const h = await owner(app)
    await put(app, h, { connector: "csv", csv: MAPPING })
    expect(finance.mirror()?.transactions).toEqual([])
    finance.listen()
    stop = () => finance.stop()
    await vi.waitFor(() => expect(finance.live).toBe(true))

    writeFileSync(join(dir, "jan.csv"), JANUARY)
    await vi.waitFor(() => expect(finance.mirror()?.transactions.length).toBe(3))

    expect((await app.request("/api/finance", { method: "DELETE", headers: h })).status).toBe(200)
    expect(existsSync(join(dir, "jan.csv"))).toBe(true)
    expect(finance.mirror()).toBeNull()
  })
})
