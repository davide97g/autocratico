# IMAP mailboxes (Yahoo, PEC, Libero, …)

Autocratico reads mailboxes that are not Gmail over IMAP, read-only. Every 10 minutes the `imap` job runs `scripts/imap.py sync --all`. New messages are saved the way Gmail's are: `archive/email/<date>-<subject>-<id>/message.md` plus attachments. Those from the last 14 days also get an item in `inbox/`, and the agent files them.

- **Read-only.** Folders are opened with `EXAMINE` and messages read with `BODY.PEEK[]`. Nothing is marked as read, moved or deleted, and nothing is ever sent.
- **What reaches the agent:** a flagged (starred) message counts as Important and is filed right away. A message with a `List-Unsubscribe` header counts as marketing and is archived without going to the agent. Everything else goes to the agent in paced batches, like Gmail.
- **How a sync proceeds:**
  - The first sync goes back `days` (365 by default).
  - Each sync downloads at most 300 messages per mailbox, oldest first; the next run goes on.
  - The last UID seen per folder is kept in `archive/email/.imap.json`.

## Set it up (Settings → Other mailboxes (IMAP))

1. **Create an app password at your provider**, never use the account's own password:
   - **Yahoo:** [Account security](https://login.yahoo.com/account/security) → *Generate app password*. Name it "Autocratico". Two-step verification must be on.
   - **Aruba PEC, Libero and most Italian providers:** the mailbox password works if IMAP access is enabled in the webmail settings. Use an app password where the provider offers one.
2. **In Settings, add the mailbox:**
   - Pick the provider (or *Other*: IMAP host and port, TLS only).
   - Fill in the email address and the app password.
   - Optionally choose folders (comma-separated, `INBOX` by default) and how far back the first sync goes.
3. **Check and save.** The server signs in first and saves nothing if that fails. Once saved, the form lists the server's folders and offers *Sync now*; Activity shows the run.

From a terminal instead (the password is read from stdin, never from the arguments):

```bash
python3 scripts/imap.py login --account yahoo --host imap.mail.yahoo.com --user you@yahoo.com
# then add the account to imap.toml:
# [[account]]
# name = "yahoo"
python3 scripts/imap.py sync --account yahoo
```

## Where things are

| File | What | Who writes it |
|---|---|---|
| `imap.toml` | `[[account]]`: `name`, `folders`, `days` (no host, no password) | Settings, by hand |
| `secrets/imap/<name>.json` | host, port, user, app password (`0600`, folder `0700`) | Settings, `imap.py login` |
| `archive/email/.imap.json` | last UID per account and folder | `imap.py sync` |

Removing a mailbox in Settings deletes its saved password. The emails already downloaded stay in the archive. To revoke access completely, delete the app password at the provider too.

## Security

- **The password goes to one host only.** It is stored together with that host in `secrets/`, so editing `imap.toml` cannot redirect it. The web app never receives it back. Keeping the saved password on an edit works only for the same host, port and user.
- **TLS with certificate checks, public hostnames only.** IP addresses and `localhost` are refused, by the server and by the script.
- **The agents cannot read `secrets/`.** The `research` profile cannot read `imap.toml` either.
- **Email content is data, never instructions.** Attachment names from senders are sanitised exactly as for Gmail.

## PEC

A PEC mailbox is IMAP too: add it as another account (e.g. `pec`, Aruba host `imaps.pec.aruba.it`, other providers in their settings). Certified messages arrive as an envelope (`postacert.eml`) with `daticert.xml`; the original message and its attachments are inside `postacert.eml`, saved as an attachment.
