# Generative UI: widgets made by the agent

**Status:** built (first version). Research verified on 2026-10-14; the specs below are young and change often, re-check them before borrowing more from one.

The chat agent can design small dashboards ("widgets") out of the register: a chart of what is left to pay by area, the car's deadlines with a countdown, the monthly spending on groceries, a case's progress. It proposes them in the chat with a live preview; the user adds them to the **Board** page, asks for changes, reorders or removes them.

## Research

Generative UI is UI that an agent chooses or writes at runtime. [CopilotKit](https://www.copilotkit.ai/generative-ui) sorts the approaches in three:

| Approach | What the agent sends | Pros | Cons |
| --- | --- | --- | --- |
| Controlled (static) | Which of the app's own components to show, and its data | Polished, predictable | A new component for every new need |
| Declarative | A structured spec drawn from a catalog of building blocks; the client renders it | Many uses from few blocks, validated, same look as the app | Only what the catalog can express |
| Open-ended | Whole HTML/JS, rendered in a sandboxed iframe | Anything goes | Slow, costly, error-prone, off-brand, security surface |

The specs behind them:

- **AG-UI** (CopilotKit): an event protocol between an agent backend and a frontend (messages, tool calls, shared state). It is transport, not a UI format.
- **A2UI** ([google/A2UI](https://github.com/google/A2UI), Apache-2.0, v0.9, "early stage public preview"): declarative JSON, a *flat list of components referencing each other by id* plus a data model; the client keeps a catalog of trusted components and renders them natively. Flat lists suit LLMs (no deep nesting to balance) and incremental updates.
- **json-render** ([vercel-labs/json-render](https://github.com/vercel-labs/json-render), Apache-2.0): the same idea for React. A spec is `{ root, elements: { id: { type, props, children } } }`; the catalog is a set of Zod schemas, from which it also writes the system prompt; props can bind to state (`$state`, `$cond`, `$template`). Ships a shadcn set built on Radix.
- **MCP Apps** (SEP-1865, `ui://` resources): an MCP server ships HTML that the host shows in a sandboxed iframe, talking JSON-RPC over `postMessage`. Made for third-party tools inside ChatGPT, Claude and Cursor.

## What fits Autocratico

**Declarative, with a catalog of our own and data bound to the register.** Reasons:

1. **Privacy.** Widgets do not carry numbers: they carry *queries* ("open payments of the next 6 months, by area"). The web app computes them from the data it already has, so a widget stays true when the register changes, and amounts go through the same privacy mode as the rest of the app (`<Sensitive>`, `<Amount>`).
2. **The agent stays read-only.** The chat agent already asks the server to act with fenced blocks (`reminder`, `inbox`, `change`) that the server validates. A `widget` block is one more: validated by Zod in `packages/core`, never written by the agent itself.
3. **No new attack surface.** The app's CSP allows only its own scripts (`script-src 'self'`). Open-ended HTML would need iframes, a looser CSP and data handed into them; a JSON spec rendered by our own components needs nothing.
4. **Same look.** The catalog is made of the app's shadcn components and design tokens, so widgets follow the palettes, dark mode and the status colors.
5. **Cheap.** A spec is a few hundred tokens; HTML and JS would be thousands, for every edit.

We borrow the shape from A2UI and json-render (flat element map, catalog in Zod, a prompt written from the catalog) but not the libraries: json-render's shadcn set is Radix while the app is on base-ui, and its state bindings answer a need we do not have. Our "bindings" are register queries, which no library knows. The spec format stays close to json-render's, so moving to it later is a small step.

**Not now:** open-ended HTML (could come later as a sandboxed `srcdoc` iframe with `sandbox="allow-scripts"`, `connect-src 'none'` and data passed by `postMessage`, for the rare widget the catalog cannot express); MCP Apps (third-party tools, not our case); AG-UI (our chat already streams NDJSON events).

## How it works

```
user: "fammi un grafico di quanto devo pagare nei prossimi 6 mesi, per area"
  agent (read-only) reads board.json and the data, answers with
  ```widget
  {"id": "pagamenti-6-mesi", "title": "Pagamenti, 6 mesi", "size": "medium", "spec": {...}}
  ```
  server: validates the block (core/widgets.ts); invalid → "⚠️ Widget not valid: …"; valid → kept in the answer
  web chat: renders the preview live + "Add to the board" / "Update" (same id already there)
  click → PUT /api/board/widgets/:id → validated again, board.json written, one commit (undo from Activity)
  Board page: the widgets, live; "Ask for a change" opens the chat about that widget
```

- **Storage:** `data/board.json` (`{ version, widgets: [{ id, title, size, spec, created, updated }] }`), server-owned: the background agent cannot write it, the chat agent reads it. Each add, update, move or removal is one commit in the data folder's history.
- **Spec:** `{ root, elements }`, at most 40 elements, ids `[a-z0-9_-]`, children must exist, no cycles. Catalog: layout (`Grid`, `Stack`, `Section`), text (`Heading`, `Text`, `Callout`), data (`Metric`, `Progress`, `Chart`, `Deadlines`, `Cases`, `Countdown`), actions (`Button`: open a view, a deadline or a case, or ask the chat).
- **Queries** (`from`): `deadlines` (agenda occurrences: window, areas, ids, severity, status, payments only, done), `transactions` (finance source), `portfolio` (investment snapshots), `cases`. Charts add `by` (month, week, area, category, broker, date) and `measure` (amount or count). Values: a number, `{ "count": query }`, `{ "sum": query }`.
- **Prompt:** the catalog's description for the agent lives next to the Zod schemas (`WIDGET_INSTRUCTIONS` in `core/widgets.ts`); a test fails when a component is missing from it.
- **Telegram:** a widget cannot be shown there; the answer says one was proposed and to open the web app.
- **Demo:** the demo backend answers the board routes and seeds two widgets.

## Next steps

- The background agent proposing widgets when a case opens (as drafts the user accepts).
- More blocks when a real need shows up: a table, a calendar strip, energy offers.
- A sandboxed HTML escape hatch, only if the catalog proves too narrow.
