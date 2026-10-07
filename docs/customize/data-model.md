# The data model

What you can change here: the fields of a deadline, the free-form profile, and new files in the data folder. Everything is plain text read on every request, so a change has to reach every reader. That means the TypeScript core, the Python CLIs, the chat's correction blocks, the agents' instructions, the templates and the demo.

## Adding a field to deadlines

Take `priority = "…"` as an example.

1. **Schema**: add the field to `Deadline` in `packages/core/src/schema.ts`, with a default (`.nullable()` or a plain default).
2. **TypeScript parser**: `parseDeadlines` in `packages/core/src/deadlines.ts` reads `deadlines.toml`. Validate the raw value and fall back to the default. If the field changes recurrence or amounts (`stepMonths`, `occurrenceAmount`), change those too.
3. **Python parser**: the `Deadline` dataclass and `load_deadlines()` in `scripts/store.py` mirror the core for `upcoming.py` and `ics.py`. `packages/core/test/parity.test.ts` runs `store.py` and compares; it fails until both sides agree on anything it serialises. A field the Python side doesn't need (like `finance_category`) can stay out of it.
4. **Chat corrections**: the chat agent edits deadlines through change blocks.
   - Add the field to `FIELDS` and `ORDER` in `apps/server/src/changes.ts`. `ORDER` is the line order written back to the file.
   - Add it to the field list the agent is told about, in `ACTION_INSTRUCTIONS` (`apps/server/src/chat-actions.ts`).
5. **Background agent**: if documents should set the field, say how in `TRIAGE_INSTRUCTIONS` (`apps/server/src/jobs.ts`) and in `AGENTS.md` (Data files).
6. **Templates**: describe the field in the comment header of `template/deadlines.toml` and `example/deadlines.toml`, and use it in an example deadline. `scripts/init.py` copies these, and the CI `init` step runs `upcoming.py` and `ics.py` on them.
7. **Web app**:
   - Show the field in the deadline details (`apps/web/src/views/deadline.tsx`) and wherever it matters.
   - Labels go in `apps/web/src/i18n/en.ts` and `it.ts`.
   - Personal values go through `<Sensitive>`.
8. **Demo**:
   - `apps/web/src/demo/backend/toml.ts` (`deadlineToml`) writes deadlines back.
   - The test checks that `parseDeadlines` reads them back identically, so add the field there too.
   - Give a few seeded deadlines a value in `apps/web/src/demo/backend/seed.ts`.

`state.json` (done occurrences) is written by the server only. Don't add fields there by hand; go through `apps/server/src/store.ts`.

## profile.toml

`profile.toml` is free-form: only `person.name` is read by the code.

- Keys are English `snake_case`, as the onboarding writes them. Values are in the user's language.
- A value made only of `archive/` or `inbox/` paths shows up as files in the Profile view.
- New sections need no code. To have the onboarding fill one, see `apps/web/src/views/onboarding.tsx` and `apps/server/src/profile.ts`.

## Adding a file to the data folder

First decide **who writes it**.

**Agent-editable** (like `deadlines.toml`, `cases/`, `investments.toml`):
- Document its schema at the top of the file and in `AGENTS.md`.
- Add an empty version to `template/` and an example to `example/`.
- Version it: add a `!/<file>` line to the ignore list in `apps/server/src/git.ts`, so every change becomes a commit you can undo.

**Server-owned** (like `state.json`, `reminders.json`, `chats/`, `jobs/`, `finance/mirror.json`):
- Add it to the `owned` list in `tools()` (`apps/server/src/claude.ts`) so the background agent can't edit it.
- Say "server-owned" in `AGENTS.md`.
- Read it with zod (`safeParse`) and write it with `writeJson`/`writeAtomic` from `apps/server/src/files.ts`, under a lock when two writers can race.

**Secrets**:
- Keep them only under `secrets/`, via `writeSecret` (`0600`).
- The agent profiles already deny that folder.
- Never send them to the browser.

**Live refresh**:
- `topicOf()` in `apps/server/src/pulse.ts` maps a changed path to a topic (`data`, `inbox`, `archive`…), and the open web apps refresh the matching views.
- Add the file there.
- A new topic needs adding in `TOPICS` (server) and in `apps/web/src/lib/events.ts`.

**API**:
- Expose the file through a route in `apps/server/src/app.ts`, with its shape in `packages/core/src/schema.ts`.
- List it in `apps/server/src/openapi.ts`.
- Answer it in the demo router (see [ui.md](ui.md)).

## Check

```bash
pnpm lint && pnpm typecheck && pnpm test     # includes the parity test and the demo's TOML round trip
python3 -m py_compile scripts/*.py
AUTOCRATICO_DATA=$(mktemp -d)/data sh -c 'python3 scripts/init.py && python3 scripts/upcoming.py 30 && python3 scripts/ics.py'
```
