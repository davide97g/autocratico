# Notification channels

What you can change here: where reminders, triage summaries, digests and failure alerts go. Telegram and ntfy ship, and every notification goes to all channels that are set up. Adding another channel (email, web push, Matrix, Signal, a webhook) is one small class.

## How it fits together

- **`Notifier`** (`apps/server/src/jobs.ts`) is the whole interface:
  ```ts
  export type Notifier = { notify(text: string, buttons?: Button[][]): Promise<void> }
  export type Button = { text: string; data: string }   // Telegram callback data, e.g. "done:<key>"
  ```
- **The jobs call it**:
  - `#reminders`: the 08:30 deadlines, with ✓ Done buttons.
  - The 30-second loop that delivers chat reminders, with Done, +1 h and Tomorrow 9:00 buttons.
  - `#triage`: what the agent filed.
  - `#digest`: Monday morning.
  - `#energy`: an offer that beats the current electricity or gas contract, once per offer. `#rules`: catalog entries updated, deadlines that moved. `#taxreturn`: the case is ready.
  - Payments found in the finance source (`apps/server/src/matches.ts`), with Mark paid / Not this one buttons (`pay:<id>`, `nopay:<id>`).
  - Failures of the `gmail`, `finance` and `triage` jobs, once per failure streak.
- **`fanOut()`** (`apps/server/src/ntfy.ts`) turns the configured channels into one notifier. `services.ts` wires it: `notifier: () => fanOut([s.telegram, s.ntfy])`. With no channel it returns `null` and the jobs skip notifying.
- **Chat reminders** ("remind me tomorrow at 9") are accepted only when a channel exists. `applyActions` in `apps/server/src/chat-actions.ts` checks `notify`. `app.ts` sets it from `s.telegram !== null || s.ntfy !== null`, and `telegram.ts` always passes `true`.
- **Status and Settings**:
  - `Status` in `packages/core/src/schema.ts` has a `telegram` and an `ntfy` block (`/api/status` in `app.ts`).
  - Settings shows a card for each (`TelegramCard`, `NtfyCard` in `apps/web/src/views/settings.tsx`).
  - The demo answers `/api/status` in `apps/web/src/demo/backend/router.ts`.

## The rule: redact before it leaves

Every text that leaves the machine goes through `redact()` (`packages/core/src/redact.ts`):
- `||marked||` personal data becomes `•••`.
- So do recognisable amounts, IBANs, tax codes, card numbers and emails.

A new channel must call it on every text it sends, button labels included, exactly as `Telegram.notify` (`outgoing()`) and `Ntfy.notify` do. `AGENTS.md` lists both as security-sensitive spots; add yours there.

## Adding a channel

1. **Write the class.** Create `apps/server/src/<channel>.ts` with a class implementing `Notifier`.
   - Take an injectable `fetch` for tests, as `Ntfy` does.
   - Log failures and never throw: a dead channel must not break the job.
   - Respect the channel's size limit.
   - `buttons` are Telegram callbacks that most channels can't send back. Drop them, or turn them into a link to `PUBLIC_ORIGIN`, as ntfy does with its "Open" action.
2. **Add the settings** to `Config` (`apps/server/src/config.ts`) from environment variables. Validate them in `loadConfig` and fail closed on a malformed value.
3. **Wire it up.**
   - In `apps/server/src/services.ts`, add it to `Services` (type in `app.ts`) and to the `fanOut([...])` list.
   - In `app.ts`, extend the `notify:` check for chat reminders.
4. **Show it**:
   - a `Status` field in the core schema and in `/api/status`
   - a read-only card in Settings, with strings in `en.ts`/`it.ts`
   - the demo router's status
5. **Document it**: a doc like [../ntfy.md](../ntfy.md), and the variables in `docs/configuration.md` and `deploy/.env.example`, plus a pass-through in `deploy/compose.yml`.
6. **Test it**: copy `apps/server/test/ntfy.test.ts`. Check that the text is redacted, auth is sent, and nothing is sent when the channel isn't configured.

Some sketches:
- **Email**: SMTP through `node:net`/`node:tls`, or a library in `apps/server`. Watch out: mail goes through your provider.
- **Web push**: needs VAPID keys, a service-worker push handler in the PWA, and subscriptions stored server-side. It is the most work, but needs no third party beyond the browser vendor's push service.
- **Matrix**: one `PUT /_matrix/client/v3/rooms/{room}/send/m.room.message/{txn}` with an access token.

## What only Telegram does

Telegram is also an input channel, which `Notifier` doesn't cover:
- chatting with the agent
- voice messages transcribed on the server
- files and forwards that go to the inbox
- buttons whose callbacks mark occurrences done or snooze reminders
- `/start` pairing, so only paired chats get anything

A two-way channel needs its own pairing, an allowlist of who may talk to it, and the same read-only chat profile (see `telegram.ts`, and [agent.md](agent.md)).

## Check

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @autocratico/server exec vitest run test/ntfy.test.ts
node apps/server/src/cli.ts job digest   # with the channel configured: one real message
```
