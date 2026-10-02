"""Download emails about your paperwork from Gmail into the data folder (read-only).

Usage:
  python3 scripts/gmail.py login             authorize access (opens the browser)
  python3 scripts/gmail.py search "QUERY"    list matching messages without downloading them
  python3 scripts/gmail.py sync [QUERY]      download messages and attachments into data/archive/email/
  python3 scripts/gmail.py logout            revoke the token and delete it

QUERY uses Gmail search syntax (e.g. 'label:paperwork newer_than:1y').
Without QUERY, sync uses `query` from gmail.toml.

Requires data/secrets/credentials.json: an OAuth client of type "Desktop app" created on
Google Cloud with the Gmail API enabled. The token is saved in data/secrets/token.json (0600).
Setup: docs/gmail.md.
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
TOKEN = SECRETS / "token.json"
CONFIG = DATA_DIR / "gmail.toml"
DESTINATION = DATA_DIR / "archive" / "email"
INDEX = DESTINATION / "index.json"

SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
API = "https://gmail.googleapis.com/gmail/v1/users/me"


class GmailError(Exception):
    pass


# ---------- OAuth (desktop app, loopback + PKCE) ----------


def _client() -> dict:
    if not CREDENTIALS.exists():
        raise GmailError(f"{CREDENTIALS} is missing: download it from Google Cloud (see docs/gmail.md)")
    data = json.loads(CREDENTIALS.read_text())
    client = data.get("installed")
    if not client:
        raise GmailError("credentials.json is not of type 'Desktop app'")
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
    fd = os.open(TOKEN, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(token, f, indent=2)


def login() -> None:
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
        raise GmailError("not connected: run `python3 scripts/gmail.py login` first")
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


def _file_name(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", name).strip() or "attachment"


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


def sync(query: str, limit: int = 5000) -> None:
    DESTINATION.mkdir(parents=True, exist_ok=True)
    index = json.loads(INDEX.read_text()) if INDEX.exists() else {}
    ids = [i for i in _list(query, limit) if i not in index]
    print(f"{len(ids)} new messages to download.")
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
                name = _file_name(p["filename"])
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
        index[i] = folder.name
        INDEX.write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"  {folder.relative_to(DATA_DIR)}  ({len(attachments)} attachments)")


def _configured_query() -> str:
    if CONFIG.exists():
        with CONFIG.open("rb") as f:
            q = tomllib.load(f).get("query", "").strip()
        if q:
            return q
    raise GmailError("no query: pass it as an argument or set it in gmail.toml")


def main() -> None:
    args = sys.argv[1:]
    command = args[0] if args else ""
    try:
        if command == "login":
            login()
        elif command == "logout":
            logout()
        elif command == "search" and len(args) > 1:
            search(args[1])
        elif command == "sync":
            sync(args[1] if len(args) > 1 else _configured_query())
        else:
            print(__doc__)
            sys.exit(2)
    except GmailError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
