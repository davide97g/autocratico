# Autocratico

A personal register for Italian bureaucracy: deadlines, payments, checks and cases, kept in plain text files and shown in a local web app. It is meant to be run together with [Claude Code](https://claude.com/claude-code), which reads your documents, updates deadlines and answers questions.

- **Overview**: calendar by area, next task, the year's load, missing dates.
- **Deadlines** colored by status (overdue, urgent, coming up, planned, done) from severity and days left.
- **Cases** in Markdown with checklists and a timeline, plus a **profile** and a **catalog** of rules.
- **Chat with Claude** in the right-hand panel: every conversation starts a read-only Claude Code session on your data.
- **Privacy mode** (`P` key): hides personal data for screenshots and demos.
- **Italian and English** interface; **.ics** export for your calendar; optional read-only **Gmail** sync.

## Privacy

Code and data are separate. Everything personal lives in `data/`, which git ignores, or in the folder set by `AUTOCRATICO_DATA`. The server listens on `127.0.0.1` only. The repository holds only code and a made-up example dataset (`example/`).

## Requirements

- Python 3.11 or later (standard library only)
- Node.js and pnpm, to build the interface
- [Claude Code](https://claude.com/claude-code) in your `PATH`, only for the chat

## Getting started

```bash
python3 scripts/init.py            # creates data/ by copying example/
cd app && pnpm install && pnpm build && cd ..
python3 scripts/serve.py           # http://127.0.0.1:8765
```

To keep your data somewhere else (an encrypted disk, a synced folder):

```bash
export AUTOCRATICO_DATA=~/Documents/paperwork
python3 scripts/init.py
```

UI development: `cd app && pnpm dev` (also starts the Python server).

## Commands

| Command | What it does |
|---|---|
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
  notes/             SITUATION.md and JOURNAL.md for Claude
  archive/           PDFs, scans, downloaded emails
  secrets/           Gmail OAuth credentials
```

`example/` has the same layout with made-up data. Instructions for Claude Code are in [CLAUDE.md](CLAUDE.md).

Catalog rules and example dates are indicative: always check official sources.

## License

[MIT](LICENSE)
