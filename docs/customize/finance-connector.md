# Finance connectors

What you can change here: where the Finance view gets expenses and earnings. Two connectors ship. **`http`** talks to any server that speaks the small contract below; your own app, or a thin adapter in front of a budgeting tool, works if it follows it. **`csv`** reads your bank's exports. A new source (a bank API, a different budgeting app) is one more connector.

The rest of the pipeline is the same for every connector:
- the mirror in `data/finance/mirror.json`
- `summary.md`, which the agents read
- `links.json`, the paid occurrences recorded as expenses
- the hourly `finance` job
- the live updates to the web app

All of it lives in `apps/server/src/finance.ts`.

## The `http` contract

The implementation is `apps/server/src/finance-http.ts`. Settings asks for a base URL (`http` or `https`) and a token.

### Requests

- Every request carries `Authorization: Bearer <token>` and `Accept: application/json`.
- JSON requests also send `X-Client-Id: autocratico`.
- Redirects are refused, so serve the API at the exact address you give.
- Requests time out after 20 s.

| Method and path | Answer | When |
|---|---|---|
| `GET /api/transactions` | array of transactions | full sync (hourly, Sync now) |
| `GET /api/transactions?from=YYYY-MM-DD` | transactions dated on or after `from` | after a change (the last 3 months) |
| `GET /api/categories` | array of categories | every sync; also the connection check |
| `GET /api/tags` | array of tags (may be `[]`) | every sync |
| `GET /api/recurring` | array of recurring templates (may be `[]`) | every sync |
| `POST /api/transactions` | the created transaction, at least `{ "id": "…" }` | recording a paid deadline |
| `DELETE /api/transactions/:id` | anything 2xx; 404 is fine | undoing that |
| `GET /api/events` | `text/event-stream` | kept open for live updates |

### Shapes

Rows that don't match are skipped; unknown fields are ignored.

- **Transaction**:
  - Required: `id` (string), `date` (`YYYY-MM-DD`).
  - `amount`: a number, or a numeric string. Positive; `type` gives the direction.
  - `type`: `"earning"`, or anything else for an expense.
  - Optional: `description`, `category` (a category id), `tag` (a tag id), `recurringId`.
- **Category**:
  - Required: `id`.
  - Optional: `name`, `type` (`"earning"` or expense), `color`.
  - `excludeFromBudget: true` hides it behind the "outside the budget" switch.
- **Tag**: `id`, and optionally `name` and `color`.
- **Recurring template**: `id`, plus `description`, `amount`, `category`, `type`, `tag`, `dayOfMonth` (default 1), `active` (default true) and `lastPeriod`.
  - `lastPeriod` (`YYYY-MM`) is the last month the source has already generated.
  - Autocratico projects one occurrence per later month on `dayOfMonth`, clamped to the month's length (`projectRecurring` in `packages/core/src/finance.ts`).
  - Only active expense templates are projected.

The POST body is:

```json
{ "date": "2026-11-28", "amount": 210.4, "description": "Car tax", "category": "<category id>", "type": "expense", "month": "November", "year": "2026" }
```

`month` and `year` are extras for servers that store them apart; ignore them otherwise.

### Errors

| Your answer | What the user sees |
|---|---|
| 401 | "the finance server refused the token" |
| 403 | "the token may not do this" (a read-only token can sync but not record expenses) |
| Any other non-2xx, an unreachable server, or a body that isn't a JSON array | the sync fails, the error shows in Settings, and Telegram/ntfy get one alert per failure streak |

### Change feed (optional)

`GET /api/events` stays open and sends server-sent events:

- `event: ready` once it is connected. Autocratico then catches up with a "recent" sync, and Settings shows **Live**.
- `event: change` with `data: {"collection": "transactions"}` when something changed. Only `transactions`, `categories`, `tags` and `recurring` trigger a sync, and several changes in a row become one.
- Anything else (for example `: ping` comments) at least every 75 s. Silence for longer counts as a dead stream; Autocratico reconnects with backoff from 5 s to 5 min.

Without a feed everything still works: the hourly sync and **Sync now** pick changes up.

### A minimal server

```ts
// node minimal-finance.ts — in-memory, for trying the contract out
import { createServer } from "node:http"

const TOKEN = process.env.FINANCE_TOKEN ?? "change-me-to-a-long-token"
const db = {
  transactions: [{ id: "t1", date: "2026-01-05", amount: 42.5, description: "Groceries", category: "food", type: "expense" }],
  categories: [{ id: "food", name: "Food", type: "expense" }],
  tags: [],
  recurring: [],
}
let n = 1

createServer(async (req, res) => {
  const send = (status: number, body: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body))
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, { error: "unauthorized" })
  const url = new URL(req.url ?? "/", "http://x")
  const [, api, collection, id] = url.pathname.split("/")
  if (api !== "api") return send(404, {})
  if (collection === "events") {
    res.writeHead(200, { "content-type": "text/event-stream" }).write("event: ready\ndata: {}\n\n")
    const ping = setInterval(() => res.write(": ping\n\n"), 25_000)
    return req.on("close", () => clearInterval(ping))
  }
  const rows = db[collection as keyof typeof db] as Record<string, unknown>[] | undefined
  if (!rows) return send(404, {})
  if (req.method === "GET") {
    const from = url.searchParams.get("from")
    return send(200, from ? rows.filter((r) => String(r.date) >= from) : rows)
  }
  if (req.method === "POST" && collection === "transactions") {
    let body = ""
    for await (const chunk of req) body += chunk
    const row = { ...JSON.parse(body), id: `t${++n}` }
    rows.push(row)
    return send(201, row)
  }
  if (req.method === "DELETE" && collection === "transactions") {
    const i = rows.findIndex((r) => r.id === id)
    if (i < 0) return send(404, {})
    rows.splice(i, 1)
    return send(200, { ok: true })
  }
  send(405, {})
}).listen(3000)
```

Then go to Settings → Finance → Finance server (API), enter address `http://localhost:3000` and the token.

## The `csv` connector

The implementation is `apps/server/src/finance-csv.ts`. It is read-only: paid deadlines are never recorded there, and the record dialog doesn't appear.

- **Where the files go**: bank exports belong in `data/finance/import/*.csv`. Drop them there by hand, or send them to the inbox. With `connector = "csv"`, the background agent copies a transaction export into that folder.
- **Live updates**: the folder is watched, so a new file syncs within seconds.
- **Mapping**: saved in `data/finance.toml` from Settings.

  ```toml
  connector = "csv"

  [csv]
  date = "Data"               # column names as in the header row (case and spaces ignored)
  amount = "Importo"
  description = "Descrizione"
  category = "Categoria"      # optional: without it everything is "Uncategorized"
  delimiter = ";"             # "," | ";" | "\t"
  decimal = ","               # "." (1,234.56) | "," (1.234,56)
  date_format = "DD/MM/YYYY"  # YYYY-MM-DD | DD/MM/YYYY | MM/DD/YYYY | DD.MM.YYYY | DD-MM-YYYY
  expense_sign = "negative"   # expenses are negative amounts (most banks) or "positive"
  ```

- **Reading amounts**: currency signs, spaces and thousands separators are ignored, and `(12.00)` counts as negative.
- **Skipped rows**: rows without a valid date or amount, such as totals, balances and pending lines.
- **Overlapping exports don't double count**. A transaction's id is a hash of its date, amount and description, plus its position among identical rows in the same file. The same row in two exports therefore gets the same id.
- **Files**:
  - UTF-8 is used when the file is valid UTF-8. Otherwise Latin-1, which many banks still use.
  - Files over 20 MB are refused.
  - Disconnecting keeps the files.
- **Categories**: a category's id is its lowercased name. A category is an earning one only when every row in it is an earning.

Other bank formats need more code. A separate debit/credit column pair, for example, needs a new mapping field in `FinanceCsvMapping` and a line in `CsvConnector.read()`.

## Adding a connector

1. **Implement `FinanceConnector`** (`apps/server/src/finance-connector.ts`) in a new `apps/server/src/finance-<name>.ts`:
   - `kind` and `capabilities` (`write`, `live`, `recurring`).
   - `incremental`: whether `read(since)` can return only recent transactions.
   - `check()`: throw `FinanceError(400, "…")` with a message the user can act on.
   - `read()`: return data already in the core shapes.
   - Optionally `watch()`, plus `create()` and `remove()` when `write` is true.

   The source's data comes from outside: map it into fixed shapes and keep nothing else.
2. **Schema** (`packages/core/src/schema.ts`): add the kind to `FINANCE_CONNECTORS` and a branch to the `FinanceConnectInput` discriminated union. If it has settings worth showing, add them to `FinanceSetup` too.
3. **Server** (`apps/server/src/finance.ts`): extend `Settings`, `#settings()` (reading `finance.toml`), `#connector()`, `connect()` (what gets written to `finance.toml` and what goes to `secrets/finance.json`) and `setup()`.
   - Secrets go only in `data/secrets/` through `writeSecret`, never in `finance.toml` (which is versioned) and never back to the browser.
4. **Settings form** (`apps/web/src/components/finance.tsx`, `FinanceCard`): a branch for the new kind, and strings in `apps/web/src/i18n/en.ts` and `it.ts` (`finance.connectors`, `finance.connectorHint` and the new fields).
5. **Demo** (`apps/web/src/demo/backend/router.ts`): it must keep answering `/api/finance` with the `FinanceSetup` shape. `apps/web/test/demo.test.ts` checks this.
6. **Tests**: copy the pattern of `apps/server/test/finance.test.ts` (a fake HTTP server through the `fetcher` option) or `finance-csv.test.ts` (files in a temp data folder). Cover:
   - connect
   - the read-only refusal when relevant
   - the token never leaving the server
7. **Docs**: this page, and `docs/finance.md`.

[docs/bank-sync.md](../bank-sync.md) researches a PSD2 bank source (Enable Banking): accounts read straight from the bank. It would be a read-only, incremental connector.

## Check

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @autocratico/server exec vitest run test/finance.test.ts test/finance-csv.test.ts
pnpm --filter @autocratico/core test     # trends, future expenses, recurring projection
```
