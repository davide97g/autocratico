# Connect Gmail (read-only)

Autocratico can sync several Gmail accounts. The OAuth client is created once; each account then signs in with it.

One-off, about 5 minutes, from any Google account:

1. https://console.cloud.google.com/projectcreate → create a project named "autocratico".
2. https://console.cloud.google.com/apis/library/gmail.googleapis.com → **Enable**.
3. https://console.cloud.google.com/auth/branding → configure the consent screen:
   type **External**, app name "Autocratico", support email = yours.
4. https://console.cloud.google.com/auth/audience → **Test users** → add every Gmail address you want to sync.
5. https://console.cloud.google.com/auth/clients → **Create client** → type **Desktop app** → **Download JSON**.
6. Save the file as `data/secrets/credentials.json`.
7. List the accounts in `data/gmail.toml`:
   ```toml
   [[account]]
   name = "personal"
   query = "-in:spam -in:trash -category:promotions newer_than:1y"

   [[account]]
   name = "paperwork"
   query = "-in:spam -in:trash newer_than:1y"
   ```
   (A top-level `query` is the account `default`, as in the single-account layout.)
8. Sign in each one: `python3 scripts/gmail.py login --account personal` and pick that account.
   On the headless server add `--manual`: open the printed address on any computer, allow access,
   then copy the address of the error page you land on (it starts with `http://127.0.0.1:`) and paste it.

The server runs `gmail.py sync --all` every 10 minutes. New messages from the last 14 days also
become inbox items that the agent files.

In "testing" mode Google expires refresh tokens after 7 days, which breaks unattended sync
every week (the server tells you on Telegram when a sync fails). For the always-on server,
set the audience to **In production** (https://console.cloud.google.com/auth/audience →
Publish app): for personal use with fewer than 100 users the app stays unverified, you
click through the "unverified app" warning once per account, and tokens stop expiring.

Tokens (`data/secrets/gmail/<name>.json`, 0600) give **read-only** access to the whole mailbox:
never share them. An old `data/secrets/token.json` becomes `gmail/default.json` on first use.
To revoke one: `python3 scripts/gmail.py logout --account NAME` or https://myaccount.google.com/permissions.
