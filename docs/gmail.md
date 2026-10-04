# Connect Gmail (read-only)

Autocratico can sync several Gmail accounts. The OAuth client is created once; each account then signs in with it.

## From the web app (recommended)

**Settings → Gmail accounts → Add account** opens a step-by-step setup:

1. **Google Cloud** (once, about 5 minutes, from any Google account): links to create a project,
   enable the Gmail API, configure the consent screen (type **External**) and publish the app
   (audience **In production**, see below).
2. **OAuth client**: create a client of type **Web application** and add the redirect URI the
   wizard shows (`<your app address>/oauth/gmail`, e.g. `https://autocratico.example.com/oauth/gmail`)
   under "Authorized redirect URIs". Download its JSON and upload or paste it.
   A **Desktop app** client works too: after signing in, the browser fails to load a
   `http://127.0.0.1:…` page and you paste that address into the wizard.
3. **Account**: a short name (`personal`, `paperwork`…) and the Gmail search for the emails to
   download (default: `-in:spam -in:trash -category:promotions newer_than:1y`).
4. **Sign in** with Google, pick the mailbox and allow read-only access to Gmail.
5. **Done**: run the first sync now, or add another account (steps 3–5 only).

Each account row can sign in again, change its query or be removed (the token is revoked at
Google; emails already downloaded stay in the Archive). Sign in from the browser rather than the
installed PWA, so Google can send you back to the app.

Everything stays in the data folder on the server: the client in `secrets/credentials.json`,
tokens in `secrets/gmail/<name>.json` (folder 0700, files 0600, never sent to the browser),
the accounts in `gmail.toml` (versioned with the register, no secrets in it).

## From the command line

1. Steps 1–2 above with a **Desktop app** client; save its JSON as `data/secrets/credentials.json`.
2. List the accounts in `data/gmail.toml`:
   ```toml
   [[account]]
   name = "personal"
   query = "-in:spam -in:trash -category:promotions newer_than:1y"

   [[account]]
   name = "paperwork"
   query = "-in:spam -in:trash newer_than:1y"
   ```
   (A top-level `query` is the account `default`, as in the single-account layout.)
3. Sign in each one: `python3 scripts/gmail.py login --account personal` and pick that account.
   On the headless server add `--manual`: open the printed address on any computer, allow access,
   then copy the address of the error page you land on (it starts with `http://127.0.0.1:`) and paste it.

## Sync

The server runs `gmail.py sync --all` every 10 minutes. New messages from the last 14 days also
become inbox items that the agent files.

In "testing" mode Google expires refresh tokens after 7 days, which breaks unattended sync
every week (the server tells you on Telegram when a sync fails). For the always-on server,
set the audience to **In production** (https://console.cloud.google.com/auth/audience →
Publish app): for personal use with fewer than 100 users the app stays unverified, you
click through the "unverified app" warning once per account, and tokens stop expiring.
(In testing mode, every address must also be listed under **Test users**.)

Tokens give **read-only** access to the whole mailbox: never share them. An old
`data/secrets/token.json` becomes `gmail/default.json` on first use. Replacing the OAuth client
asks each account to sign in again. To revoke one: remove it in Settings,
`python3 scripts/gmail.py logout --account NAME` or https://myaccount.google.com/permissions.
