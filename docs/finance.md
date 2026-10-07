# Finance

Autocratico can mirror a finance source (expenses and earnings) and show it in the **Finance** view: this month against the 12-month average, a week/month/year trend, spending by category, the next 12 months of expenses (the source's recurring templates and the register's payments, labelled by source) and the investments from your brokers' snapshots.

The source is a **connector**. Two ship:

| Connector | What | Live | Records paid deadlines | Recurring templates |
|---|---|---|---|---|
| `http` | a finance server speaking a small REST + SSE contract | yes (change feed) | yes, with a write token | yes |
| `csv` | your bank's CSV exports, in `data/finance/import/` | yes (folder watch) | no, read-only | no |

The contract, the CSV details and how to add another connector (a bank API, a budgeting app's export) are in [customize/finance-connector.md](customize/finance-connector.md).

## Connect a finance server (`http`)

1. On the finance server, create an API token for autocratico. A token that can write lets autocratico add and delete the transactions it recorded, nothing else; a read-only one is enough to look.
2. In autocratico: **Settings → Finance → Finance server (API)**, address and token, **Connect**. The server checks the token, saves it in `data/secrets/finance.json` (0600, never sent to the browser) and syncs everything.

Keep the finance server reachable from autocratico's server only (same host, a private Docker network, a tailnet): the data then never crosses the internet.

## Connect your bank's exports (`csv`)

1. In **Settings → Finance → Bank exports (CSV)**, write the column names as they appear in the first row of your bank's export (date, amount, description and, if there is one, category), the separator, the decimal mark, the date format and whether expenses are negative or positive amounts. **Connect** checks every file already in the folder against them.
2. Put exports in `data/finance/import/` (any name ending in `.csv`), or send them to the inbox (upload, share sheet, Telegram): the agent writes a copy there. The server notices new files within a second.

Overlapping exports (January–March, then February–April) are counted once. Rows without a valid date or amount (totals, notes) are skipped; files in Latin-1 are read too.

## Sync

- **Live**: an `http` source's change feed, or the `csv` folder watch, triggers a sync about a second after a change; the open web app is told through `/api/events` and reloads. An `http` source re-reads only the last 3 months then.
- **Hourly**: the `finance` job re-reads everything (it also catches edits to older months). One notification per failure streak, with no amounts.
- Files: `data/finance.toml` (connector and settings, versioned; never the token), `data/finance/mirror.json` (the data), `data/finance/summary.md` (monthly totals per category for the chat agent, amounts in `||…||`), `data/finance/links.json` (occurrence → transaction recorded there). Those three are server-owned; `finance/import/` is yours and the agent's. Disconnecting removes the settings and the synced copy, never the CSV files.

## Paid deadlines → expenses

With a source that can write, marking an occurrence with an amount as done asks whether to record it there (amount, date, category, description; never automatic). Un-marking it offers to delete that expense. In `deadlines.toml`:

- `finance_category = "<category id>"` preselects the category (for `csv`, the category name in lower case);
- `finance_recurring = "<template id>"` says that the source's recurring template is the same payment: the Finance view shows the deadline and leaves the template's projection out, so it is not counted twice.

## Investments

Brokers rarely offer an API that does not need your password or PIN, which autocratico never stores. Add a screenshot, CSV export or statement of the portfolio to the inbox (upload, share sheet, Telegram): the agent adds a `[[snapshot]]` to `data/investments.toml` (date, broker, cash, positions with value and, when shown, ISIN, quantity and cost). The view carries each broker's latest snapshot forward to chart the total. This works with or without a finance source.
