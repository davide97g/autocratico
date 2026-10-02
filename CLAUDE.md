@AGENTS.md

## Claude Code notes
- All project instructions live in `AGENTS.md` (shared with other agents); keep this file for Claude-specific notes only.
- `CLAUDE.local.md` (git-ignored) holds personal instructions and is loaded automatically.
- The web app chat runs `claude -p` from `scripts/chat.py` with `--setting-sources project,local`: it reads this file and `AGENTS.md`, but not the user's global settings or hooks. Its tools are an allowlist (read-only, `WebFetch` limited to `DOMAINS`), in `dontAsk` mode, so anything else is denied without a prompt.
- When the user pastes a document, follow the "When a document arrives" rule in `AGENTS.md`.
