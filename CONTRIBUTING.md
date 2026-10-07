# Contributing

Thanks for helping. Autocratico is small on purpose: a change should be easy to read and easy to undo.

- **Start from [AGENTS.md](AGENTS.md).** It is the map of the repository and its rules, for people and agents alike (layout, data files, conventions, security-sensitive spots).
- **Adapting it to your own life** (another country, sources, notifications) belongs in your fork: see [CUSTOMIZE.md](CUSTOMIZE.md). Generic improvements to those extension points (a new finance connector, a notification channel, a third language) are welcome upstream.
- **Never include personal data**: not in code, tests, `example/`, docs, screenshots or commit messages. `example/` is made up.
- **Checks** before a pull request:
  ```bash
  pnpm lint && pnpm typecheck && pnpm test
  pnpm build:all
  ```
  Recurrence changes land in both `packages/core` and `scripts/store.py` (a parity test enforces it). New `/api` routes or response fields need an answer in the demo router (`apps/web/src/demo/backend/router.ts`, checked by `apps/web/test/demo.test.ts`).
- **Don't run `pnpm format` over the whole repository**: most files predate the Prettier config and would be rewrapped. Format only what you touch, if anything.
- **Security-sensitive files** (auth, the agent's tool profiles, redaction, connectors' secrets) are listed in AGENTS.md: say in the pull request what you changed there and why. Vulnerabilities go through [SECURITY.md](SECURITY.md), not issues.
- Code, comments, docs and commit messages in English; user-facing strings only in `apps/web/src/i18n/` (English defines the shape).
