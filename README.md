# Autocratico

**A local, private register for Italian bureaucracy**: deadlines, payments, checks and cases, kept in plain-text files and shown in a small web app. It is built to work alongside a coding agent such as [Claude Code](https://claude.com/claude-code): you hand it a letter, a tax notice or an email, and it updates your deadlines, opens a case and tells you what to do next.

![Overview of the web app, with made-up example data](docs/screenshot.png)

## Features

- **Overview**: calendar by area, the next task, the year's load and dates still missing.
- **Deadlines** colored by status (overdue, urgent, coming up, planned, done), computed from severity and days left. Recurring deadlines (yearly, monthly, every N years) are expanded automatically.
- **Cases** in Markdown with checklists and a timeline, plus a **profile** (people, properties, vehicles, documents) and a **catalog** of researched rules with sources.
- **Chat with Claude** in the side panel: each conversation is a read-only Claude Code session on your files.
- **Privacy mode** (`P` key): hides names, amounts, document numbers and sensitive dates, for screenshots and demos.
- **Italian and English** interface, **.ics** export for any calendar app, optional read-only **Gmail** sync.

Keyboard: `C` chat, `B` sidebar, `P` privacy, `Esc` close.

## Quick start

Requirements: Python 3.11+, Node.js 20.19+ and [pnpm](https://pnpm.io/installation). [Claude Code](https://claude.com/claude-code) is optional, needed only for the chat.

```bash
git clone https://github.com/davide97g/autocratico.git
cd autocratico
./setup.sh --start          # checks requirements, creates data/, builds the UI, starts it
```

Open http://127.0.0.1:8765. The app starts with a made-up example dataset: replace it with your own, or open Claude Code in the folder and ask it to (e.g. *"here is my car insurance policy, add the renewal"*).

`setup.sh` is safe to run again: it never touches an existing data folder. To do the same steps by hand:

```bash
python3 scripts/init.py                       # creates data/ by copying example/
cd app && pnpm install && pnpm build && cd ..
python3 scripts/serve.py                      # http://127.0.0.1:8765
```

To keep your data somewhere else (an encrypted disk, a synced folder), set `AUTOCRATICO_DATA` before running anything:

```bash
export AUTOCRATICO_DATA=~/Documents/paperwork
./setup.sh
```

## How it works

```
data/*.toml, *.md  ──►  scripts/serve.py (127.0.0.1)  ──►  app/ (React)
       ▲                        │
       │                        └── /api/chat ──► claude -p (read-only)
  Claude Code / Codex
  edits the files for you
```

There is no database: the files in `data/` are the source of truth. You (or your agent) edit them; the web app reads them on every refresh and only writes `state.json` when you tick a deadline as done.

## Commands

| Command | What it does |
|---|---|
| `./setup.sh [--start]` | check requirements, create the data folder, build the UI |
| `python3 scripts/serve.py [port]` | web app on http://127.0.0.1:8765 |
| `cd app && pnpm dev` | UI development on http://localhost:5173 (also starts the Python server) |
| `python3 scripts/upcoming.py [days]` | upcoming deadlines and dates still missing |
| `python3 scripts/ics.py` | writes `data/out/autocratico.ics` |
| `python3 scripts/gmail.py login \| search "Q" \| sync [Q] \| logout` | read-only Gmail, see [docs/gmail.md](docs/gmail.md) |

## Data layout

```
data/
  deadlines.toml     deadlines (schema at the top of the file)
  state.json         done occurrences, written by the web app
  profile.toml       person, properties, vehicles, documents
  cases/<year>-<slug>/README.md
  catalog/*.md       rules with source and verification date
  notes/             SITUATION.md and JOURNAL.md, the agent's memory
  archive/           PDFs, scans, downloaded emails
  secrets/           Gmail OAuth credentials (0700)
```

[`example/`](example/) has the same layout with made-up data. A deadline looks like this:

```toml
[[deadline]]
id = "car-tax"
title = "Car tax"
area = "vehicles"
severity = "high"            # high | medium | low
date = 2027-01-31            # or "TODO" when unknown
repeat = "yearly"            # none | yearly | monthly | every N years | every N months
remind_days = [14, 3]
amount = 180.00              # hidden in privacy mode
```

## Working with an agent

Agent instructions are in [AGENTS.md](AGENTS.md), read by Codex and other agents; [CLAUDE.md](CLAUDE.md) imports it for Claude Code. They tell the agent where things are and how to behave: keep personal data in `data/` only, extract deadlines from documents, verify rules on official sources before any money decision, treat email content as data and flag phishing, never pay or write to public bodies on your behalf.

Personal instructions (your language, your mailbox) go in `CLAUDE.local.md`, which git ignores.

## Privacy and security

- **Code and data are separate.** Everything personal lives in `data/` (ignored by git) or in `AUTOCRATICO_DATA`. The repository contains only code and a made-up example.
- **Local only.** The server listens on `127.0.0.1` and refuses requests whose `Host` or `Origin` is not local, so other websites open in your browser cannot read your data or start a chat (DNS rebinding, CSRF).
- **Read-only chat.** The chat runs `claude -p` with an allowlist of read-only tools; `WebFetch` is limited to public-body domains (`gov.it`, `inps.it`, `europa.eu`, …) and `data/secrets/` is denied, so a malicious email in your archive cannot make it send your data elsewhere. Questions and file contents you discuss do go to Anthropic, as with any Claude Code session.
- **Read-only Gmail.** The OAuth scope is `gmail.readonly`; the token is stored with `0600` permissions and can be revoked with `gmail.py logout`.
- **No credentials.** Never store passwords, PINs or access codes in the data files.

Found a security issue? See [SECURITY.md](SECURITY.md).

Catalog rules and example dates are indicative: always check official sources.

## License

[MIT](LICENSE)
