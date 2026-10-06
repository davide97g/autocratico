"""Download emails about your paperwork from one or more Gmail accounts into the data folder (read-only).

Usage:
  python3 scripts/gmail.py accounts                          list accounts and whether they are connected
  python3 scripts/gmail.py login [--account NAME] [--manual] authorize access (--manual: no local browser)
  python3 scripts/gmail.py search [--account NAME] "QUERY"   list matching messages without downloading them
  python3 scripts/gmail.py sync [--account NAME | --all] [QUERY]
                                                             download messages and attachments into data/archive/email/
  python3 scripts/gmail.py preview [--account NAME] [--json] LINK
                                                             what a Gmail link points to, without downloading it
  python3 scripts/gmail.py fetch [--account NAME] [--json] LINK
                                                             download the conversation a Gmail link points to
  python3 scripts/gmail.py logout [--account NAME]           revoke the token and delete it

Accounts are listed in gmail.toml as [[account]] tables (name, query); a top-level `query`
is the account "default". QUERY uses Gmail search syntax (e.g. 'label:paperwork newer_than:1y');
without it, sync uses the account's query.

LINK is the address of a conversation in Gmail's web app (https://mail.google.com/mail/u/0/#inbox/FMfcg…)
or its API id; without --account, every connected account is tried. preview reads the archive when
the conversation is there; fetch saves the messages not saved yet, without an inbox item (the chat
that asked for it decides). --json prints one JSON object, with "error" and "code" on failure.

New messages from the last INBOX_DAYS days also get an item in data/inbox/, so that the
autocratico server's agent files them (deadlines, cases). Gmail's own markers sort them: Important
ones first (the agent reads them right away), promotions, social, forums and bulk mail (a
List-Unsubscribe header, not marked Important) are archived without going to the agent. A sync
downloads at most PER_RUN messages per account, Important first; the next run goes on.

Requires data/secrets/credentials.json: an OAuth client created on Google Cloud with the Gmail
API enabled ("Web application" from Settings in the web app, or "Desktop app" for `login` here).
Tokens are saved in data/secrets/gmail/<name>.json (0600). Setup: docs/gmail.md.
"""

from __future__ import annotations

import base64
import fcntl
import hashlib
import html
import html.parser
import json
import os
import re
import secrets
import sys
import time
import tomllib
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime
from email.utils import parsedate_to_datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from store import DATA_DIR

SECRETS = DATA_DIR / "secrets"
CREDENTIALS = SECRETS / "credentials.json"
TOKENS = SECRETS / "gmail"
LEGACY_TOKEN = SECRETS / "token.json"  # single-account layout, moved to gmail/default.json on first use
CONFIG = DATA_DIR / "gmail.toml"
DESTINATION = DATA_DIR / "archive" / "email"
INDEX = DESTINATION / "index.json"
INBOX = DATA_DIR / "inbox"
INBOX_DAYS = 14
PER_RUN = 300  # messages per account per sync: a first sync of a busy mailbox spreads over several runs
MARKETING_LABELS = {"CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_FORUMS"}

SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
API = "https://gmail.googleapis.com/gmail/v1/users/me"


class GmailError(Exception):
    """`code`, for --json: not-a-link, unsupported, no-account, not-found, failed."""

    def __init__(self, message: str, code: str = "failed"):
        super().__init__(message)
        self.code = code


# ---------- accounts ----------

_NAME = re.compile(r"^[a-z0-9][a-z0-9_-]{0,31}$")
TOKEN = TOKENS / "default.json"  # the account in use, set by _use()


def accounts() -> dict[str, str]:
    """Account name -> default query, from gmail.toml."""
    found: dict[str, str] = {}
    if CONFIG.exists():
        with CONFIG.open("rb") as f:
            config = tomllib.load(f)
        if str(config.get("query", "")).strip():
            found["default"] = config["query"].strip()
        for a in config.get("account", []):
            name = str(a.get("name", "")).strip()
            if not _NAME.match(name):
                raise GmailError(f"gmail.toml: invalid account name {name!r} (lowercase letters, digits, - and _)")
            found[name] = str(a.get("query", "")).strip()
    if LEGACY_TOKEN.exists():
        found.setdefault("default", "")
    return found


def _use(name: str) -> None:
    global TOKEN
    if not _NAME.match(name):
        raise GmailError(f"invalid account name {name!r} (lowercase letters, digits, - and _)")
    TOKEN = TOKENS / f"{name}.json"
    if name == "default" and LEGACY_TOKEN.exists() and not TOKEN.exists():
        TOKENS.mkdir(mode=0o700, parents=True, exist_ok=True)
        LEGACY_TOKEN.replace(TOKEN)


# ---------- OAuth (desktop app, loopback + PKCE) ----------


def _client() -> dict:
    if not CREDENTIALS.exists():
        raise GmailError(f"{CREDENTIALS} is missing: download it from Google Cloud (see docs/gmail.md)", "no-account")
    data = json.loads(CREDENTIALS.read_text())
    # "Web application" clients (set up from the web app) refresh tokens the same way; `login`
    # here needs a "Desktop app" client, since it listens on 127.0.0.1.
    client = data.get("installed") or data.get("web")
    if not client:
        raise GmailError("credentials.json is not an OAuth client ('Desktop app' or 'Web application')")
    return client


def _post(url: str, fields: dict) -> dict:
    body = urllib.parse.urlencode(fields).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=body), timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise GmailError(f"{url}: HTTP {e.code} {e.read().decode(errors='replace')}") from None
    except (urllib.error.URLError, TimeoutError) as e:
        raise GmailError(f"{url}: unreachable: {getattr(e, 'reason', e)}") from None


def _save_token(token: dict) -> None:
    SECRETS.mkdir(mode=0o700, exist_ok=True)
    TOKENS.mkdir(mode=0o700, exist_ok=True)
    fd = os.open(TOKEN, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(token, f, indent=2)


def login(manual: bool = False) -> None:
    client = _client()
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(16)
    received: dict = {}

    class Callback(BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            received.update({k: v[0] for k, v in q.items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"<p>Autocratico: signed in, you can close this tab.</p>")

        def log_message(self, *a):
            pass

    server = HTTPServer(("127.0.0.1", 0), Callback)
    redirect = f"http://127.0.0.1:{server.server_port}"
    url = client["auth_uri"] + "?" + urllib.parse.urlencode(
        {
            "client_id": client["client_id"],
            "redirect_uri": redirect,
            "response_type": "code",
            "scope": SCOPE,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "access_type": "offline",
            "prompt": "consent select_account",
            "state": state,
        }
    )
    print("Open this address and pick the account with your paperwork:\n" + url, flush=True)
    if manual:
        # Headless server: the browser runs elsewhere, so the redirect to 127.0.0.1 fails there.
        # The address it tried to open still carries the code: paste it here.
        server.server_close()
        pasted = input("\nAfter allowing access the browser shows an error page: paste its full address here:\n> ").strip()
        q = urllib.parse.parse_qs(urllib.parse.urlparse(pasted).query)
        received.update({k: v[0] for k, v in q.items()})
        if not received:
            raise GmailError("no code in the pasted address")
    else:
        webbrowser.open(url)
        while "code" not in received and "error" not in received:
            server.handle_request()
        server.server_close()

    if "error" in received:
        raise GmailError(f"access denied: {received['error']}")
    if received.get("state") != state:
        raise GmailError("OAuth state mismatch: login cancelled")

    token = _post(
        client["token_uri"],
        {
            "code": received["code"],
            "client_id": client["client_id"],
            "client_secret": client.get("client_secret", ""),
            "redirect_uri": redirect,
            "grant_type": "authorization_code",
            "code_verifier": verifier,
        },
    )
    token["expires_at"] = time.time() + token.get("expires_in", 3600) - 60
    _save_token(token)
    profile = _get(f"{API}/profile")
    print(f"Connected to {profile['emailAddress']} ({profile['messagesTotal']} messages). Read-only access.")


def _access_token() -> str:
    if not TOKEN.exists():
        raise GmailError(f"{TOKEN.stem}: not connected: run `python3 scripts/gmail.py login --account {TOKEN.stem}` first", "no-account")
    token = json.loads(TOKEN.read_text())
    if time.time() < token.get("expires_at", 0):
        return token["access_token"]
    client = _client()
    fresh = _post(
        client["token_uri"],
        {
            "client_id": client["client_id"],
            "client_secret": client.get("client_secret", ""),
            "refresh_token": token["refresh_token"],
            "grant_type": "refresh_token",
        },
    )
    token.update(fresh)
    token["expires_at"] = time.time() + fresh.get("expires_in", 3600) - 60
    _save_token(token)
    return token["access_token"]


def logout() -> None:
    if TOKEN.exists():
        token = json.loads(TOKEN.read_text())
        try:
            _post("https://oauth2.googleapis.com/revoke", {"token": token.get("refresh_token") or token["access_token"]})
        except GmailError as e:
            print(f"revoke failed ({e}), deleting the token anyway")
        TOKEN.unlink()
    print("Disconnected.")


# ---------- Gmail API ----------


def _get(url: str, params: dict | None = None) -> dict:
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    for attempt in range(7):
        request = urllib.request.Request(url, headers={"Authorization": f"Bearer {_access_token()}"})
        try:
            with urllib.request.urlopen(request, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            quota = e.code == 429 or (e.code == 403 and ("Quota exceeded" in body or "rateLimitExceeded" in body))
            if not quota or attempt == 6:
                # 400 is what an id that was never Gmail's gets ("Invalid id value").
                missing = e.code == 404 or (e.code == 400 and "Invalid id" in body)
                raise GmailError(f"Gmail API HTTP {e.code}: {body[:300]}", "not-found" if missing else "failed") from None
            wait = min(60, 5 * 2**attempt)
            # stderr: stdout is the result, JSON with --json.
            print(f"  Gmail quota reached, waiting {wait}s…", file=sys.stderr, flush=True)
            time.sleep(wait)
        except (urllib.error.URLError, TimeoutError) as e:
            raise GmailError(f"Gmail unreachable: {getattr(e, 'reason', e)}") from None
    raise AssertionError("unreachable")


def _list(query: str, limit: int) -> list[str]:
    ids, page = [], None
    while len(ids) < limit:
        p = {"q": query, "maxResults": min(100, limit - len(ids))}
        if page:
            p["pageToken"] = page
        r = _get(f"{API}/messages", p)
        ids += [m["id"] for m in r.get("messages", [])]
        page = r.get("nextPageToken")
        if not page:
            break
    return ids


def _b64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


class _Text(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._skip += 1
        if tag in ("br", "p", "div", "tr", "li", "h1", "h2", "h3"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self._skip -= 1

    def handle_data(self, data):
        if not self._skip:
            self.parts.append(data)


def _from_html(h: str) -> str:
    p = _Text()
    p.feed(h)
    return re.sub(r"\n\s*\n+", "\n\n", "".join(p.parts)).strip()


def _parts(payload: dict):
    yield payload
    for p in payload.get("parts", []) or []:
        yield from _parts(p)


def _headers(msg: dict) -> dict:
    return {h["name"].lower(): h["value"] for h in msg["payload"].get("headers", [])}


def _date(msg: dict) -> datetime:
    return datetime.fromtimestamp(int(msg["internalDate"]) / 1000)


def _slug(s: str) -> str:
    s = re.sub(r"[^\w\s-]", "", s.lower(), flags=re.U)
    return re.sub(r"[\s_-]+", "-", s).strip("-")[:50] or "no-subject"


def _file_name(name: str, taken: list[str]) -> str:
    """Safe, unique file name for an attachment (the name comes from the sender)."""
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", name).strip().lstrip(".")[:150] or "attachment"
    if name == "message.md" or name in taken:
        stem, dot, ext = name.rpartition(".")
        stem, ext = (stem, f".{ext}") if dot else (name, "")
        n = 2
        while f"{stem}-{n}{ext}" in taken:
            n += 1
        name = f"{stem}-{n}{ext}"
    return name


def search(query: str, limit: int = 50) -> None:
    ids = _list(query, limit)
    if not ids:
        print("No messages.")
        return
    for i in ids:
        m = _get(f"{API}/messages/{i}", {"format": "metadata", "metadataHeaders": ["From", "Subject"]})
        h = _headers(m)
        print(f"{_date(m):%Y-%m-%d}  {i}  {h.get('from', '')[:40]:<40}  {h.get('subject', '')[:80]}")
    print(f"\n{len(ids)} messages.")


def signals(labels: list[str], h: dict) -> tuple[bool, bool]:
    """(important, marketing) from Gmail's labels and headers. Important wins: it is never marketing."""
    important = "IMPORTANT" in labels
    marketing = not important and (bool(MARKETING_LABELS & set(labels)) or "list-unsubscribe" in h)
    return important, marketing


def _inbox_item(account: str, folder: str, h: dict, when: datetime, attachments: list[str], labels: list[str]) -> None:
    """Pointer item in data/inbox for the server's agent (same layout as apps/server/src/inbox.ts)."""
    item_id = secrets.token_hex(8)
    subject = h.get("subject", "") or "(no subject)"
    name = f"{when:%Y-%m-%d}-email-{_slug(subject)[:40].rstrip('-') or 'untitled'}-{item_id[-6:]}"
    path = INBOX / name
    path.mkdir(parents=True, exist_ok=True)
    important, marketing = signals(labels, h)
    item = {
        "id": item_id,
        "source": "email",
        "status": "ignored" if marketing else "new",
        "received": datetime.now().astimezone().isoformat(),
        "title": subject[:200],
        "from": h.get("from", ""),
        "account": account,
        "files": [],
        "ref": f"archive/email/{folder}",
        "outcome": "",
        "important": important,
        "marketing": marketing,
    }
    (path / "content.md").write_text(
        f"Email in archive/email/{folder}/message.md" + (f" with attachments: {', '.join(attachments)}" if attachments else "") + "\n",
        encoding="utf-8",
    )
    tmp = path / "item.json.tmp"
    tmp.write_text(json.dumps(item, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path / "item.json")


def _mailboxes() -> dict[str, str]:
    """archive/email/.mailboxes.json: Gmail address of each account, for links to the messages."""
    path = DESTINATION / ".mailboxes.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def _remember_mailbox(account: str, address: str) -> None:
    if not address:
        return
    known = _mailboxes()
    if known.get(account) != address:
        known[account] = address
        DESTINATION.mkdir(parents=True, exist_ok=True)
        (DESTINATION / ".mailboxes.json").write_text(json.dumps(known, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _mailbox(account: str) -> str:
    """The Gmail address of the account in use, asked to Gmail the first time."""
    address = _mailboxes().get(account) or _get(f"{API}/profile").get("emailAddress", "")
    _remember_mailbox(account, address)
    return address


def _index() -> dict[str, str]:
    """index.json: message id -> folder in archive/email."""
    return json.loads(INDEX.read_text()) if INDEX.exists() else {}


def _record(message_id: str, folder: str) -> None:
    """Adds a message to index.json, re-read under a lock: a sync and a fetch may run at the same time."""
    with (DESTINATION / ".index.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        index = _index()
        index[message_id] = folder
        tmp = INDEX.with_name("index.json.tmp")
        tmp.write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        tmp.replace(INDEX)


def _sent(m: dict, h: dict) -> str:
    """When the message was sent (its Date header), else when Gmail received it."""
    try:
        return parsedate_to_datetime(h["date"]).isoformat() if "date" in h else _date(m).isoformat()
    except (TypeError, ValueError):
        return _date(m).isoformat()


def _save(m: dict, account: str, mailbox: str) -> tuple[Path, list[str]]:
    """Writes one message (format full) to archive/email/<date>-<subject>-<id6>/: message.md and its attachments."""
    i = m["id"]
    h = _headers(m)
    folder = DESTINATION / f"{_date(m):%Y-%m-%d}-{_slug(h.get('subject', ''))}-{i[-6:]}"
    folder.mkdir(parents=True, exist_ok=True)

    text, html_text, attachments = None, None, []
    for p in _parts(m["payload"]):
        body = p.get("body", {})
        if p.get("filename") and body.get("attachmentId"):
            data = _get(f"{API}/messages/{i}/attachments/{body['attachmentId']}")["data"]
            name = _file_name(p["filename"], attachments)
            (folder / name).write_bytes(_b64(data))
            attachments.append(name)
        elif p.get("mimeType") == "text/plain" and body.get("data") and text is None:
            text = _b64(body["data"]).decode("utf-8", errors="replace")
        elif p.get("mimeType") == "text/html" and body.get("data") and html_text is None:
            html_text = _b64(body["data"]).decode("utf-8", errors="replace")
    if text is None:
        text = _from_html(html_text) if html_text else ""

    lines = [
        "---",
        f"id: {i}",
        f"account: {account}",
        f"mailbox: {mailbox}",
        f"thread: {m['threadId']}",
        f"date: {_sent(m, h)}",
        f"from: {json.dumps(h.get('from', ''), ensure_ascii=False)}",
        f"to: {json.dumps(h.get('to', ''), ensure_ascii=False)}",
        f"subject: {json.dumps(h.get('subject', ''), ensure_ascii=False)}",
        f"labels: {json.dumps(m.get('labelIds', []))}",
        f"attachments: {json.dumps(attachments, ensure_ascii=False)}",
        "---",
        "",
        text.strip(),
        "",
    ]
    (folder / "message.md").write_text("\n".join(lines), encoding="utf-8")
    return folder, attachments


def sync(query: str, limit: int = 5000, account: str = "default", per_run: int = PER_RUN) -> None:
    DESTINATION.mkdir(parents=True, exist_ok=True)
    index = _index()
    important = [i for i in _list(f"({query}) is:important", limit) if i not in index]
    seen = set(important)
    rest = [i for i in _list(query, limit) if i not in index and i not in seen]
    ids = (important + rest)[:per_run]
    left = len(important) + len(rest) - len(ids)
    print(f"{len(important) + len(rest)} new messages ({len(important)} important), downloading {len(ids)}" + (f", {left} left for the next runs." if left else "."))
    # The mailbox address, so the web app can open each message in the right Gmail account.
    mailbox = _get(f"{API}/profile").get("emailAddress", "")
    _remember_mailbox(account, mailbox)
    for i in ids:
        m = _get(f"{API}/messages/{i}", {"format": "full"})
        folder, attachments = _save(m, account, mailbox)
        when = _date(m)
        if (datetime.now() - when).days <= INBOX_DAYS:
            _inbox_item(account, folder.name, _headers(m), when, attachments, m.get("labelIds", []))
        _record(i, folder.name)
        print(f"  {folder.relative_to(DATA_DIR)}  ({len(attachments)} attachments)")


# ---------- links ----------

# Gmail's web app names a conversation with these 40 letters: a number that, written in base 64,
# is the text "f:<thread id in decimal>" ("thread-f:" in older links, "msg-f:" for one message).
# The API wants the same id in hex. Older links carry the hex id itself.
_LETTERS = "BCDFGHJKLMNPQRSTVWXZbcdfghjklmnpqrstvwxz"
_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
_API_ID = re.compile(r"^[0-9a-f]{12,20}$")


def _unletter(token: str) -> str:
    n = 0
    for c in token:
        n = n * len(_LETTERS) + _LETTERS.index(c)
    digits = ""
    while n:
        n, r = divmod(n, 64)
        digits = _B64[r] + digits
    try:
        return base64.b64decode(digits + "=" * (-len(digits) % 4)).decode("ascii")
    except (ValueError, UnicodeDecodeError):
        return ""


def _permanent(text: str) -> tuple[str, str]:
    """("thread" or "message", hex id) from "f:123", "thread-f:123" or "msg-f:123"."""
    m = re.fullmatch(r"(thread-|msg-)?([af]):(r?-?\d+)", text)
    if not m:
        raise GmailError("not a link to a Gmail conversation", "not-a-link")
    if m.group(2) == "a" or not m.group(3).isdigit():
        raise GmailError("the Gmail API cannot open this kind of link (drafts, some sent messages)", "unsupported")
    return ("message" if m.group(1) == "msg-" else "thread"), format(int(m.group(3)), "x")


def parse_link(link: str) -> tuple[str, str, str]:
    """(kind, id, address) for a Gmail web link or an API id: kind "thread" or "message", the id in hex
    as the API wants it, and the mailbox address the link names (authuser=, /u/<address>/) or ""."""
    text = link.strip().strip("<>")
    if _API_ID.match(text):
        return "thread", text, ""
    url = urllib.parse.urlsplit(text)
    if url.scheme not in ("http", "https") or url.hostname != "mail.google.com":
        raise GmailError("not a Gmail link", "not-a-link")
    query = urllib.parse.parse_qs(url.query)
    parts = url.path.split("/")
    named = query.get("authuser", []) + ([urllib.parse.unquote(parts[parts.index("u") + 1])] if "u" in parts[:-1] else [])
    address = next((a for a in named if "@" in a), "")
    for key in ("permmsgid", "permthid"):
        if query.get(key):
            return (*_permanent(query[key][0]), address)
    if query.get("th") and _API_ID.match(query["th"][0]):
        return "thread", query["th"][0], address
    # #inbox/<id>, #label/<name>/<id>, #search/<query>/<id>, maybe followed by ?projector=1
    last = url.fragment.split("?")[0].rstrip("/").rsplit("/", 1)[-1]
    if _API_ID.match(last):
        return "thread", last, address
    if len(last) >= 16 and all(c in _LETTERS for c in last):
        return (*_permanent(_unletter(last)), address)
    raise GmailError("not a link to a Gmail conversation: open the email in Gmail and copy the address", "not-a-link")


def _connected(address: str = "") -> list[str]:
    """Accounts with a token, the one whose mailbox is `address` first."""
    names = []
    for name in accounts():
        _use(name)
        if TOKEN.exists():
            names.append(name)
    known = _mailboxes()
    return sorted(names, key=lambda n: known.get(n, "").lower() != address.lower()) if address else names


def _lookup(kind: str, ident: str) -> dict:
    """The conversation (format full) with this id, or the one holding the message with this id."""
    if kind == "thread":
        try:
            return _get(f"{API}/threads/{ident}", {"format": "full"})
        except GmailError as e:
            if e.code != "not-found":
                raise
    thread = _get(f"{API}/messages/{ident}", {"format": "minimal"})["threadId"]
    return _get(f"{API}/threads/{thread}", {"format": "full"})


def _find(parsed: tuple[str, str, str], account: str | None) -> tuple[str, dict]:
    """The account that has the conversation, and the conversation."""
    kind, ident, address = parsed
    names = [account] if account else _connected(address)
    if not names:
        raise GmailError("no Gmail account is connected: set one up in Settings", "no-account")
    failed: GmailError | None = None
    for name in names:
        _use(name)
        try:
            return name, _lookup(kind, ident)
        except GmailError as e:
            if e.code != "not-found":
                failed = e  # this account is broken: another one may still have it
    raise failed or GmailError("not found in the connected Gmail accounts", "not-found")


# Messages saved before the English schema used Italian keys (same list as apps/server/src/sources.ts).
_ITALIAN_KEYS = {"data": "date", "da": "from", "a": "to", "oggetto": "subject", "etichette": "labels", "allegati": "attachments", "casella": "account"}


def _read_message(folder: Path, limit: int = -1) -> tuple[dict, str]:
    """message.md's header (key: value lines, JSON when quoted) and its body."""
    with (folder / "message.md").open(encoding="utf-8", errors="replace") as f:
        text = f.read(limit)
    head, _, body = text.removeprefix("---\n").partition("\n---\n")
    meta: dict = {}
    for line in head.splitlines():
        key, sep, value = line.partition(": ")
        if not sep:
            continue
        try:
            meta[key] = json.loads(value) if value[:1] in '"[' else value
        except ValueError:
            meta[key] = value
    for old, key in _ITALIAN_KEYS.items():
        if old in meta:
            meta.setdefault(key, meta[old])
    return meta, body.strip()


def _saved(ident: str) -> list[Path]:
    """Folders in archive/email of the conversation with this id (or the one holding this message), oldest first."""
    if not DESTINATION.exists():
        return []
    heads = {f.parent: _read_message(f.parent, 4096)[0] for f in DESTINATION.glob("*/message.md")}
    thread = next((h.get("thread") for h in heads.values() if h.get("id") == ident), None) or ident
    return sorted((p for p, h in heads.items() if h.get("thread") == thread), key=lambda p: str(heads[p].get("date", "")))


def _snippet(text: str) -> str:
    text = " ".join(text.split())
    return text if len(text) <= 280 else text[:279].rstrip() + "…"


def _from_archive(folders: list[Path]) -> dict:
    messages = [_read_message(f) for f in folders]
    (first, _), (last, body) = messages[0], messages[-1]
    return {
        "account": last.get("account", ""),
        "mailbox": last.get("mailbox", ""),
        "thread": last.get("thread", ""),
        "subject": first.get("subject", ""),
        "from": last.get("from", ""),
        "date": last.get("date") or None,
        "snippet": _snippet(body),
        "messages": len(folders),
        "attachments": [a for meta, _ in messages for a in meta.get("attachments", [])],
        "folders": [f"archive/email/{f.name}" for f in folders],
    }


def _from_gmail(account: str, mailbox: str, thread: dict, folders: list[str]) -> dict:
    messages = thread.get("messages", [])
    first, last = _headers(messages[0]), _headers(messages[-1])
    return {
        "account": account,
        "mailbox": mailbox,
        "thread": thread["id"],
        "subject": first.get("subject", ""),
        "from": last.get("from", ""),
        "date": _sent(messages[-1], last),
        "snippet": _snippet(html.unescape(messages[-1].get("snippet", ""))),
        "messages": len(messages),
        "attachments": [p["filename"] for m in messages for p in _parts(m["payload"]) if p.get("filename") and p.get("body", {}).get("attachmentId")],
        "folders": folders,
    }


def preview(link: str, account: str | None = None) -> dict:
    """What `link` points to, without downloading it: from the archive when the conversation is there."""
    parsed = parse_link(link)
    saved = _saved(parsed[1])
    if saved and not account:
        return _from_archive(saved)
    name, thread = _find(parsed, account)
    index = _index()
    folders = [f"archive/email/{index[m['id']]}" for m in thread.get("messages", []) if m["id"] in index]
    return _from_gmail(name, _mailbox(name), thread, folders)


def fetch(link: str, account: str | None = None) -> dict:
    """Saves the messages of the conversation `link` points to that are not in archive/email yet.
    No inbox item: whoever asked for it decides whether it gets filed."""
    parsed = parse_link(link)
    try:
        name, thread = _find(parsed, account)
    except GmailError as e:
        saved = _saved(parsed[1])
        if not saved:
            raise
        return {**_from_archive(saved), "new": 0, "stale": str(e)}  # Gmail unreachable: what the archive has
    mailbox = _mailbox(name)
    DESTINATION.mkdir(parents=True, exist_ok=True)
    folders, new = [], 0
    for m in thread.get("messages", []):
        known = _index().get(m["id"])
        if not (known and (DESTINATION / known / "message.md").exists()):
            folder, _ = _save(m, name, mailbox)
            _record(m["id"], folder.name)
            known, new = folder.name, new + 1
        folders.append(f"archive/email/{known}")
    return {**_from_gmail(name, mailbox, thread, folders), "new": new}


def _show(r: dict) -> None:
    print(r["subject"] or "(no subject)")
    print(f"  {r['from']}  {r['date'] or ''}  [{r['account']}]")
    print(f"  {r['messages']} messages" + (f", attachments: {', '.join(r['attachments'])}" if r["attachments"] else ""))
    for f in r["folders"]:
        print(f"  {f}")
    if r["snippet"]:
        print(f"\n{r['snippet']}")


def _query(account: str, given: str | None) -> str:
    if given:
        return given
    q = accounts().get(account, "")
    if q:
        return q
    raise GmailError(f"{account}: no query: pass it as an argument or set it in gmail.toml")


def main() -> None:
    args = sys.argv[1:]
    command = args.pop(0) if args else ""
    account, every, manual, as_json = "default", False, False, False
    chosen: str | None = None
    rest: list[str] = []
    while args:
        a = args.pop(0)
        if a == "--account" and args:
            account = chosen = args.pop(0)
        elif a == "--all":
            every = True
        elif a == "--manual":
            manual = True
        elif a == "--json":
            as_json = True
        else:
            rest.append(a)
    try:
        if command == "accounts":
            for name in accounts() or {"default": ""}:
                _use(name)
                print(f"{name:<16} {'connected' if TOKEN.exists() else 'not connected'}")
        elif command == "login":
            _use(account)
            login(manual)
        elif command == "logout":
            _use(account)
            logout()
        elif command == "search" and rest:
            _use(account)
            search(rest[0])
        elif command in ("preview", "fetch") and rest:
            if chosen:
                _use(chosen)
            result = (preview if command == "preview" else fetch)(rest[0], chosen)
            if as_json:
                print(json.dumps(result, ensure_ascii=False))
            else:
                _show(result)
        elif command == "sync":
            names = list(accounts()) if every else [account]
            failed = []
            for name in names:
                _use(name)
                if every and not TOKEN.exists():
                    continue  # listed but never connected
                print(f"[{name}]", flush=True)
                try:
                    sync(_query(name, rest[0] if rest else None), account=name)
                except GmailError as e:
                    if not every:
                        raise
                    failed.append(name)
                    print(f"error: {name}: {e}", file=sys.stderr)
            if failed:
                sys.exit(1)
        else:
            print(__doc__)
            sys.exit(2)
    except GmailError as e:
        if as_json:
            print(json.dumps({"error": str(e), "code": e.code}, ensure_ascii=False))
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
