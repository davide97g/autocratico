/**
 * What a finance source must offer the mirror in finance.ts. Two connectors ship: `http` (a server speaking
 * the contract in docs/customize/finance-connector.md) and `csv` (bank exports dropped in finance/import/).
 * A new source is one more file implementing FinanceConnector, plus a case in finance.ts `#connector()`.
 *
 * Connectors return data already in the core shapes; everything else (mirror, links, summary, change
 * detection, the hourly job) is the same for all of them.
 */
import type { FinanceCapabilities, FinanceCategory, FinanceConnectorKind, FinanceExpenseInput, FinanceRecurring, FinanceTag, FinanceTransaction } from "@autocratico/core"

export class FinanceError extends Error {
  readonly status: 400 | 404 | 409 | 502

  constructor(status: 400 | 404 | 409 | 502, message: string) {
    super(message)
    this.status = status
  }
}

export type FinanceRead = {
  transactions: FinanceTransaction[]
  categories: FinanceCategory[]
  tags: FinanceTag[]
  recurring: FinanceRecurring[]
}

/** An open change feed. `live` is true while it is known to be working. */
export type FinanceFeed = { readonly live: boolean; close(): void }

export type FinanceConnector = {
  readonly kind: FinanceConnectorKind
  readonly capabilities: FinanceCapabilities
  /** Re-reads only transactions from a date on (the rest is kept from the mirror). */
  readonly incremental: boolean
  /** Checks the settings before they are saved; throws FinanceError with a message for the user. */
  check(): Promise<void>
  /** Everything, or (incremental connectors) the transactions dated `since` or later. */
  read(since: string | null): Promise<FinanceRead>
  /** Calls `ready` when the feed opens and `change` when something changed; keeps itself open until closed. */
  watch?(on: { ready(): void; change(): void }): FinanceFeed
  /** Records an expense; returns its id in the source. Only when `capabilities.write`. */
  create?(expense: FinanceExpenseInput): Promise<string>
  /** Deletes a transaction recorded by `create`; a missing one is not an error. */
  remove?(id: string): Promise<void>
}
