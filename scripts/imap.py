"""Download emails about your paperwork from IMAP mailboxes (Yahoo, Outlook, a provider's own) into the data folder, read-only.

Usage:
  python3 scripts/imap.py accounts                          list accounts and whether they are connected
  python3 scripts/imap.py login --account NAME [--host H] [--port P] [--user U]
                                                            save the connection (the password is read from stdin)
  python3 scripts/imap.py check --account NAME              sign in and list the folders
  python3 scripts/imap.py check --stdin                     the same with {"host", "port", "user", "password"} on stdin
  python3 scripts/imap.py sync [--account NAME | --all]     download new messages into data/archive/email/
  python3 scripts/imap.py logout --account NAME             delete the saved connection

Accounts are listed in imap.toml as [[account]] tables: name, folders (default ["INBOX"]), days
(how far back the first sync goes, default 365). Host, port, user and password stay together in
data/secrets/imap/<name>.json (0600): the password only ever goes to the host saved with it.
Use an app password (Yahoo: Account security → Generate app password), never the account's own.

Read-only: folders are opened with EXAMINE and messages read with BODY.PEEK, so nothing is marked
as read, moved or deleted. Messages are saved like scripts/gmail.py saves them
(archive/email/<date>-<subject>-<id6>/message.md and attachments), and new ones from the last
INBOX_DAYS days get an item in data/inbox/ for the server's agent. IMAP has no Gmail labels: a
flagged (starred) message counts as Important, a message with List-Unsubscribe as marketing.
The last UID seen per folder is kept in archive/email/.imap.json; a sync downloads at most
PER_RUN messages per account, oldest first, and the next run goes on.
"""

from __future__ import annotations

import email
import email.policy
import fcntl
import hashlib
import imaplib
import json
import os
import re
import ssl
import sys
import tomllib
from datetime import datetime, timedelta
from email.message import EmailMessage
from email.utils import parsedate_to_datetime
from pathlib import Path

from gmail import DESTINATION, INBOX_DAYS, PER_RUN, _file_name, _from_html, _inbox_item, _index, _record, _slug
from store import DATA_DIR

CONFIG = DATA_DIR / "imap.toml"
SECRETS = DATA_DIR / "secrets" / "imap"
STATE = DESTINATION / ".imap.json"
DEFAULT_DAYS = 365
MAX_BYTES = 40 * 1024 * 1024  # larger messages are skipped (logged), not downloaded
TIMEOUT = 60

_NAME = re.compile(r"^[a-z0-9][a-z0-9_-]{0,31}$")
_HOST = re.compile(r"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")


class ImapError(Exception):
    pass


# ---------- accounts ----------


def accounts() -> dict[str, dict]:
    """Account name -> {folders, days}, from imap.toml."""
    found: dict[str, dict] = {}
    if CONFIG.exists():
        with CONFIG.open("rb") as f:
            config = tomllib.load(f)
        for a in config.get("account", []):
            name = str(a.get("name", "")).strip()
            if not _NAME.match(name):
                raise ImapError(f"imap.toml: invalid account name {name!r} (lowercase letters, digits, - and _)")
            folders = [str(x) for x in a.get("folders", ["INBOX"]) if str(x).strip()] or ["INBOX"]
            days = a.get("days", DEFAULT_DAYS)
            found[name] = {"folders": folders, "days": days if isinstance(days, int) and days > 0 else DEFAULT_DAYS}
    return found


def _secret(name: str) -> Path:
    if not _NAME.match(name):
        raise ImapError(f"invalid account name {name!r} (lowercase letters, digits, - and _)")
    return SECRETS / f"{name}.json"


def connection(conn: dict) -> dict:
    """Checked host, port, user and password: only a public hostname over TLS."""
    host = str(conn.get("host", "")).strip().lower()
    port = conn.get("port", 993)
    user = str(conn.get("user", "")).strip()
    password = str(conn.get("password", ""))
    if not _HOST.match(host):
        raise ImapError(f"invalid host {host!r}: a name like imap.mail.yahoo.com")
    if not isinstance(port, int) or not 1 <= port <= 65535:
        raise ImapError(f"invalid port {port!r}")
    if not user or len(user) > 200 or not password or len(password) > 200:
        raise ImapError("user and password are required")
    return {"host": host, "port": port, "user": user, "password": password}


def _load(name: str) -> dict:
    path = _secret(name)
    if not path.exists():
        raise ImapError(f"{name}: not connected: add it from Settings or run `python3 scripts/imap.py login --account {name}`")
    return connection(json.loads(path.read_text()))


def save(name: str, conn: dict) -> None:
    conn = connection(conn)
    SECRETS.parent.mkdir(mode=0o700, exist_ok=True)
    SECRETS.mkdir(mode=0o700, exist_ok=True)
    fd = os.open(_secret(name), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(conn, f, indent=2)


# ---------- IMAP ----------


def _open(conn: dict) -> imaplib.IMAP4_SSL:
    try:
        imap = imaplib.IMAP4_SSL(conn["host"], conn["port"], ssl_context=ssl.create_default_context(), timeout=TIMEOUT)
    except (OSError, imaplib.IMAP4.error) as e:
        raise ImapError(f"{conn['host']}: unreachable: {e}") from None
    try:
        imap.login(conn["user"], conn["password"])
    except imaplib.IMAP4.error as e:
        imap.shutdown()
        # Never echo the password; providers' messages are short ("AUTHENTICATE failed").
        raise ImapError(f"{conn['host']}: sign-in refused ({_text(e)[:120]}): check the user and use an app password") from None
    return imap


def _text(value) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, Exception) and value.args:
        return _text(value.args[0])
    return str(value)


def _quote(folder: str) -> str:
    return '"' + folder.replace("\\", "\\\\").replace('"', '\\"') + '"'


def folders(imap: imaplib.IMAP4_SSL) -> list[str]:
    typ, data = imap.list()
    if typ != "OK":
        return []
    names = []
    for line in data:
        m = re.match(rb'\((?P<flags>[^)]*)\) (?:"[^"]*"|NIL) (?P<name>.+)$', line or b"")
        if m and b"\\Noselect" not in m.group("flags"):
            names.append(_text(m.group("name")).strip().strip('"'))
    return names


def check(conn: dict) -> dict:
    """Signs in and lists the folders; nothing is read."""
    imap = _open(connection(conn))
    try:
        return {"user": conn["user"], "host": conn["host"], "folders": folders(imap)}
    finally:
        imap.logout()


def _state() -> dict:
    return json.loads(STATE.read_text()) if STATE.exists() else {}


def _remember(account: str, folder: str, validity: str, last: int) -> None:
    with (DESTINATION / ".index.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        state = _state()
        state.setdefault(account, {})[folder] = {"uidvalidity": validity, "last_uid": last}
        tmp = STATE.with_name(".imap.json.tmp")
        tmp.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        tmp.replace(STATE)


def _uids(imap: imaplib.IMAP4_SSL, criteria: str) -> list[int]:
    typ, data = imap.uid("SEARCH", criteria)
    if typ != "OK":
        raise ImapError(f"search failed: {_text(data[0] if data else '')[:200]}")
    return sorted(int(u) for u in b" ".join(d for d in data if d).split())


def _message_id(account: str, msg: EmailMessage, validity: str, folder: str, uid: int) -> str:
    """Stable id across folders and re-syncs: the Message-ID header when there is one. Not hex, so it
    is never taken for a Gmail id (no Gmail link in the web app)."""
    key = str(msg.get("message-id", "")).strip() or f"{account}:{folder}:{validity}:{uid}"
    return "imap-" + hashlib.sha256(f"{account}\n{key}".encode()).hexdigest()[:24]


def _received(msg: EmailMessage) -> datetime:
    try:
        return parsedate_to_datetime(str(msg["date"])).astimezone().replace(tzinfo=None)
    except (TypeError, ValueError, IndexError):
        return datetime.now()


def _save(msg: EmailMessage, ident: str, account: str, mailbox: str, flags: list[str]) -> tuple[Path, list[str], datetime]:
    """Writes one message to archive/email/<date>-<subject>-<id6>/, the same layout as scripts/gmail.py."""
    when = _received(msg)
    subject = str(msg.get("subject", "") or "")
    folder = DESTINATION / f"{when:%Y-%m-%d}-{_slug(subject)}-{ident[-6:]}"
    folder.mkdir(parents=True, exist_ok=True)

    attachments: list[str] = []
    for part in msg.iter_attachments():
        if part.get_content_type() == "message/rfc822":
            data, fallback = part.as_bytes(), "message.eml"
        else:
            data, fallback = part.get_payload(decode=True), "attachment"
        if not data:
            continue
        name = _file_name(part.get_filename() or fallback, attachments)
        (folder / name).write_bytes(data)
        attachments.append(name)

    body = msg.get_body(preferencelist=("plain", "html"))
    text = ""
    if body is not None:
        try:
            content = body.get_content()
        except (LookupError, UnicodeError, AssertionError):
            content = _text(body.get_payload(decode=True) or b"")
        text = _from_html(content) if body.get_content_type() == "text/html" else content

    try:
        sent = parsedate_to_datetime(str(msg["date"])).isoformat()
    except (TypeError, ValueError, IndexError):
        sent = when.isoformat()
    lines = [
        "---",
        f"id: {ident}",
        "provider: imap",
        f"account: {account}",
        f"mailbox: {mailbox}",
        f"thread: {ident}",
        f"date: {sent}",
        f"from: {json.dumps(str(msg.get('from', '') or ''), ensure_ascii=False)}",
        f"to: {json.dumps(str(msg.get('to', '') or ''), ensure_ascii=False)}",
        f"subject: {json.dumps(subject, ensure_ascii=False)}",
        f"labels: {json.dumps(flags, ensure_ascii=False)}",
        f"attachments: {json.dumps(attachments, ensure_ascii=False)}",
        "---",
        "",
        text.strip(),
        "",
    ]
    (folder / "message.md").write_text("\n".join(lines), encoding="utf-8")
    return folder, attachments, when


def _flags(raw: bytes) -> list[str]:
    m = re.search(rb"FLAGS \(([^)]*)\)", raw)
    return _text(m.group(1)).split() if m else []


def _size(raw: bytes) -> int:
    m = re.search(rb"RFC822\.SIZE (\d+)", raw)
    return int(m.group(1)) if m else 0


def sync(account: str, settings: dict, per_run: int = PER_RUN) -> None:
    conn = _load(account)
    DESTINATION.mkdir(parents=True, exist_ok=True)
    imap = _open(conn)
    try:
        budget = per_run
        for folder in settings["folders"]:
            typ, data = imap.select(_quote(folder), readonly=True)  # EXAMINE: nothing is changed
            if typ != "OK":
                print(f"  {folder}: cannot open ({_text(data[0] if data else '')[:120]})", file=sys.stderr)
                continue
            validity = _text((imap.response("UIDVALIDITY")[1] or [b""])[0])
            known = _state().get(account, {}).get(folder, {})
            if known.get("uidvalidity") == validity and known.get("last_uid"):
                last = int(known["last_uid"])
                uids = [u for u in _uids(imap, f"UID {last + 1}:*") if u > last]
            else:
                # First sync, or the server renumbered the folder: by date, Message-IDs skip what is saved.
                last = 0
                since = (datetime.now() - timedelta(days=settings["days"])).strftime("%d-%b-%Y")
                uids = _uids(imap, f"SINCE {since}")
            todo, left = uids[:budget], max(0, len(uids) - budget)
            print(f"  {folder}: {len(uids)} new messages, downloading {len(todo)}" + (f", {left} left for the next runs." if left else "."))
            index = _index()
            for uid in todo:
                typ, head = imap.uid("FETCH", str(uid), "(FLAGS RFC822.SIZE)")
                meta = head[0] if head and isinstance(head[0], bytes) else b""
                if _size(meta) > MAX_BYTES:
                    print(f"  {folder} {uid}: skipped, larger than {MAX_BYTES // 2**20} MB", file=sys.stderr)
                else:
                    typ, data = imap.uid("FETCH", str(uid), "(BODY.PEEK[])")
                    raw = next((d[1] for d in data if isinstance(d, tuple)), None) if typ == "OK" else None
                    if raw is None:
                        print(f"  {folder} {uid}: could not be read", file=sys.stderr)
                    else:
                        msg = email.message_from_bytes(raw, policy=email.policy.default)
                        ident = _message_id(account, msg, validity, folder, uid)
                        if ident not in index:
                            flags = _flags(meta)
                            path, attachments, when = _save(msg, ident, account, conn["user"], flags + [f"folder:{folder}"])
                            if (datetime.now() - when).days <= INBOX_DAYS:
                                headers = {k.lower(): str(v) for k, v in msg.items()}
                                labels = ["IMPORTANT"] if "\\Flagged" in flags else []
                                _inbox_item(account, path.name, headers, when, attachments, labels)
                            _record(ident, path.name)
                            index[ident] = path.name
                            print(f"  {path.relative_to(DATA_DIR)}  ({len(attachments)} attachments)")
                _remember(account, folder, validity, max(uid, last))
                last = max(uid, last)
            budget -= len(todo)
            if not uids:
                _remember(account, folder, validity, last)
    finally:
        try:
            imap.logout()
        except (OSError, imaplib.IMAP4.error):
            pass


# ---------- command line ----------


def main() -> None:
    args = sys.argv[1:]
    command = args.pop(0) if args else ""
    opts: dict[str, str] = {}
    flags = set()
    while args:
        a = args.pop(0)
        if a in ("--account", "--host", "--port", "--user") and args:
            opts[a[2:]] = args.pop(0)
        elif a in ("--all", "--stdin"):
            flags.add(a[2:])
        else:
            print(__doc__)
            sys.exit(2)
    try:
        if command == "accounts":
            for name in accounts():
                print(f"{name:<16} {'connected' if _secret(name).exists() else 'not connected'}")
        elif command == "login" and "account" in opts:
            name = opts["account"]
            old = json.loads(_secret(name).read_text()) if _secret(name).exists() else {}
            conn = {
                "host": opts.get("host", old.get("host", "")),
                "port": int(opts.get("port", old.get("port", 993))),
                "user": opts.get("user", old.get("user", "")),
                "password": sys.stdin.readline().rstrip("\n") if not sys.stdin.isatty() else __import__("getpass").getpass("App password: "),
            }
            found = check(conn)
            save(name, conn)
            print(f"Connected to {found['user']} on {found['host']} ({len(found['folders'])} folders). Read-only access.")
        elif command == "check":
            conn = json.loads(sys.stdin.read()) if "stdin" in flags else _load(opts.get("account", ""))
            print(json.dumps(check(conn), ensure_ascii=False))
        elif command == "logout" and "account" in opts:
            _secret(opts["account"]).unlink(missing_ok=True)
            print("Disconnected.")
        elif command == "sync":
            listed = accounts()
            names = list(listed) if "all" in flags else [opts.get("account", "")]
            failed = []
            for name in names:
                if name not in listed:
                    raise ImapError(f"{name!r} is not in imap.toml")
                if "all" in flags and not _secret(name).exists():
                    continue  # listed but never connected
                print(f"[{name}]", flush=True)
                try:
                    sync(name, listed[name])
                except (ImapError, OSError, imaplib.IMAP4.error) as e:
                    if "all" not in flags:
                        raise
                    failed.append(name)
                    print(f"error: {name}: {_text(e)}", file=sys.stderr)
            if failed:
                sys.exit(1)
        else:
            print(__doc__)
            sys.exit(2)
    except (ImapError, OSError, imaplib.IMAP4.error, ValueError) as e:
        print(f"error: {_text(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
