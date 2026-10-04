# Finance app

Autocratico can mirror a separate finance app (expenses and earnings, its own Hono + Postgres server, with a REST API and an SSE change feed at `/api/events`) and show it in the **Finance** view: this month against the 12-month average, a week/month/year trend, spending by category, the next 12 months of expenses (the finance app's recurring templates and the register's payments, labelled by source) and the investments from your brokers' snapshots.

## Connect

1. On the finance server, create an API token (only its SHA-256 is stored there, it is printed once):
   ```bash
   bun run token create autocratico --scope write   # or --scope read for view only
   ```
   `write` lets autocratico add and delete transactions, nothing else; `read` is GET only. `bun run token list` / `bun run token revoke <id>` manage them.
2. In autocratico: **Settings → Finance app**, address and token, **Connect**. The server checks the token, saves it in `data/secrets/finance.json` (0600, never sent to the browser) and syncs everything.

On the homelab both apps run in Dokploy: the finance `api` service joins `dokploy-network` with the alias `finance-api`, and so does autocratico (`deploy/compose.homelab.yml`). The address is then `http://finance-api:3000`, and the data never leaves the host (no Cloudflare in between).

## Sync

- **Live**: the server keeps the finance app's change feed open. A change to transactions, categories, tags or recurring templates re-reads the last 3 months of transactions and the small collections about a second later; the open web app is told through `/api/events` and reloads. On reconnect it catches up the same way.
- **Hourly**: the `finance` job re-reads every transaction (it also fixes edits to older months). One Telegram alert per failure streak, with no amounts.
- Files: `data/finance.toml` (address, versioned), `data/finance/mirror.json` (the data), `data/finance/summary.md` (monthly totals per category for the chat agent, amounts in `||…||`), `data/finance/links.json` (occurrence → transaction recorded there). The `finance/` folder is server-owned and not in the register's git history.

## Paid deadlines → expenses

Marking an occurrence with an amount as done asks whether to record it in the finance app (amount, date, category, description; never automatic). Un-marking it offers to delete that expense. In `deadlines.toml`:

- `finance_category = "<category id>"` preselects the category;
- `finance_recurring = "<template id>"` says that the finance app's recurring template is the same payment: the Finance view shows the deadline and leaves the template's projection out, so it is not counted twice.

## Investments

There is no API for Trade Republic or Degiro that does not need your password or PIN, which autocratico never stores. Add a screenshot, CSV export or statement of the portfolio to the inbox (upload, share sheet, Telegram): the agent adds a `[[snapshot]]` to `data/investments.toml` (date, broker, cash, positions with value and, when shown, ISIN, quantity and cost). The view carries each broker's latest snapshot forward to chart the total.
