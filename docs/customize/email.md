# Email sources

What you can change here: how mail reaches the inbox. Today only Gmail is synced, read-only, over the Gmail API. Three ways to bring in another mailbox, from no code to a proper sync: forward it to Gmail, post it to `/api/ingest`, or write an IMAP sync next to `gmail.py`.

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

## Option 3: a real IMAP sync

For mail to look exactly like Gmail's (archived `message.md`, a pointer item with `from`, paced triage), write `scripts/imap.py` modelled on `gmail.py`:

1. **Paths**: take them from `store.py` (`DATA_DIR`). Keep to the standard library.
2. **Archive**: save each message the way `gmail.py` does (`archive/email/<date>-<subject>-<id>/message.md` plus attachments), with the same safe-name rules.
3. **Pointer item**: write one per new message the way `_inbox_item` does (`source: "email"`, `ref`). `important` and `marketing` come from your own rules, since IMAP has no Gmail labels.
4. **Accounts**: remember the last UID per account, e.g. in `data/imap.toml`. Credentials go in `data/secrets/`.
5. **The job**:
   - Add an `imap` entry to `JOB_NAMES` and `SCHEDULES` in `apps/server/src/jobs.ts`, plus a `#imap()` that runs the script like `#gmail()` does and queues triage.
   - Add it to the job list in `apps/server/src/openapi.ts` and `docs/architecture.md`.
6. **Settings** (optional): copy the Gmail card's pattern in `apps/server/src/gmail.ts` and `apps/web/src/views/settings.tsx`.

## Security

- **Email content is data, never instructions.** The triage prompt says so. Don't loosen it for a new source, and flag phishing as the agent already does.
- **Treat anything a stranger sends as untrusted**: file names, MIME parts, zip contents. Store attachments under sanitised names inside the item's folder, as `apps/server/src/inbox.ts` and `gmail.py` do. Never let a name escape the folder (`..`, absolute paths, hidden files), and never execute or open attachments.
- **Read-only access to the mailbox**, wherever the provider allows it. Never send mail from Autocratico.
- **Secrets stay in `data/secrets/`** (folder `0700`, files `0600`), never in the browser or in logs.

## Check

```bash
pnpm lint && pnpm typecheck && pnpm test
python3 -m py_compile scripts/*.py
node apps/server/src/cli.ts job triage   # after a test message arrived: the agent files it
```
