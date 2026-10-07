# ntfy: push notifications

[ntfy](https://ntfy.sh) delivers the same notifications as the Telegram bot (reminders, what the agent filed, digests, failures) as push notifications on your phone. It works on its own or alongside Telegram: when both are set up, every notification goes to both. It only sends: there is no chat and there are no buttons to press.

## Privacy

On a public server the topic name works like a password: anyone who knows the topic URL can subscribe and read along. Pick a long random topic, or run your own ntfy server with access control and a token.

Every outgoing text goes through `redact()` (`packages/core/src/redact.ts`), as for Telegram: anything the agent marks as `||personal||` and recognisable amounts, IBANs, tax codes, card numbers and email addresses become `•••`. The topic URL and the token stay on the server. Settings shows only the ntfy server's host.

## Setup

1. Choose a server:
   - **ntfy.sh** (public, free): any topic works, e.g. `https://ntfy.sh/autocratico-` followed by 20 or more random characters (`openssl rand -hex 12`).
   - **Self-hosted** ([docs](https://docs.ntfy.sh/install/)): create a user and a topic that only that user can read and write, then an access token (`ntfy token add <user>`).
2. Set the variables on the server and restart:
   ```bash
   NTFY_URL=https://ntfy.sh/autocratico-3f9c1e…   # the full topic URL
   NTFY_TOKEN=tk_…                               # only for a protected server
   ```
   In Docker, put them in `deploy/.env` (see `deploy/.env.example`). The server refuses to start if `NTFY_URL` is not a topic URL (`https://host/topic`).
3. On the phone, install the ntfy app, add the server if it is not ntfy.sh, and subscribe to the same topic.
4. In the web app, **Settings → Push notifications (ntfy)** shows "Sending to <host>". This card is read-only: change the settings in the environment.

## Use

- Notifications arrive titled **Autocratico**. Messages longer than about 4 KB are cut.
- Telegram's buttons (✓ Done, +1 h, Tomorrow 9:00) can't come back through ntfy. When `PUBLIC_ORIGIN` is set, those messages get a single **Open** action that opens the web app instead.
- Reminders asked in the chat ("remind me tomorrow at 9…") work as long as at least one channel is set up, Telegram or ntfy.
- To test, run a job by hand on the server: `node apps/server/src/cli.ts job digest` (needs Claude Code). `job reminders` sends something only when a deadline is due or overdue.
- To turn it off, unset `NTFY_URL` and restart.
