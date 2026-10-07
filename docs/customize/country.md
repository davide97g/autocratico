# Another country, language or currency

What you can change here: Autocratico is built for Italian paperwork, euro amounts, the `Europe/Rome` time zone and an Italian/English interface. This page lists every place that assumes it, so a fork can move to another country (official sites, tax forms, ID formats), add a language, or switch currency.

Plenty works anywhere already: deadlines, cases, the inbox, the agent, recurrence, privacy mode. What follows is everything that does not.

## Recommended order

1. **Time zone**: a setting, not code (below).
2. **Agent framing**: prompts, allowed official sites, `AGENTS.md`. The agent then researches and files the new country's rules correctly.
3. **Currency**: formatting, redaction, the prompts' "euro".
4. **Areas and onboarding fields**: your country's categories and IDs.
5. **A new language**, if you need one. It is the largest step.
6. **Catalog**: the researched rules in `data/catalog/` belong to each install, so the agent rebuilds them for the new country.

Run the checks after each step.

## Time zone

- The server reads `TZ_DEADLINES`, default `Europe/Rome` (`apps/server/src/config.ts`, `loadConfig`).
- The fallback default in `today()` (`packages/core/src/dates.ts`) and in the `Finance` constructor (`apps/server/src/finance.ts`) only applies when a caller passes no time zone.
- `scripts/store.py` `today()` (used by `upcoming.py`) and `scripts/when.py` read `TZ_DEADLINES` too, with the same default. In Docker, `deploy/compose.yml` sets `TZ` and `TZ_DEADLINES` from the single `TZ` variable, and the Dockerfile takes `--build-arg TZ=…`.

## Public holidays

- **`packages/core/src/holidays.ts`**: `holidays()` lists Italy's national holidays (Easter Monday included) and `shiftDate()` applies the Italian rules behind a deadline's `shift`: `workday` moves it off Saturdays, Sundays and holidays, `tax` also moves payments due 1–20 August to the 20th. Replace the list with your country's, and drop `tax` or change its rule.
- **`scripts/store.py`**: `holidays()` and `shift_date()` mirror them; the parity test checks both agree.
- **`AGENTS.md`**: the rule on recurring dates names the two values.

## Italy-only jobs

- **`energy`** (`scripts/offers.py`) reads the Italian regulator's open data of electricity and gas offers. Elsewhere, delete it from `JOB_NAMES` and `SCHEDULES` in `apps/server/src/jobs.ts` (and its labels), or write the same thing over your country's price comparison data.
- **`taxreturn`** prepares the Italian 730 / Redditi PF: rewrite `TAXRETURN_INSTRUCTIONS` for your return, its season in `SCHEDULES` and the case slug in `#taxreturn`.

## Agent framing

- **`apps/server/src/claude.ts`**:
  - `DOMAINS`: the only sites the chat agent may fetch (Italian public bodies plus `europa.eu`). Replace them with your country's official domains. `*.domain` is allowed automatically.
  - `CHAT_INSTRUCTIONS`: "the user's personal register of Italian bureaucracy".
- **`apps/server/src/jobs.ts`, `TRIAGE_INSTRUCTIONS`**:
  - The phishing hint names F24 (the Italian tax payment form), fines and refunds.
  - The amounts rule mentions "an F24" and `= euro`.
  - The brokers line names Trade Republic and Degiro, and says "market value in euro".
- **`apps/server/src/chat-actions.ts`, `ACTION_INSTRUCTIONS`**: the field list says `amount (euro …)` and `amounts … {"YYYY-MM-DD": euro}`.
- **`AGENTS.md`** (read by every agent, including the server's):
  - The first line says "Personal register for Italian bureaucracy".
  - The "When a document arrives" rule names brokers.
  - The phishing rule mentions F24.
- **Per-install preferences** go in `data/notes/INSTRUCTIONS.md`, not in code: country, language and mailboxes. See [agent.md](agent.md).

## Currency

- **`apps/web/src/i18n/index.tsx`, `formats()`**: `euro` and `euroShort` hard-code `currency: "EUR"`. Change the code there. Renaming the keys is optional; they are used throughout the views as `fmt.euro`.
- **`packages/core/src/redact.ts`, `PATTERNS`**: amounts are masked only when written with `€`, `EUR` or `euro`. Add your currency's symbol and code, or amounts reach Telegram and ntfy in clear.
- **`apps/server/src/finance.ts`, `summary()`**: writes `||€ …||`.
- **Comments and error texts that say "euro"**:
  - `scripts/store.py` (`amounts` validation)
  - `template/deadlines.toml` and `example/deadlines.toml` headers
  - `template/investments.toml`
  - The amount fields in `packages/core/src/schema.ts` (comments only)

## Personal IDs and redaction

- `packages/core/src/redact.ts` masks the Italian tax code (codice fiscale) by pattern. Add your national ID formats; IBAN, card numbers and emails are already covered.
- Onboarding asks for a tax code (`apps/web/src/views/onboarding.tsx`, the `taxCode` field, saved as `person.tax_code`) and a number plate. Rename the labels in `apps/web/src/i18n/*.ts` (`onboarding.taxCode`), or drop the field.

## Areas

Deadline areas (`tax | home | vehicles | documents | health | social-security | bank | family | business`) are listed in:

- `apps/web/src/lib/api.ts` (the `Area` type)
- `apps/web/src/lib/format.ts` (icons)
- `apps/web/src/i18n/en.ts` and `it.ts` (`areas`; Italian shows `social-security` as "INPS")
- the header of `template/deadlines.toml` and `example/deadlines.toml`

Keep the ids, or rename them in every one of those places together with existing data.

## Telegram

- The bot commands are Italian words (`/oggi`, `/scadenze`, `/casi`, `/fatto`, `/salva`, `/promemoria`, `/nuova`, `/stato`), registered with `bot.command(...)` in `apps/server/src/telegram.ts`. Only `/help` has an English alias (`/aiuto`).
- `bot.command` accepts an array, so add aliases like `["oggi", "today"]`.
- Update the `/help` text in `TEXT` and the BotFather list in `docs/telegram.md`.

## Adding a language

The interface ships `it` and `en`. A third one touches:

- **Web strings**:
  - `apps/web/src/i18n/en.ts` defines the shape (`Messages`).
  - Copy it to `<lang>.ts`, translate, and register it in `apps/web/src/i18n/index.tsx`: `Locale`, `LOCALES`, `MESSAGES`, `TAGS` (the BCP 47 tag for dates and numbers) and `initialLocale()`.
- **Demo strings**: `apps/web/src/i18n/demo.ts` (`DEMO_MESSAGES`), only if you keep the demo.
- **Server locale** is a two-value union in several places:
  - `apps/server/src/config.ts`: `Config.locale` and the `AUTOCRATICO_LOCALE` parsing.
  - `apps/server/src/claude.ts`: `LANGUAGES` and `friendlyError`.
  - `apps/server/src/reminders.ts`: `format()` takes the locale type and picks the date tag.
  - `apps/server/src/chat-actions.ts`: the locale type and `TEXT`.
  - Also the `TEXT` objects in `apps/server/src/telegram.ts` and `apps/server/src/jobs.ts`.
- **Triage**: `triagePrompt()` in `apps/server/src/jobs.ts` picks English or Italian from the locale. Extend it.
- **PWA manifest**: `apps/web/vite.config.ts` (`manifest`) has `lang: "it"`, the description "Personal register for Italian bureaucracy" and an Italian shortcut name ("Scadenze").

## Catalog

`data/catalog/*.md` holds researched rules with sources and the date they were verified. They belong to each install. `example/catalog/documents.md` describes Italian documents; replace it with a made-up example for your country.

## Check

```bash
pnpm lint && pnpm typecheck && pnpm test
python3 scripts/upcoming.py 30 && python3 scripts/ics.py
pnpm --filter @autocratico/web build:demo   # if you kept the demo: its texts and seed still build
```

`packages/core/test/parity.test.ts` must stay green after any change to `store.py`. Grep for leftovers: `grep -rn "Italian\|euro\|€\|Europe/Rome\|F24" apps packages scripts template example AGENTS.md`.
