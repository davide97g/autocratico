"""Search every connected mailbox at once (Gmail and IMAP), read a message found, save it to the archive. Read-only.

Usage:
  python3 scripts/mail.py accounts                       connected mailboxes, Gmail and IMAP
  python3 scripts/mail.py search [--account NAME] [--days N] [--limit N] "QUERY"
                                                         messages matching QUERY in every connected mailbox
  python3 scripts/mail.py read REF                       the full text of one message, without saving it
  python3 scripts/mail.py save REF                       save it to archive/email/ (Gmail: the whole conversation)

QUERY uses Gmail's syntax, searched in subject, sender and body: words (all of them must match),
"exact phrases", OR between alternatives (caldaia OR manutenzione), -word to leave out, from:,
to:, subject:, newer_than:2y, after:2025/01/01, before:2026/01/01. Gmail understands all of its
operators; for IMAP mailboxes those listed are translated (TEXT, FROM, TO, SUBJECT, SINCE, BEFORE)
and others (has:, label:, in:…) are skipped with a note. IMAP mailboxes are searched in every
folder but trash, spam and drafts; Gmail everywhere but trash and spam, like its own search box.

Each result has a REF (gmail:<account>:<id> or imap:<account>:<uidvalidity>:<uid>:<folder>) for
`read` and `save`, and the archive/email/ folder when the message is saved already. `save` writes
the message like a sync does (message.md and attachments), without an inbox item; nothing is ever
changed in the mailbox (Gmail read-only scope, IMAP folders opened with EXAMINE and BODY.PEEK).
Mailboxes are set up from Settings in the web app (docs/gmail.md, docs/imap.md).
"""

from __future__ import annotations

import email
import email.policy
import html
import imaplib
import re
import sys
from datetime import datetime, timedelta
from email.message import EmailMessage

import gmail
import imap as imapbox
from store import DATA_DIR

LIMIT = 20  # results per mailbox
MAX_TEXT = 30_000  # characters of a message `read` prints
# Folders not searched: special-use flags (RFC 6154), and the usual names on servers without them.
SKIP_FLAGS = {"\\Trash", "\\Junk", "\\Drafts", "\\All", "\\Flagged"}
SKIP_NAMES = re.compile(r"(^|[/.])(trash|deleted( items| messages)?|cestino|spam|junk|bulk( mail)?|posta indesiderata|drafts?|bozze)$", re.I)
_FIELDS = {"from": "FROM", "to": "TO", "subject": "SUBJECT"}
_DATES = {"newer_than", "after", "older_than", "before"}
# Gmail operators with no IMAP equivalent here; any other "word:" is searched as text (10:30, http://…).
_GMAIL_ONLY = {"has", "label", "in", "is", "filename", "cc", "bcc", "category", "list", "deliveredto", "size", "larger", "smaller", "rfc822msgid", "older", "newer", "around"}
_TOKEN = re.compile(r'(-?)(?:(\w+):)?(?:"([^"]*)"?|(\S+))')


class MailError(Exception):
    pass


# ---------- query ----------


def _date(value: str) -> datetime | None:
    m = re.fullmatch(r"(\d+)([dmy])", value)
    if m:
        n, unit = int(m.group(1)), m.group(2)
        return datetime.now() - timedelta(days=n * {"d": 1, "m": 31, "y": 366}[unit])
    try:
        return datetime.strptime(value.replace("-", "/"), "%Y/%m/%d")
    except ValueError:
        return None


def imap_query(query: str) -> dict:
    """Gmail syntax for IMAP: {"all": [[(key, value, negated), ...] OR-ed alternatives, ...] AND-ed,
    "since", "before", "skipped"}. As in Gmail, OR binds tighter than the space: a b OR c = a AND (b OR c)."""
    groups: list[list[tuple[str, str, bool]]] = []
    since = before = None
    skipped: list[str] = []
    pending_or = False
    for neg, field, phrase, word in _TOKEN.findall(query.replace("(", " ").replace(")", " ")):
        value = (phrase if phrase else word).strip()
        if not field and not neg and value in ("OR", "|"):
            pending_or = bool(groups)
            continue
        if not value:
            continue
        key = field.lower()
        if key and key not in _FIELDS and key not in _DATES and key not in _GMAIL_ONLY:
            key, value = "", f"{field}:{value}"
        if key in _DATES:
            when = _date(value)
            if when is None:
                skipped.append(f"{field}:{value}")
            elif key in ("newer_than", "after"):
                since = when
            else:
                before = when
            continue
        if key in _GMAIL_ONLY:
            skipped.append(f"{neg}{field}:{value}")
            continue
        term = (_FIELDS.get(key, "TEXT"), value, bool(neg))
        if pending_or:
            groups[-1].append(term)
        else:
            groups.append([term])
        pending_or = False
    return {"all": groups, "since": since, "before": before, "skipped": skipped}


# ---------- Gmail ----------


def _gmail_names(account: str | None) -> list[str]:
    try:
        names = gmail._connected()
    except gmail.GmailError as e:
        print(f"error: gmail: {e}", file=sys.stderr)
        return []
    return [n for n in names if account in (None, n)]


def _gmail_search(name: str, query: str, days: int | None, limit: int) -> list[dict]:
    gmail._use(name)
    q = f"({query})" + (f" newer_than:{days}d" if days else "")
    index = gmail._index()
    found = []
    for i in gmail._list(q, limit):
        m = gmail._get(f"{gmail.API}/messages/{i}", {"format": "metadata", "metadataHeaders": ["From", "Subject", "Date"]})
        h = gmail._headers(m)
        found.append({
            "date": gmail._date(m),
            "from": h.get("from", ""),
            "subject": h.get("subject", ""),
            "snippet": gmail._snippet(html.unescape(m.get("snippet", ""))),
            "ref": f"gmail:{name}:{i}",
            "saved": index.get(i, ""),
        })
    return found


def _gmail_read(name: str, ident: str) -> None:
    gmail._use(name)
    m = gmail._get(f"{gmail.API}/messages/{ident}", {"format": "full"})
    h = gmail._headers(m)
    thread = gmail._get(f"{gmail.API}/threads/{m['threadId']}", {"format": "minimal"}).get("messages", [])
    others = [f"gmail:{name}:{t['id']}" for t in thread if t["id"] != ident]
    _print_message(
        h.get("date", "") or f"{gmail._date(m):%Y-%m-%d %H:%M}", h.get("from", ""), h.get("to", ""), h.get("subject", ""),
        f"gmail {name}", gmail.attachment_names(m["payload"]), gmail._index().get(ident, ""), gmail.body_text(m["payload"]),
    )
    if others:
        print(f"\nSame conversation: {', '.join(others)}")


def _gmail_save(name: str, ident: str) -> None:
    gmail._use(name)
    r = gmail.fetch(ident, name)
    print(f"{r['subject'] or '(no subject)'}: {r['messages']} messages, {r['new']} newly saved.")
    for f in r["folders"]:
        print(f"  {f}")


# ---------- IMAP ----------


def _imap_names(account: str | None) -> list[str]:
    try:
        listed = imapbox.accounts()
    except imapbox.ImapError as e:
        print(f"error: imap: {e}", file=sys.stderr)
        return []
    return [n for n in listed if account in (None, n) and imapbox._secret(n).exists()]


def _uid_search(box: imaplib.IMAP4_SSL, key: str, value: str, since: datetime | None, before: datetime | None) -> set[int]:
    """One criterion. The value goes as a literal, so quotes and accents in it need no escaping."""
    data = value.encode("utf-8")
    args = (["CHARSET", "UTF-8"] if not value.isascii() else []) + (["SINCE", since.strftime("%d-%b-%Y")] if since else [])
    args += (["BEFORE", before.strftime("%d-%b-%Y")] if before else []) + [key]
    box.literal = data
    typ, found = box.uid("SEARCH", *args)
    if typ != "OK":
        raise imapbox.ImapError(f"search failed: {imapbox._text(found[0] if found else '')[:200]}")
    return {int(u) for u in b" ".join(d for d in found if d).split()}


def _imap_match(box: imaplib.IMAP4_SSL, q: dict) -> set[int]:
    """Sets of UIDs combined here: -word is taken away from the matches rather than sent as NOT,
    which Yahoo answers with a server error."""
    search = lambda key, value: _uid_search(box, key, value, q["since"], q["before"])  # noqa: E731
    result: set[int] | None = None
    for group in sorted(q["all"], key=lambda g: all(t[2] for t in g)):  # the left-out words last
        if all(negated for _, _, negated in group):
            if result is None:
                raise imapbox.ImapError("over IMAP a -word needs other words to search for")
            for key, value, _ in group:
                result -= search(key, value)
        else:
            alternatives: set[int] = set()
            for key, value, negated in group:
                if not negated:
                    alternatives |= search(key, value)
            result = alternatives if result is None else result & alternatives
        if not result:
            break
    return result or set()


def _headers(box: imaplib.IMAP4_SSL, uids: list[int]) -> dict[int, EmailMessage]:
    found: dict[int, EmailMessage] = {}
    typ, data = box.uid("FETCH", ",".join(map(str, uids)), "(UID BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)])")
    for part in data if typ == "OK" else []:
        if isinstance(part, tuple):
            m = re.search(rb"UID (\d+)", part[0])
            if m:
                found[int(m.group(1))] = email.message_from_bytes(part[1], policy=email.policy.default)
    return found


def _imap_search(name: str, query: str, days: int | None, limit: int) -> list[dict]:
    q = imap_query(query)
    if q["skipped"]:
        print(f"[imap {name}] skipped, not available over IMAP: {' '.join(q['skipped'])}", file=sys.stderr)
    if not q["all"]:
        raise imapbox.ImapError("nothing to search for over IMAP: give some words, a phrase, from: or subject:")
    if days:
        q["since"] = max(q["since"] or datetime.min, datetime.now() - timedelta(days=days))
    conn = imapbox._load(name)
    box = imapbox._open(conn)
    index = gmail._index()
    found: dict[str, dict] = {}
    try:
        for folder, flags in imapbox.listing(box):
            if flags & SKIP_FLAGS or SKIP_NAMES.search(folder):
                continue
            typ, _ = box.select(imapbox._quote(folder), readonly=True)  # EXAMINE: nothing is changed
            if typ != "OK":
                continue
            validity = imapbox._text((box.response("UIDVALIDITY")[1] or [b""])[0])
            uids = sorted(_imap_match(box, q))[-limit:]
            for uid, msg in (_headers(box, uids) if uids else {}).items():
                ident = imapbox._message_id(name, msg, validity, folder, uid)
                if ident not in found:  # the same message in two folders
                    found[ident] = {
                        "date": imapbox._received(msg),
                        "from": str(msg.get("from", "") or ""),
                        "subject": str(msg.get("subject", "") or ""),
                        "snippet": "",
                        "ref": f"imap:{name}:{validity}:{uid}:{folder}",
                        "saved": index.get(ident, ""),
                    }
    finally:
        try:
            box.logout()
        except (OSError, imaplib.IMAP4.error):
            pass
    return sorted(found.values(), key=lambda r: r["date"], reverse=True)[:limit]


def _imap_fetch(name: str, validity: str, uid: str, folder: str) -> tuple[EmailMessage, list[str], dict]:
    conn = imapbox._load(name)
    box = imapbox._open(conn)
    try:
        typ, data = box.select(imapbox._quote(folder), readonly=True)
        if typ != "OK":
            raise imapbox.ImapError(f"{folder}: cannot open ({imapbox._text(data[0] if data else '')[:120]})")
        if imapbox._text((box.response("UIDVALIDITY")[1] or [b""])[0]) != validity:
            raise imapbox.ImapError(f"{folder} was renumbered by the server since the search: search again")
        typ, data = box.uid("FETCH", uid, "(UID FLAGS RFC822.SIZE)")
        head = next((d[0] if isinstance(d, tuple) else d for d in data if d), b"") if typ == "OK" else b""
        if not head:
            raise imapbox.ImapError(f"message {uid} not found in {folder}")
        if imapbox._size(head) > imapbox.MAX_BYTES:
            raise imapbox.ImapError(f"message larger than {imapbox.MAX_BYTES // 2**20} MB")
        typ, data = box.uid("FETCH", uid, "(BODY.PEEK[])")
        raw = next((d[1] for d in data if isinstance(d, tuple)), None) if typ == "OK" else None
        if raw is None:
            raise imapbox.ImapError(f"message {uid} could not be read")
        return email.message_from_bytes(raw, policy=email.policy.default), imapbox._flags(head), conn
    finally:
        try:
            box.logout()
        except (OSError, imaplib.IMAP4.error):
            pass


def _imap_read(name: str, validity: str, uid: str, folder: str) -> None:
    msg, _, conn = _imap_fetch(name, validity, uid, folder)
    ident = imapbox._message_id(name, msg, validity, folder, int(uid))
    names = [part.get_filename() or "attachment" for part in msg.iter_attachments()]
    _print_message(
        str(msg.get("date", "") or ""), str(msg.get("from", "") or ""), str(msg.get("to", "") or ""), str(msg.get("subject", "") or ""),
        f"imap {name} ({conn['user']}), {folder}", names, gmail._index().get(ident, ""), imapbox.body_text(msg),
    )


def _imap_save(name: str, validity: str, uid: str, folder: str) -> None:
    msg, flags, conn = _imap_fetch(name, validity, uid, folder)
    ident = imapbox._message_id(name, msg, validity, folder, int(uid))
    known = gmail._index().get(ident)
    if known and (gmail.DESTINATION / known / "message.md").exists():
        print(f"Already saved: archive/email/{known}")
        return
    gmail.DESTINATION.mkdir(parents=True, exist_ok=True)
    path, attachments, _ = imapbox._save(msg, ident, name, conn["user"], flags + [f"folder:{folder}"])
    gmail._record(ident, path.name)
    print(f"Saved: {path.relative_to(DATA_DIR)}" + (f" (attachments: {', '.join(attachments)})" if attachments else ""))


# ---------- output ----------


def _print_message(date: str, sender: str, to: str, subject: str, where: str, attachments: list[str], saved: str, text: str) -> None:
    print(f"Subject: {subject or '(no subject)'}\nFrom: {sender}\nTo: {to}\nDate: {date}\nMailbox: {where}")
    if attachments:
        print(f"Attachments: {', '.join(attachments)}" + ("" if saved else " (save the message to open them)"))
    print(f"Archive: archive/email/{saved}" if saved else "Archive: not saved")
    text = text.strip()
    if len(text) > MAX_TEXT:
        text = text[:MAX_TEXT] + f"\n\n[… {len(text) - MAX_TEXT} more characters: save the message and read its message.md]"
    print(f"\n{text or '(no text)'}")


def _show(label: str, results: list[dict]) -> None:
    print(f"[{label}] {len(results)} messages")
    for r in results:
        print(f"{r['date']:%Y-%m-%d}  {r['from'][:60]}  {r['subject'][:100] or '(no subject)'}")
        if r["snippet"]:
            print(f"  {r['snippet']}")
        print(f"  ref {r['ref']}" + (f"  · saved archive/email/{r['saved']}" if r["saved"] else ""))
    print()


def search(query: str, account: str | None, days: int | None, limit: int) -> bool:
    jobs = [("gmail", n) for n in _gmail_names(account)] + [("imap", n) for n in _imap_names(account)]
    if not jobs:
        raise MailError(f"no connected mailbox named {account!r}" if account else "no mailbox is connected: set up Gmail or IMAP in Settings")
    ok = False
    for kind, name in jobs:
        try:
            results = (_gmail_search if kind == "gmail" else _imap_search)(name, query, days, limit)
        except (gmail.GmailError, imapbox.ImapError, OSError, imaplib.IMAP4.error) as e:
            print(f"[{kind} {name}] error: {imapbox._text(e)}\n")
            continue
        ok = True
        _show(f"{kind} {name}", results)
    return ok


def _ref(ref: str) -> tuple[str, list[str]]:
    kind, _, rest = ref.strip().partition(":")
    parts = rest.split(":", 3) if kind == "imap" else rest.split(":", 1)
    if kind == "gmail" and len(parts) == 2 and gmail._NAME.match(parts[0]) and re.fullmatch(r"[0-9a-f]{12,20}", parts[1]):
        return kind, parts
    if kind == "imap" and len(parts) == 4 and imapbox._NAME.match(parts[0]) and parts[1].isdigit() and parts[2].isdigit() and parts[3]:
        return kind, parts
    raise MailError(f"not a REF from `mail.py search`: {ref!r}")


def main() -> None:
    args = sys.argv[1:]
    command = args.pop(0) if args else ""
    account: str | None = None
    days: int | None = None
    limit = LIMIT
    rest: list[str] = []
    try:
        while args:
            a = args.pop(0)
            if a == "--account" and args:
                account = args.pop(0)
            elif a == "--days" and args:
                days = max(1, int(args.pop(0)))
            elif a == "--limit" and args:
                limit = min(100, max(1, int(args.pop(0))))
            else:
                rest.append(a)
        if command == "accounts":
            for name in _gmail_names(None):
                print(f"gmail  {name}")
            for name in _imap_names(None):
                print(f"imap   {name}")
        elif command == "search" and rest:
            if not search(" ".join(rest), account, days, limit):
                sys.exit(1)
        elif command in ("read", "save") and len(rest) == 1:
            kind, parts = _ref(rest[0])
            if kind == "gmail":
                (_gmail_read if command == "read" else _gmail_save)(*parts)
            else:
                (_imap_read if command == "read" else _imap_save)(*parts)
        else:
            print(__doc__)
            sys.exit(2)
    except (MailError, gmail.GmailError, imapbox.ImapError, OSError, imaplib.IMAP4.error, ValueError) as e:
        print(f"error: {imapbox._text(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
