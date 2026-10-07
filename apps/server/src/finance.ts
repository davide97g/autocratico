/**
 * A finance source (expenses and earnings) mirrored into the data folder. The source is a connector
 * (finance-connector.ts): `http`, a server speaking the finance contract, or `csv`, bank exports dropped in
 * finance/import/. Which one, and its settings, in finance.toml; an http token in secrets/finance.json. The
 * synced data in finance/mirror.json, with a Markdown summary for the agents next to it.
 *
 * Kept in sync three ways: the connector's change feed (edits show up within seconds), an hourly full sync
 * (the `finance` job) and a sync after every write from here. When the connector can write, paid
 * occurrences can be recorded there as expenses; finance/links.json remembers which transaction each became.
 *
 * Security-sensitive: the token stays in data/secrets (0700/0600) and is never sent to the browser.
 * Data from the source is parsed into fixed shapes by the connector, nothing else is kept.
 */
import { createHash } from "node:crypto"
import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"

import {
  addDays,
  addMonths,
  byCategory,
  type FinanceConnectInput,
  FinanceCsvMapping,
  type FinanceData,
  type FinanceExpenseInput,
  FinanceMirror,
  type FinanceSetup,
  parseInvestments,
  parseToml,
  today as todayIn,
  trend,
} from "@autocratico/core"
import { loadDeadlines } from "@autocratico/core/node"
import { stringify } from "smol-toml"

import { type FinanceConnector, FinanceError, type FinanceFeed, type FinanceRead } from "./finance-connector.ts"
import { CsvConnector } from "./finance-csv.ts"
import { HttpConnector } from "./finance-http.ts"
import { locks, readJson, writeAtomic, writeJson, writeSecret } from "./files.ts"
import { acceptedMatches, matchesFile } from "./matches.ts"

export { FinanceError } from "./finance-connector.ts"

type Fetch = typeof fetch
export type SyncResult = { changed: boolean; transactions: number }

const HEADER = `# Finance source (expenses and earnings). Managed from Settings in the web app.
# connector = "http": a finance server (token in secrets/finance.json); "csv": bank exports in finance/import/.
`
/** A change re-reads transactions from this many months back; the hourly sync re-reads them all. */
const RECENT_MONTHS = 3

type Settings = { kind: "http"; url: string } | { kind: "csv"; csv: FinanceCsvMapping }

/** Content without the sync time: a change of this means the data changed. */
function fingerprint(m: Omit<FinanceMirror, "synced_at">): string {
  const byId = <T extends { id: string }>(list: T[]) => [...list].sort((a, b) => (a.id < b.id ? -1 : 1))
  const sorted = { t: byId(m.transactions), c: byId(m.categories), g: byId(m.tags), r: byId(m.recurring) }
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex")
}

export class Finance {
  readonly #data: string
  readonly #fetch: Fetch
  readonly #timeZone: string
  readonly #debounceMs: number
  readonly #listeners = new Set<(rev: number) => void>()
  #rev = 0
  #error: string | null = null
  #listening = false
  #feed: FinanceFeed | null = null
  #syncTimer: NodeJS.Timeout | null = null
  /** Scope of the sync waiting in #syncTimer: "full" wins over "recent". */
  #pending: "full" | "recent" | null = null

  constructor(data: string, options: { fetcher?: Fetch; timeZone?: string; debounceMs?: number } = {}) {
    this.#data = data
    this.#fetch = options.fetcher ?? fetch
    this.#timeZone = options.timeZone ?? "Europe/Rome"
    this.#debounceMs = options.debounceMs ?? 1_000
  }

  get #config() {
    return join(this.#data, "finance.toml")
  }
  get #secret() {
    return join(this.#data, "secrets", "finance.json")
  }
  get #dir() {
    return join(this.#data, "finance")
  }
  get #importDir() {
    return join(this.#dir, "import")
  }
  get #mirrorFile() {
    return join(this.#dir, "mirror.json")
  }
  get #linksFile() {
    return join(this.#dir, "links.json")
  }
  get #investments() {
    return join(this.#data, "investments.toml")
  }

  // ---------- reading ----------

  /** finance.toml; a file with only `url` (written before connectors existed) is an http source. */
  #settings(): Settings | null {
    if (!existsSync(this.#config)) return null
    try {
      const raw = parseToml(readFileSync(this.#config, "utf8"), "finance.toml")
      const kind = raw.connector ?? (raw.url ? "http" : null)
      if (kind === "http") {
        const url = raw.url
        return typeof url === "string" && /^https?:\/\//.test(url) ? { kind, url: url.replace(/\/+$/, "") } : null
      }
      if (kind === "csv") {
        const csv = FinanceCsvMapping.safeParse(raw.csv)
        return csv.success ? { kind, csv: csv.data } : null
      }
      return null
    } catch {
      return null
    }
  }

  #token(): string | null {
    const t = readJson<{ token?: unknown } | null>(this.#secret, null)?.token
    return typeof t === "string" ? t : null
  }

  #connector(settings = this.#settings(), token = this.#token()): FinanceConnector | null {
    if (settings?.kind === "http") return token ? new HttpConnector(settings.url, token, this.#fetch) : null
    if (settings?.kind === "csv") return new CsvConnector(this.#importDir, settings.csv)
    return null
  }

  configured(): boolean {
    return this.#connector() !== null
  }

  get live(): boolean {
    return this.#feed?.live ?? false
  }

  get rev(): number {
    return this.#rev
  }

  mirror(): FinanceMirror | null {
    if (!existsSync(this.#mirrorFile)) return null
    const parsed = FinanceMirror.safeParse(readJson<unknown>(this.#mirrorFile, null))
    return parsed.success ? parsed.data : null
  }

  links(): Record<string, string> {
    return readJson<Record<string, string>>(this.#linksFile, {})
  }

  setup(): FinanceSetup {
    const m = this.mirror()
    const settings = this.#settings()
    const connector = this.#connector(settings)
    return {
      connector: settings?.kind ?? null,
      url: settings?.kind === "http" ? settings.url : null,
      csv: settings?.kind === "csv" ? settings.csv : null,
      connected: connector !== null,
      live: this.live,
      capabilities: connector?.capabilities ?? null,
      synced_at: m?.synced_at ?? null,
      error: this.#error,
      counts: { transactions: m?.transactions.length ?? 0, categories: m?.categories.length ?? 0, recurring: m?.recurring.length ?? 0 },
    }
  }

  /** Everything the Finance view needs. */
  data(): FinanceData {
    let investments: FinanceData["investments"] = []
    if (existsSync(this.#investments)) {
      try {
        investments = parseInvestments(readFileSync(this.#investments, "utf8")).snapshots
      } catch {
        investments = [] // malformed file: the agent's next edit fixes it, the view shows none meanwhile
      }
    }
    let deadlines: FinanceData["deadlines"] = []
    try {
      deadlines = loadDeadlines(this.#data)
        .filter((d) => d.finance_category || d.finance_recurring)
        .map((d) => ({ id: d.id, finance_category: d.finance_category, finance_recurring: d.finance_recurring }))
    } catch {
      deadlines = []
    }
    const write = this.#connector()?.capabilities.write ?? false
    return {
      today: todayIn(this.#timeZone),
      live: this.live,
      write,
      mirror: this.mirror(),
      investments,
      links: this.links(),
      matched: acceptedMatches(this.#data),
      deadlines,
    }
  }

  /** Called with the new revision whenever the mirror changes. */
  onChange(listener: (rev: number) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  // ---------- connection ----------

  /** Checks the settings against the source, saves them, syncs everything. */
  async connect(input: FinanceConnectInput): Promise<FinanceSetup> {
    let settings: Settings
    let token: string | null = null
    if (input.connector === "http") {
      settings = { kind: "http", url: input.url.replace(/\/+$/, "") }
      token = input.token ?? this.#token()
      if (!token) throw new FinanceError(400, "paste the API token created on the finance server")
    } else {
      settings = { kind: "csv", csv: input.csv }
    }
    const before = this.#settings()?.kind
    await this.#connector(settings, token)!.check()
    const file = settings.kind === "http" ? { connector: "http", url: settings.url } : { connector: "csv", csv: settings.csv }
    await locks.run(this.#config, () => writeAtomic(this.#config, `${HEADER}\n${stringify(file)}\n`))
    if (token) writeSecret(this.#secret, { token })
    else rmSync(this.#secret, { force: true })
    // Another source: its ids mean nothing here, start over.
    if (before && before !== settings.kind) this.#forgetMirror()
    this.#error = null
    await this.sync("full")
    if (this.#listening) this.#openFeed()
    return this.setup()
  }

  /** Forgets the settings, the token and the synced data; investments.toml and finance/import/ are the register's own and stay. */
  async disconnect(): Promise<void> {
    this.#closeFeed()
    await locks.run(this.#config, () => {
      rmSync(this.#secret, { force: true })
      rmSync(this.#config, { force: true })
      this.#forgetMirror()
    })
    this.#error = null
    this.#bump()
  }

  #forgetMirror() {
    rmSync(this.#mirrorFile, { force: true })
    rmSync(this.#linksFile, { force: true })
    rmSync(matchesFile(this.#data), { force: true })
    rmSync(join(this.#dir, "summary.md"), { force: true })
  }

  // ---------- sync ----------

  /** Re-reads the source: every transaction ("full") or, when it can, the last few months ("recent"). */
  sync(scope: "full" | "recent" = "full"): Promise<SyncResult> {
    return locks.run("finance-sync", async () => {
      const connector = this.#connector()
      if (!connector) throw new FinanceError(400, "no finance source connected")
      const before = this.mirror()
      const from = scope === "recent" && before && connector.incremental ? `${addMonths(todayIn(this.#timeZone), -RECENT_MONTHS).slice(0, 7)}-01` : null
      try {
        const read: FinanceRead = await connector.read(from)
        const transactions = from ? [...before!.transactions.filter((t) => t.date < from), ...read.transactions] : read.transactions
        transactions.sort((a, b) => a.date.localeCompare(b.date) || (a.id < b.id ? -1 : 1))
        const next = { transactions, categories: read.categories, tags: read.tags, recurring: read.recurring }
        const changed = !before || fingerprint(before) !== fingerprint(next)
        const mirror: FinanceMirror = { synced_at: new Date().toISOString(), ...next }
        writeJson(this.#mirrorFile, mirror)
        writeAtomic(join(this.#dir, "summary.md"), summary(mirror, todayIn(this.#timeZone)))
        this.#error = null
        if (changed) this.#bump()
        return { changed, transactions: transactions.length }
      } catch (e) {
        this.#error = (e as Error).message
        throw e
      }
    })
  }

  /** Several changes in a row become one sync, a little later. */
  #scheduleSync(scope: "full" | "recent") {
    this.#pending = this.#pending === "full" || scope === "full" ? "full" : "recent"
    if (this.#syncTimer) clearTimeout(this.#syncTimer)
    this.#syncTimer = setTimeout(() => {
      const s = this.#pending ?? "recent"
      this.#pending = null
      this.#syncTimer = null
      this.sync(s).catch((e: Error) => console.error(`finance: ${e.message}`))
    }, this.#debounceMs)
  }

  #bump() {
    this.#rev += 1
    for (const l of this.#listeners) {
      try {
        l(this.#rev)
      } catch {
        // a closed browser stream must not stop the others
      }
    }
  }

  // ---------- writing ----------

  #writer(): FinanceConnector & Required<Pick<FinanceConnector, "create" | "remove">> {
    const connector = this.#connector()
    if (!connector) throw new FinanceError(400, "no finance source connected")
    if (!connector.capabilities.write || !connector.create || !connector.remove) throw new FinanceError(400, "the finance source is read-only")
    return connector as FinanceConnector & Required<Pick<FinanceConnector, "create" | "remove">>
  }

  /** Records a paid occurrence as an expense in the finance source. */
  addExpense(input: FinanceExpenseInput): Promise<{ id: string }> {
    return locks.run(this.#linksFile, async () => {
      const connector = this.#writer()
      if (this.links()[input.key]) throw new FinanceError(409, "already recorded in the finance source")
      const id = await connector.create(input)
      writeJson(this.#linksFile, { ...this.links(), [input.key]: id })
      this.#scheduleSync("recent")
      return { id }
    })
  }

  /** Deletes the expense recorded for an occurrence (it was marked done by mistake). */
  removeExpense(key: string): Promise<boolean> {
    return locks.run(this.#linksFile, async () => {
      const links = this.links()
      const id = links[key]
      if (!id) return false
      await this.#writer().remove(id)
      delete links[key]
      writeJson(this.#linksFile, links)
      this.#scheduleSync("recent")
      return true
    })
  }

  // ---------- change feed ----------

  /** Keeps the source's change feed open while the server runs (no-op until connected). */
  listen() {
    this.#listening = true
    this.#openFeed()
  }

  stop() {
    this.#listening = false
    this.#closeFeed()
    if (this.#syncTimer) clearTimeout(this.#syncTimer)
    this.#syncTimer = null
  }

  #openFeed() {
    this.#closeFeed()
    const connector = this.#connector()
    if (!this.#listening || !connector?.watch) return
    this.#feed = connector.watch({
      ready: () => this.#scheduleSync("recent"), // catch up on what changed while the feed was closed
      change: () => this.#scheduleSync("recent"),
    })
  }

  #closeFeed() {
    this.#feed?.close()
    this.#feed = null
  }
}

const euro = (n: number) => `||€ ${n.toFixed(2)}||`

/** finance/summary.md: what the chat agent reads to answer questions about spending. */
export function summary(m: FinanceMirror, today: string): string {
  const names = new Map(m.categories.map((c) => [c.id, c.name]))
  const from = `${addMonths(today, -23).slice(0, 7)}-01`
  // To the end of this month: transactions already entered for later this month count too.
  const end = addDays(addMonths(`${today.slice(0, 7)}-01`, 1), -1)
  const months = trend(m.transactions, "month", from, end).reverse()
  const lines = [
    "# Finance (synced from the finance source — do not edit)",
    "",
    `Last sync: ${m.synced_at}. ${m.transactions.length} transactions. Detail per transaction: finance/mirror.json.`,
    "",
    "## Months (newest first)",
    "",
  ]
  for (const b of months) {
    if (!b.expense && !b.earning) continue
    lines.push(`### ${b.start.slice(0, 7)}`, `Expenses ${euro(b.expense)} · earnings ${euro(b.earning)} · net ${euro(b.net)}`)
    for (const c of byCategory(m.transactions, b.start, addDays(addMonths(b.start, 1), -1))) lines.push(`- ${names.get(c.category) ?? c.category}: ${euro(c.total)}`)
    lines.push("")
  }
  const active = m.recurring.filter((r) => r.active)
  if (active.length) {
    lines.push("## Recurring (monthly)", "")
    for (const r of active) lines.push(`- ${r.description} (${names.get(r.category) ?? r.category}, ${r.type}): ${euro(r.amount)} on day ${r.dayOfMonth}`)
    lines.push("")
  }
  return lines.join("\n")
}
