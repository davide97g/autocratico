# Architecture

```
             iPhone / Mac (PWA)        iOS/macOS Shortcut       Telegram app
                    │                          │                      │
                    ▼                          ▼                      │ (Bot API, long polling:
    HTTPS proxy / tunnel (Caddy, Tailscale, ──┐                       │  outbound only)
    Cloudflare Tunnel + optional Access)       ▼                      ▼
 ┌──────────────────────── any Docker host (or a laptop): one container ─────────────────┐
 │  apps/server (Hono, Node 24)                                                           │
 │   ├─ /api  session · data · done · chat · ingest · inbox · activity · account · status │
 │   ├─ web app (apps/web/dist, PWA)                                                      │
 │   ├─ scheduler: gmail (10 min) · triage (on new items) · finance (hourly)             │
 │   │             reminders (08:30) · digest (Mon 08:00) · backup (03:00)                │
 │   │             energy (Mon 06:30) · rules (1st, 07:00) · taxreturn (1 Mar)            │
 │   ├─ Telegram bot: notifications, commands, chat, files → inbox                        │
 │   ├─ ntfy: the same notifications as push, redacted (optional)                         │
 │   ├─ finance connector: http server (REST + SSE) or bank CSV exports (optional)        │
 │   └─ claude -p  (headless Claude Code, user's subscription)                            │
 │         read: chat, digest · triage: edits data/ only, no web (triage, taxreturn)      │
 │         research: rules, reads and edits catalog/ only, official sites                 │
 │  scripts/*.py: gmail.py sync --all · upcoming.py · ics.py · offers.py (ARERA data)     │
 └─────────────────────────────────────┬──────────────────────────────────────────────────┘
                                       ▼
                     /data (bind mount): TOML + Markdown + inbox + archive, local git
```

## Flow of a document

1. It arrives: an email in a synced Gmail account, a file shared from the iPhone share sheet, a photo sent to the Telegram bot, an upload or a WhatsApp export in the web app.
2. It becomes an inbox item: `data/inbox/<date>-<source>-<slug>-<id6>/` with `item.json`, `content.md` and the files (emails point to `archive/email/...`).
3. About a minute later the **triage** job runs Claude Code with the `triage` profile on the new items. The agent follows the rules in `AGENTS.md`: deadlines in `deadlines.toml`, a case in `cases/`, a Timeline line, the journal. It cannot touch secrets, server-owned files, or the web.
4. The server reads the agent's JSON result, updates the items, commits the data folder (`data/.git`) and sends a redacted summary to Telegram and/or ntfy, with a link to **Activity**, where every change can be reviewed and undone.

## Live updates

The open web apps never need a reload to see a change. `apps/server/src/pulse.ts` watches the data folder (recursively) and the jobs' progress, and `/api/events` (server-sent events) names the part that changed: `data` (deadlines, state, profile, cases, catalog, investments), `inbox`, `archive`, `activity` (a new commit), `jobs`, `chats`, `reminders`, plus `finance` from the finance mirror. Each view reads its part again; occurrences that changed glow once and a notice says so. If the stream cannot stay open (a proxy that buffers it, a filesystem without recursive watching), the views fall back to polling.

## The chat can act, without write access

The chat agent (web and Telegram) stays read-only. When the user asks for a reminder or gives information to record, it ends its answer with a `reminder` or `inbox` fenced block; the server validates it, creates the reminder (sent on Telegram or ntfy when due, checked every 30 s) or an inbox item for the background agent, removes the block from the answer and confirms what it did.

## Entry points

| Entry point | How | Auth |
|---|---|---|
| Web app / PWA (iPhone, Mac, any browser) | `https://<host>/` | masterpass session cookie (one owner per instance, Better Auth), Cloudflare Access in front when configured |
| iOS/macOS share sheet | Shortcut → `POST /api/ingest` | ingest-only bearer token (+ Access service token behind Cloudflare Access) |
| Telegram | bot in a private chat: text, voice (transcribed locally), files | paired chat ids |
| Gmail (several accounts) | `gmail.py sync --all` every 10 min | OAuth per account, read-only |
| Email from anywhere | forward to a synced Gmail account, or post it to `/api/ingest` ([customize/email.md](customize/email.md)) | — |
| WhatsApp | Export chat → share to the Shortcut or upload the .zip | as above |
| Finance | `http` connector (change feed + hourly) or `csv` files in `finance/import/` | token in `secrets/finance.json` |
| Native apps (later) | same API, `/api/openapi.json` | masterpass session |

## Why these choices

- **Claude Code headless, not a third-party agent harness.** The unmodified `claude` binary on the user's own subscription is what Anthropic's terms allow; routing subscription credentials through other harnesses is not. Usage counts against the subscription limits.
- **Bot API, not a Telegram user client; WhatsApp exports, not unofficial clients.** No risk for the user's accounts.
- **Files, not a database.** The register stays readable and editable by hand and by any agent; git gives history and undo.
- **One container.** Server, jobs, bot and agent share one process and one data folder, so writes are serialised in one place.
