@AGENTS.md

## Claude Code notes
- All project instructions live in `AGENTS.md` (shared with other agents); keep this file for Claude-specific notes only.
- `CLAUDE.local.md` (git-ignored) holds personal notes for local sessions and is loaded automatically. Instructions that the server's agent must follow too go in `data/notes/INSTRUCTIONS.md`.
- The server runs `claude -p` (`apps/server/src/claude.ts`) with `--setting-sources project,local` and cwd at the repository root: it reads this file and `AGENTS.md`, but not the user's global settings or hooks. Tools are an allowlist per profile, in `dontAsk` mode, so anything else is denied without a prompt. On a server it authenticates with `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` (the user's own subscription, unmodified binary) or `ANTHROPIC_API_KEY`.
- The background agent (`triage` profile) must end its answer with the JSON block described in its prompt (`apps/server/src/jobs.ts`); the server reads it to update inbox items and notify Telegram/ntfy.
- When the user pastes a document, follow the "When a document arrives" rule in `AGENTS.md`.
- `/customize` (`.claude/commands/customize.md`) starts the fork-and-adapt process in `CUSTOMIZE.md`: use it when the user wants Autocratico to work differently, not to file documents.
