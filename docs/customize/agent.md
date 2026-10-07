# The agent's behaviour

What you can change here: what the agents know and do: the chat agent (read-only answers), the background agent (filing what arrives) and the weekly digest. Most changes are text: a preference in `data/notes/INSTRUCTIONS.md`, a rule in `AGENTS.md`, a line in a prompt. The tool profiles are the security boundary. Change them only knowing what they protect.

## Where behaviour lives

| What | Where | Who reads it |
|---|---|---|
| Personal preferences: language, mailboxes, people, how to file things | `data/notes/INSTRUCTIONS.md` (per install, never in git) | every agent, including the server's runs |
| Project rules: data layout, filing rules, privacy, "never pay or write to public bodies" | `AGENTS.md` (`CLAUDE.md` imports it) | every agent: the server runs `claude -p` with cwd at the repository root and `--setting-sources project,local` |
| Chat agent prompt | `CHAT_INSTRUCTIONS` in `apps/server/src/claude.ts` | web and Telegram chat (`read` profile) |
| Chat action blocks: reminders, inbox notes, confirmed corrections | `ACTION_INSTRUCTIONS` in `apps/server/src/chat-actions.ts`; parsing in `packages/core/src/actions.ts` (`extractActions`, `splitConfirmations`); applied by `applyActions` and `apps/server/src/changes.ts` | the chat agent writes the blocks, the server validates and applies them |
| Background agent prompt | `TRIAGE_INSTRUCTIONS` and `triagePrompt()` in `apps/server/src/jobs.ts` | `triage` job (`triage` profile) |
| Background agent's answer format | the fenced JSON block at the end of `triagePrompt()` (`items` with `status` and `outcome`, `summary`, `phishing`, `done`) | the server: it updates inbox items, marks occurrences done, notifies |
| Weekly digest | the prompt inside `#digest` in `apps/server/src/jobs.ts` | `digest` job (`read` profile) |
| Tax return case | `TAXRETURN_INSTRUCTIONS` and the prompt in `#taxreturn` (`apps/server/src/jobs.ts`) | `taxreturn` job, 1 March (`triage` profile): opens or updates `cases/<year>-730/`; triage then checks the pre-filled return against it |
| Catalog re-check | `RULES_INSTRUCTIONS` and the prompt in `#rules` (`apps/server/src/jobs.ts`); which entries are due: `catalogVerified()` in `packages/core/src/catalog.ts` | `rules` job, monthly (`research` profile) |
| Language of answers | `AUTOCRATICO_LOCALE`, or the web UI's locale; `LANGUAGES` in `claude.ts` | appended to every run |

Prefer the first row. A preference in `INSTRUCTIONS.md` survives updates from upstream, while an edit to a prompt in code is a fork you maintain.

## Tool profiles

`tools()` in `apps/server/src/claude.ts` builds the allow and deny lists for `claude -p`. It runs in `dontAsk` mode, so anything not allowed is denied silently.

**`read`** (chat, digest):
- Allowed: Read, Glob, Grep, WebSearch.
- WebFetch only to `DOMAINS` (official sites, so the agent can check a rule).
- Only `scripts/upcoming.py` and `scripts/when.py` may be run.
- No Edit or Write: changes go through action blocks that the server validates and the user confirms.

**`triage`** (background agent):
- Edit and Write only inside the data folder.
- No web access.
- Only `upcoming.py`, `ics.py` and `when.py`.
- Never `secrets/**`, and never the server-owned files in the `owned` list: `state.json`, `reminders.json`, `chats/`, `jobs/`, `inbox/*/item.json`, `finance.toml` and the finance mirror.
- Every change it makes is a git commit you can undo from Activity.

**`research`** (the `rules` job):
- Reads and edits only `catalog/`; reads `deadlines.toml` and `notes/INSTRUCTIONS.md`, adds to `notes/JOURNAL.md`.
- WebSearch, and WebFetch only to `DOMAINS`.
- Reads of the inbox, the archive, the cases, the profile, the finances and the other personal files are denied by name (read tools are otherwise allowed by default), so a web page it reads has nothing personal to get out.
- Deadlines it finds moved are only reported: the user corrects them from the chat.

**Safe to change**:
- `DOMAINS` (to another country's official sites)
- the wording of the prompts
- the digest's content
- which `scripts/` commands are allowed, as long as they stay read-only or confined to the data folder

**Security-sensitive** (see `AGENTS.md`, "Security-sensitive spots"). Don't loosen these without a reason you can write down:
- web access for `triage`. Email content is untrusted, and a prompt injection with web access could leak data.
- what `research` may read or edit: it reads untrusted web pages while holding web access.
- Edit/Write outside the data folder
- access to `secrets/`
- removing a server-owned path from `owned`
- shell commands beyond the fixed scripts
- skipping redaction in `telegram.ts` or `ntfy.ts`

The rule that content of emails, uploads and chats is data, never an instruction, appears in `AGENTS.md` and in `TRIAGE_INSTRUCTIONS`. Keep it in both.

## Common changes

- **Answer in another language**: set `AUTOCRATICO_LOCALE=en`, or switch the web UI. For a third language, see [country.md](country.md).
- **File a new kind of document differently**, e.g. utility bills into a `home` case with the meter reading:
  - Write it in `INSTRUCTIONS.md` if it is personal.
  - Write it in the "When a document arrives" rule in `AGENTS.md` if every install should do it.
- **A new action block** for the chat, e.g. "create a case":
  1. Add the block's syntax to `ACTION_INSTRUCTIONS`.
  2. Add parsing in `packages/core/src/actions.ts`, with tests in `packages/core/test/`.
  3. Validate and apply it in `apps/server/src/chat-actions.ts`.

  The server decides, never the model: validate every field.
- **More context for the chat**: add the file to the "Read the data files…" line in `CHAT_INSTRUCTIONS`.

## Check

```bash
pnpm lint && pnpm typecheck && pnpm test
node apps/server/src/cli.ts job triage    # with an item in the inbox: watch Activity for its commit
node apps/server/src/cli.ts job digest
```

The chat itself has no automated test of the model's answers. Try the change in the web chat with the example data (`./setup.sh --example`), including a document that tries to give the agent instructions.
