"""Download emails about your paperwork from one or more Gmail accounts into the data folder (read-only).

Usage:
  python3 scripts/gmail.py accounts                          list accounts and whether they are connected
  python3 scripts/gmail.py login [--account NAME] [--manual] authorize access (--manual: no local browser)
  python3 scripts/gmail.py search [--account NAME] "QUERY"   list matching messages without downloading them
  python3 scripts/gmail.py sync [--account NAME | --all] [QUERY]
                                                             download messages and attachments into data/archive/email/
  python3 scripts/gmail.py logout [--account NAME]           revoke the token and delete it

Accounts are listed in gmail.toml as [[account]] tables (name, query); a top-level `query`
is the account "default". QUERY uses Gmail search syntax (e.g. 'label:paperwork newer_than:1y');
without it, sync uses the account's query.

New messages from the last INBOX_DAYS days also get an item in data/inbox/, so that the
autocratico server's agent files them (deadlines, cases).

Requires data/secrets/credentials.json: an OAuth client created on Google Cloud with the Gmail
API enabled ("Web application" from Settings in the web app, or "Desktop app" for `login` here).
Tokens are saved in data/secrets/gmail/<name>.json (0600). Setup: docs/gmail.md.
"""

from __future__ import annotations

import base64
import hashlib
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

SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
API = "https://gmail.googleapis.com/gmail/v1/users/me"


class GmailError(Exception):
    pass


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
        raise GmailError(f"{CREDENTIALS} is missing: download it from Google Cloud (see docs/gmail.md)")
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
        raise GmailError(f"{TOKEN.stem}: not connected: run `python3 scripts/gmail.py login --account {TOKEN.stem}` first")
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
                raise GmailError(f"Gmail API HTTP {e.code}: {body[:300]}") from None
            wait = min(60, 5 * 2**attempt)
            print(f"  Gmail quota reached, waiting {wait}s…", flush=True)
            time.sleep(wait)
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


def _inbox_item(account: str, folder: str, h: dict, when: datetime, attachments: list[str]) -> None:
    """Pointer item in data/inbox for the server's agent (same layout as apps/server/src/inbox.ts)."""
    item_id = secrets.token_hex(8)
    subject = h.get("subject", "") or "(no subject)"
    name = f"{when:%Y-%m-%d}-email-{_slug(subject)[:40].rstrip('-') or 'untitled'}-{item_id[-6:]}"
    path = INBOX / name
    path.mkdir(parents=True, exist_ok=True)
    item = {
        "id": item_id,
        "source": "email",
        "status": "new",
        "received": datetime.now().astimezone().isoformat(),
        "title": subject[:200],
        "from": h.get("from", ""),
        "account": account,
        "files": [],
        "ref": f"archive/email/{folder}",
        "outcome": "",
    }
    (path / "content.md").write_text(
        f"Email in archive/email/{folder}/message.md" + (f" with attachments: {', '.join(attachments)}" if attachments else "") + "\n",
        encoding="utf-8",
    )
    tmp = path / "item.json.tmp"
    tmp.write_text(json.dumps(item, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path / "item.json")


def _remember_mailbox(account: str, address: str) -> None:
    """archive/email/.mailboxes.json: Gmail address of each account, for links to the messages."""
    if not address:
        return
    path = DESTINATION / ".mailboxes.json"
    known = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    if known.get(account) != address:
        known[account] = address
        path.write_text(json.dumps(known, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def sync(query: str, limit: int = 5000, account: str = "default") -> None:
    DESTINATION.mkdir(parents=True, exist_ok=True)
    index = json.loads(INDEX.read_text()) if INDEX.exists() else {}
    ids = [i for i in _list(query, limit) if i not in index]
    print(f"{len(ids)} new messages to download.")
    # The mailbox address, so the web app can open each message in the right Gmail account.
    mailbox = _get(f"{API}/profile").get("emailAddress", "")
    _remember_mailbox(account, mailbox)
    for i in ids:
        m = _get(f"{API}/messages/{i}", {"format": "full"})
        h = _headers(m)
        when = _date(m)
        folder = DESTINATION / f"{when:%Y-%m-%d}-{_slug(h.get('subject', ''))}-{i[-6:]}"
        folder.mkdir(exist_ok=True)

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

        try:
            sent = parsedate_to_datetime(h["date"]).isoformat() if "date" in h else when.isoformat()
        except (TypeError, ValueError):
            sent = when.isoformat()
        lines = [
            "---",
            f"id: {i}",
            f"account: {account}",
            f"mailbox: {mailbox}",
            f"thread: {m['threadId']}",
            f"date: {sent}",
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
        if (datetime.now() - when).days <= INBOX_DAYS:
            _inbox_item(account, folder.name, h, when, attachments)
        index[i] = folder.name
        INDEX.write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"  {folder.relative_to(DATA_DIR)}  ({len(attachments)} attachments)")


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
    account, every, manual = "default", False, False
    rest: list[str] = []
    while args:
        a = args.pop(0)
        if a == "--account" and args:
            account = args.pop(0)
        elif a == "--all":
            every = True
        elif a == "--manual":
            manual = True
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
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
