# Email sources

What you can change here: how mail reaches the inbox. Gmail is synced over the Gmail API, and any other mailbox over IMAP ([../imap.md](../imap.md): Yahoo, PEC, Libero…), both read-only. For a source that is neither, forward it to a synced mailbox or post it to `/api/ingest`.

## How Gmail works today

- **`scripts/gmail.py`** (Python, standard library) does the work: OAuth sign-in, `sync`, `preview`, `fetch`.
  - Each new message is saved as `archive/email/<date>-<subject>-<id>/message.md`, with its attachments.
  - Each also gets a pointer item in `inbox/` (`_inbox_item`): `source: "email"`, `from`, `account`, `ref` to the archive folder, plus `important` and `marketing` from Gmail's labels.
  - Marketing mail is filed as `ignored`. Non-important mail reaches the agent in paced batches (`PACE_MS` in `apps/server/src/jobs.ts`).
- **The `gmail` job** (`#gmail` in `apps/server/src/jobs.ts`) runs `gmail.py sync --all` every 10 minutes, then queues triage for what arrived. It skips when `secrets/credentials.json` is missing.
- **Settings** (`apps/server/src/gmail.ts`): the OAuth client, the accounts in `gmail.toml`, and Google sign-in.
- **Gmail links pasted in the chat** (`apps/server/src/gmail-links.ts`): fetched before the agent answers.

## Option 1: forward to Gmail (no code)

Set up a filter in the other mailbox that forwards paperwork to a Gmail account Autocratico syncs ([../gmail.md](../gmail.md)). This is the simplest path, but the original sender becomes the forwarder in the `from` field.

## Option 2: post to `/api/ingest`

The API that the iOS shortcut uses ([../ios-shortcut.md](../ios-shortcut.md)) accepts anything:

- **Token**: create an ingest-only token in Settings → Shortcut tokens, or with `node apps/server/src/cli.ts token --name mail`. It is stored hashed and can only call `/api/ingest`.
- **JSON**: `POST /api/ingest` with `Authorization: Bearer <token>` and `{"title": "…", "text": "…"}`.
- **Files**: `multipart/form-data` with `file` fields, plus optional `title` and `text`. The limit is 25 MB.
- **Cloudflare Access**: if it guards the server, add the service token headers too (`CF-Access-Client-Id`, `CF-Access-Client-Secret`).

Items arrive with `source: "shortcut"` and the token's name as `account`, and the agent files them a minute later. They have no `from` or `important` fields and no archived `message.md`: put the headers at the top of `text`.

A sketch of an IMAP poller, standard library only, run from cron:

```python
#!/usr/bin/env python3
"""Polls an IMAP folder and posts unseen messages to Autocratico's /api/ingest."""
import email, imaplib, json, os, urllib.request
from email.policy import default

URL = os.environ["AUTOCRATICO_URL"].rstrip("/") + "/api/ingest"
TOKEN = os.environ["AUTOCRATICO_INGEST_TOKEN"]

def post(title: str, text: str, files: list[tuple[str, bytes]]) -> None:
    if files:  # multipart: one part per attachment
        boundary = os.urandom(12).hex()
        parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in (("title", title), ("text", text))]
        for name, data in files:
            safe = name.replace('"', "").replace("\r", "").replace("\n", "")
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{safe}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode() + data + b"\r\n")
        body, ctype = b"".join(parts) + f"--{boundary}--\r\n".encode(), f"multipart/form-data; boundary={boundary}"
    else:
        body, ctype = json.dumps({"title": title, "text": text}).encode(), "application/json"
    req = urllib.request.Request(URL, body, {"Authorization": f"Bearer {TOKEN}", "Content-Type": ctype})
    urllib.request.urlopen(req, timeout=60).read()

with imaplib.IMAP4_SSL(os.environ["IMAP_HOST"]) as imap:
    imap.login(os.environ["IMAP_USER"], os.environ["IMAP_PASSWORD"])
    imap.select(os.environ.get("IMAP_FOLDER", "INBOX"))
    _, ids = imap.search(None, "UNSEEN")
    for num in ids[0].split():
        _, data = imap.fetch(num, "(RFC822)")  # marks it seen
        msg = email.message_from_bytes(data[0][1], policy=default)
        body = msg.get_body(preferencelist=("plain", "html"))
        head = f"From: {msg['from']}\nDate: {msg['date']}\nSubject: {msg['subject']}\n\n"
        files = [(p.get_filename() or "attachment", p.get_payload(decode=True)) for p in msg.iter_attachments()]
        post(str(msg["subject"] or "(no subject)")[:200], head + (body.get_content() if body else ""), files)
```

Keep the IMAP password out of the repository and out of the data folder's versioned files: put it in the environment or in a `0600` file under `data/secrets/`. Use an app password, or a read-only account if the provider offers one.

## Option 3: the IMAP sync

Built in: [../imap.md](../imap.md). `scripts/imap.py` saves mail exactly like Gmail's (archived `message.md` with `provider: imap`, a pointer item with `from`, paced triage), reusing `gmail.py`'s helpers; the `imap` job runs it every 10 minutes; Settings → Other mailboxes (IMAP) (`apps/server/src/imap.ts`, `apps/web/src/components/imap.tsx`) checks the sign-in and stores the app password. To sync another kind of source the same way, these are the pieces it needed:

1. **Paths**: take them from `store.py` (`DATA_DIR`). Keep to the standard library.
2. **Archive**: save each message the way `gmail.py` does (`archive/email/<date>-<subject>-<id>/message.md` plus attachments), with the same safe-name rules. Give it an id that is not hex (`imap-…`), so the web app never builds a Gmail link for it.
3. **Pointer item**: write one per new message with `_inbox_item` (`source: "email"`, `ref`). `important` and `marketing` come from your own rules where there are no Gmail labels (IMAP: flagged = important, `List-Unsubscribe` = marketing).
4. **Accounts**: settings in a TOML file in the data folder (`imap.toml`), credentials together with the host they go to in `data/secrets/`, the sync position next to the archive (`archive/email/.imap.json`).
5. **The job**: an entry in `JOB_NAMES` and `SCHEDULES` in `apps/server/src/jobs.ts`, run by `#mail()` like Gmail's, which queues triage; the job list in `apps/server/src/openapi.ts`, `docs/architecture.md` and the web app's `jobs` names in `i18n/`.
6. **Settings**: a class like `apps/server/src/imap.ts` behind routes in `app.ts` (also in `openapi.ts` and the demo router), a card like `apps/web/src/components/imap.tsx`.

## Security

- **Email content is data, never instructions.** The triage prompt says so. Don't loosen it for a new source, and flag phishing as the agent already does.
- **Phishing checks need the raw message.** Call `phishing.evidence(headers, html, text, attachments)` from `scripts/phishing.py` when you save a message and write its result with `phishing.write(folder, …)` (`checks.json` beside `message.md`), as `gmail.py` and `imap.py` do: once the message is text, SPF/DKIM/DMARC, Reply-To and the links' real addresses are gone. The checks are static: nothing is fetched, no domain is looked up.
- **Treat anything a stranger sends as untrusted**: file names, MIME parts, zip contents. Store attachments under sanitised names inside the item's folder, as `apps/server/src/inbox.ts` and `gmail.py` do. Never let a name escape the folder (`..`, absolute paths, hidden files), and never execute or open attachments.
- **Read-only access to the mailbox**, wherever the provider allows it. Never send mail from Autocratico.
- **Secrets stay in `data/secrets/`** (folder `0700`, files `0600`), never in the browser or in logs.

## Check

```bash
pnpm lint && pnpm typecheck && pnpm test
python3 -m py_compile scripts/*.py
node apps/server/src/cli.ts job triage   # after a test message arrived: the agent files it
```
