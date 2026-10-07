# Configuration

Everything about an install is either in the data folder (the register, `finance.toml`, `gmail.toml`, `notes/INSTRUCTIONS.md`, set from the web app or by the agent) or in environment variables, listed here. For Docker, put them in `deploy/.env` ([deploy/.env.example](../deploy/.env.example)); locally, export them before `pnpm start`.

## Server (`apps/server/src/config.ts`)

| Variable | Default | What it does |
|---|---|---|
| `AUTOCRATICO_DATA` | `data/` in the repository | the data folder (`~` allowed). The Python scripts read it too. |
| `AUTOCRATICO_AUTH` | `dev` (`prod` in the Docker image) | `dev`: loopback only. `prod`: any interface, needs `PUBLIC_ORIGIN`, setup code on first start. Both need the masterpass. |
| `PUBLIC_ORIGIN` | — | `prod` only, required: the HTTPS address of the app. Browser writes must come from it. |
| `CF_ACCESS` | on when `CF_ACCESS_TEAM` and `CF_ACCESS_AUD` are set | `off`: no Cloudflare Access, the masterpass alone guards a `prod` server. |
| `CF_ACCESS_TEAM`, `CF_ACCESS_AUD` | — | Cloudflare Access team name and application AUD tag ([self-hosting.md](self-hosting.md)). |
| `HOST`, `PORT` | `127.0.0.1`, `8790` | where the server listens (`0.0.0.0` in the Docker image). |
| `AUTOCRATICO_JOBS` | `on` in `prod`, `off` in `dev` | scheduled jobs: Gmail sync, filing what arrives (triage), finance sync (and payments found there), reminders, Monday digest, nightly backup, the weekly energy offers comparison, the monthly re-check of the catalog rules (`rules`), the tax return case on 1 March (`taxreturn`). Locally, `AUTOCRATICO_JOBS=on pnpm start` turns the agent on. |
| `TZ_DEADLINES` | `Europe/Rome` | time zone of "today", the reminders and the job schedules, for the server and the Python scripts. In Docker it follows `TZ`. |
| `AUTOCRATICO_LOCALE` | `it` | `it` or `en`: language of Telegram, ntfy, job messages and the background agent's summaries. The web app has its own switch. |
| `TELEGRAM_BOT_TOKEN` | — | turns the Telegram bot on ([telegram.md](telegram.md)). |
| `NTFY_URL`, `NTFY_TOKEN` | — | push notifications through ntfy: a topic URL, and a token for a protected server ([ntfy.md](ntfy.md)). |
| `BACKUP_DIR` | — (`/backups` in Docker) | where the nightly `autocratico-YYYY-MM-DD.tar.gz` go; unset, no backup archives. |
| `BETTER_AUTH_SECRET` | generated into `data/secrets/auth.json` | signs the session cookies; set it only to manage it yourself. |
| `CLAUDE_BIN` | `claude` on `PATH`, else `~/.local/bin/claude` | the Claude Code binary for the chat and the agent. |
| `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY` | your local Claude Code login | how Claude Code authenticates on a server (`claude setup-token`, or an API key). Passed through to `claude -p`. |
| `CLAUDE_CONFIG_DIR` | Claude Code's default | where Claude Code keeps sessions (`/home/node/.claude` in Docker, a volume). |
| `PYTHON` | `python3` | the interpreter for `scripts/`. |
| `ASR_DIR` | `/asr` | a folder with `parakeet-cli` and a ggml model, for voice messages ([self-hosting.md](self-hosting.md#speech-to-text)). |
| `ASR_BIN`, `ASR_MODEL`, `ASR_THREADS` | from `ASR_DIR` or `PATH`; `4` threads | the same, file by file. Speech to text needs `ffmpeg` too. |

## Docker Compose (`deploy/compose.yml`)

| Variable | Default | |
|---|---|---|
| `AUTOCRATICO_DATA_DIR` | `../data` (the clone's `data/`) | host folder mounted as the data folder |
| `AUTOCRATICO_BACKUP_DIR` | `../backups` | host folder for the nightly archives |
| `AUTOCRATICO_ASR_DIR` | — | with `compose.asr.yml`: host folder mounted at `/asr` |
| `TZ` | `Europe/Rome` | container time zone and `TZ_DEADLINES` (also a build argument) |
| `PORT` | `8790` | host port, bound to `127.0.0.1` |

## Scripts (`scripts/`)

| Variable | |
|---|---|
| `AUTOCRATICO_DATA` | the data folder, as above (`store.py`) |
| `TZ_DEADLINES` | "today" for `upcoming.py` (`store.today()`) and `when.py` |
| `WHEN_NOW` | `when.py` only: pretend it is this moment (tests) |

## Builds

| Variable | Used by | |
|---|---|---|
| `VITE_API_BASE` | `apps/web` | API address when the web app is served from elsewhere (native shells) |
| `REPO_URL` | `apps/web` demo, `apps/site` | the repository the fork button and the install prompt point to; set it when building from a fork |
| `SITE_URL`, `DEMO_URL`, `GA_MEASUREMENT_ID`, `SITE_OWNER`, `SITE_CONTACT_EMAIL` | `apps/site`, demo | maintainer-only: [maintainer/site-and-demo.md](maintainer/site-and-demo.md) |
| `WAITLIST_ORIGINS`, `TYPESAFE_API_KEY`, `DATABASE_URL` | `apps/waitlist` | maintainer-only, same page |
