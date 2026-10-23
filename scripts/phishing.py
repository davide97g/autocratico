"""Static phishing checks on an email: who really sent it, where its links really go, what it asks for.

Usage:
  python3 scripts/phishing.py check FOLDER   the checks of a saved email (archive/email/<folder>), as JSON

scripts/gmail.py and scripts/imap.py call evidence() when they save a message and write the result
to checks.json beside message.md: the headers (SPF, DKIM, DMARC, Reply-To) and the links' real
addresses are gone once the message is saved as text. `check` prints checks.json, or, for an email
saved before it existed, what can still be told from message.md (the sender and the text's links).

Nothing leaves the machine: no link is opened and no domain is looked up, the checks only read the
message. Each signal has a `code` the web app explains and an `evidence`: the exact part of the
message it is about. The background agent reads them, weighs the context (is there such a deadline,
case or payment in the register?) and decides; these checks alone never flag an email.

The names of public bodies and their domains (OFFICIAL) and the keyword lists are Italian:
docs/customize/country.md.
"""

from __future__ import annotations

import html.parser
import ipaddress
import json
import re
import sys
from collections.abc import Iterable
from email.utils import getaddresses, parseaddr
from pathlib import Path
from urllib.parse import urlsplit

VERSION = 1
MAX_LINKS = 40
MAX_EVIDENCE = 200

# Public bodies that phishing impersonates: names as they appear in a sender's name, their domains
# (a subdomain counts), and words that give a fake domain away (agenziaentrate-rimborsi.com).
OFFICIAL: list[tuple[str, tuple[str, ...], tuple[str, ...], tuple[str, ...]]] = [
    # (body, names, domains, domain words)
    ("Agenzia delle Entrate", ("agenzia delle entrate", "agenzia entrate", "agenziaentrate"), ("agenziaentrate.gov.it", "agenziaentrate.it"), ("agenziaentrate", "agenzia-entrate", "entrate")),
    ("Agenzia delle Entrate-Riscossione", ("riscossione", "equitalia"), ("agenziaentrateriscossione.gov.it", "agenziariscossione.gov.it"), ("riscossione", "equitalia")),
    ("INPS", ("inps",), ("inps.it", "inps.gov.it"), ("inps",)),
    ("INAIL", ("inail",), ("inail.it",), ("inail",)),
    ("Poste Italiane", ("poste italiane", "posteitaliane", "bancoposta", "postepay"), ("poste.it", "posteitaliane.it", "postepay.it"), ("posteitaliane", "poste-italiane", "bancoposta", "postepay", "poste")),
    ("PagoPA", ("pagopa", "pago pa", "app io"), ("pagopa.gov.it", "pagopa.it", "io.italia.it", "notifichedigitali.it"), ("pagopa",)),
    ("SPID / AgID", ("spid", "agid"), ("agid.gov.it", "spid.gov.it"), ("spid", "agid")),
    ("ACI", ("automobile club", "aci pra", "pra aci"), ("aci.it",), ("aci-pra",)),
    ("Motorizzazione", ("motorizzazione", "portale dell'automobilista"), ("ilportaledellautomobilista.it", "mit.gov.it"), ("motorizzazione",)),
    ("Polizia di Stato", ("polizia di stato", "polizia postale"), ("poliziadistato.it", "interno.it", "interno.gov.it"), ("poliziadistato", "poliziapostale")),
    ("Carabinieri", ("carabinieri",), ("carabinieri.it",), ("carabinieri",)),
    ("Guardia di Finanza", ("guardia di finanza",), ("gdf.it", "gdf.gov.it"), ("guardiadifinanza",)),
    ("Ministero", ("ministero",), ("gov.it",), ()),
]

# Two-label public suffixes: the organisation behind a.b.gov.it is b.gov.it, not gov.it.
SUFFIXES = {"gov.it", "co.uk", "org.uk", "ac.uk", "com.au", "co.jp", "com.br", "co.nz", "com.tr", "com.mx"}
SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "cutt.ly", "rebrand.ly", "shorturl.at", "t.ly", "tiny.cc", "rb.gy", "s.id", "lnkd.in"}
# Top-level domains seen far more in phishing than in the mail of a public body or a company.
ODD_TLDS = {"top", "xyz", "icu", "click", "link", "live", "shop", "online", "site", "buzz", "rest", "cfd", "sbs", "cyou", "monster", "quest", "zip", "mov", "tk", "ml", "ga", "cf", "gq", "support", "help", "info"}
RISKY_FILES = {".html", ".htm", ".shtml", ".svg", ".exe", ".scr", ".com", ".bat", ".cmd", ".js", ".vbs", ".jar", ".msi", ".hta", ".lnk", ".iso", ".img", ".docm", ".xlsm", ".pptm"}
ARCHIVES = {".zip", ".rar", ".7z", ".gz"}

# What the text asks for. Lowercase regular expressions; each match becomes one signal at most per kind.
URGENCY = [
    r"entro (?:le )?(?:prossime )?\d+\s*(?:ore|h)\b",
    r"\bimmediatamente\b",
    r"\bultimo avviso\b",
    r"\b(?:account|conto|carta|profilo|utenza|servizio)\b[^.\n]{0,30}\b(?:sospes|bloccat|disattivat|limitat)\w*",
    r"\b(?:sar[àa]|verr[àa]) (?:sospes|bloccat|disattivat|cancellat)\w*",
    r"\bscade oggi\b",
    r"within \d+ hours",
    r"\bimmediately\b",
    r"\bfinal notice\b",
    r"\b(?:account|card)\b[^.\n]{0,30}\b(?:suspended|locked|blocked|disabled)\b",
]
PAYMENT = [
    r"\brimborso\b[^.\n]{0,60}\b(?:in attesa|disponibile|da (?:ricevere|riscuotere)|a tuo favore|spettante)",
    r"\b(?:paga|pagare|saldare|versare)\b[^.\n]{0,20}\b(?:ora|subito|adesso|oggi)\b",
    r"\b(?:paga|pagare|versa|versare)\b[^.\n]{0,25}\d+[,.]\d{2}\s*(?:€|eur\b|euro\b)",
    r"\b(?:spese|tassa|costi?) di (?:spedizione|consegna|giacenza|sdoganamento)\b",
    r"\b(?:refund|payment)\b[^.\n]{0,30}\b(?:pending|waiting|available)\b",
    r"\bpay now\b",
    r"\bcustoms fee\b",
]
CARD = [
    r"\bdati (?:della |della tua |della sua )?carta\b",
    r"\bnumero (?:della )?carta\b",
    r"\b(?:cvv|cvc|cvv2)\b",
    r"\bcodice di sicurezza\b",
    r"\bscadenza della carta\b",
    r"\bcard (?:number|details)\b",
    r"\bsecurity code\b",
]
CREDENTIALS = [
    r"\b(?:conferma|confermare|verifica|verificare|aggiorna|aggiornare)\b[^.\n]{0,10}\b(?:i (?:tuoi|suoi) dati|(?:il tuo|il suo) (?:account|profilo)|(?:la tua|la sua) identit[àa])",
    r"\b(?:inserisci|inserire)\b[^.\n]{0,20}\b(?:credenziali|password|pin|codice otp)\b",
    r"\b(?:credenziali spid|codice otp|codice pin)\b",
    r"\b(?:confirm|verify|update) your (?:details|account|identity|information)\b",
    r"\b(?:enter|provide) your (?:password|pin|credentials)\b",
]

SEVERITY_WEIGHT = {"high": 3, "medium": 2, "low": 1}
_URL = re.compile(r"https?://[^\s<>\"'()\[\]]+", re.I)
_DOMAIN_TEXT = re.compile(r"^\s*(?:https?://)?(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/:?#]\S*)?\s*$", re.I)


# ---------- domains ----------


def domain_of(address: str) -> str:
    """The domain of an email address or a URL's host, lowercase, as ASCII (IDNA)."""
    host = address.rsplit("@", 1)[-1].strip().strip(".").lower()
    host = host.split(":", 1)[0]
    try:
        return host.encode("idna").decode("ascii") if host and not host.isascii() else host
    except UnicodeError:
        return host


def organisation(domain: str) -> str:
    """mail.example.co.uk -> example.co.uk; a.b.c.it -> c.it. Good enough to tell senders apart."""
    labels = domain.split(".")
    keep = 3 if ".".join(labels[-2:]) in SUFFIXES else 2
    return ".".join(labels[-keep:])


def _official_domain(domain: str, domains: Iterable[str]) -> bool:
    return any(domain == d or domain.endswith("." + d) for d in domains)


def official_body(text: str) -> str | None:
    """The public body named in a sender's display name, if any."""
    low = text.lower()
    for body, names, _, _ in OFFICIAL:
        if any(re.search(rf"(?<![a-z]){re.escape(n)}(?![a-z])", low) for n in names):
            return body
    return None


def _body_domains(body: str) -> tuple[str, ...]:
    return next(d for b, _, d, _ in OFFICIAL if b == body)


def lookalike(domain: str) -> str | None:
    """The public body a domain pretends to belong to (agenziaentrate-rimborsi.com), or None."""
    if not domain or any(_official_domain(domain, domains) for _, _, domains, _ in OFFICIAL):
        return None
    parts = re.split(r"[.-]", domain)
    compact = domain.replace("-", "")
    for body, _, _, words in OFFICIAL:
        for w in words:
            if (len(w) >= 6 and w.replace("-", "") in compact) or w in parts:
                return body
    return None


def _ip(host: str) -> bool:
    try:
        ipaddress.ip_address(host.strip("[]"))
        return True
    except ValueError:
        return False


# ---------- the message ----------


class _Links(html.parser.HTMLParser):
    """<a href> with their visible text, and whether the HTML has a form."""

    def __init__(self):
        super().__init__()
        self.links: list[tuple[str, str]] = []
        self.form = False
        self._href: str | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self._href = dict(attrs).get("href") or ""
            self._text = []
        elif tag == "form":
            self.form = True

    def handle_endtag(self, tag):
        if tag == "a" and self._href is not None:
            self.links.append((self._href, " ".join("".join(self._text).split())))
            self._href = None

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)


def _links(html_text: str | None, text: str) -> tuple[list[tuple[str, str]], bool]:
    found: list[tuple[str, str]] = []
    form = False
    if html_text:
        p = _Links()
        try:
            p.feed(html_text)
        except Exception:  # noqa: BLE001 - malformed HTML from a stranger: keep what was read
            pass
        found, form = p.links, p.form
    for url in _URL.findall(text):
        found.append((url.rstrip(".,;:!?"), ""))
    # One entry per address; the HTML's visible text wins over the plain text's bare URL.
    unique: dict[str, str] = {}
    for href, label in found:
        if href.lower().startswith(("http://", "https://")) and not unique.get(href):
            unique[href] = label
    return list(unique.items())[:MAX_LINKS], form


def _cut(s: str, n: int = MAX_EVIDENCE) -> str:
    s = " ".join(s.split())
    return s if len(s) <= n else s[: n - 1] + "…"


def _sentence(text: str, start: int, end: int) -> str:
    """The sentence around a match, as written (whitespace collapsed), so the web app can find it in the text."""
    left = max(text.rfind(c, 0, start) for c in ".!?\n")
    right = [i for i in (text.find(c, end) for c in ".!?\n") if i >= 0]
    return _cut(text[left + 1 : (min(right) + 1) if right else len(text)].strip())


def _auth(headers: list[tuple[str, str]]) -> dict[str, str]:
    """spf, dkim and dmarc as the receiving server saw them: its Authentication-Results (the topmost)."""
    out = {"spf": "", "dkim": "", "dmarc": ""}
    results = next((v for k, v in headers if k.lower() == "authentication-results"), "")
    for key in out:
        values = [v.lower() for v in re.findall(rf"\b{key}=(\w+)", results, re.I)]
        if values:
            out[key] = "pass" if "pass" in values else values[0]
    if not out["spf"]:
        spf = next((v for k, v in headers if k.lower() == "received-spf"), "")
        if spf.split():
            out["spf"] = spf.split()[0].lower()
    return out


def evidence(headers: Iterable[tuple[str, str]], html_text: str | None, text: str, attachments: Iterable[str] = ()) -> dict:
    """Every static check on one message. `headers` as (name, value) pairs in their order (several
    Received or Authentication-Results lines count), `html_text` its HTML part when it has one."""
    hs = [(str(k), str(v)) for k, v in headers]
    get = lambda name: next((v for k, v in hs if k.lower() == name), "")  # noqa: E731
    name, address = parseaddr(get("from"))
    sender = domain_of(address) if "@" in address else ""
    reply = [domain_of(a) for _, a in getaddresses([get("reply-to")]) if "@" in a]
    reply_to = next((d for d in reply if organisation(d) != organisation(sender)), reply[0] if reply else "")
    _, rp = parseaddr(get("return-path"))
    return_path = domain_of(rp) if "@" in rp else ""
    auth = _auth(hs)
    signals: list[dict] = []

    def signal(kind: str, code: str, severity: str, ev: str) -> None:
        signals.append({"kind": kind, "code": code, "severity": severity, "evidence": _cut(ev)})

    # Who sent it.
    if auth["dmarc"] == "fail":
        signal("auth", "dmarc_fail", "high", f"dmarc=fail ({sender})")
    if auth["spf"] in ("fail", "softfail"):
        signal("auth", "spf_fail", "medium" if auth["spf"] == "fail" else "low", f"spf={auth['spf']}")
    if auth["dkim"] == "fail":
        signal("auth", "dkim_fail", "medium", "dkim=fail")
    claimed = official_body(name)
    if claimed and sender and not _official_domain(sender, _body_domains(claimed)):
        signal("sender", "impersonation", "high", f"{name} <{address}>")
    fake = lookalike(sender)
    if fake and not claimed:
        signal("sender", "lookalike_sender", "high", address)
    if sender.startswith("xn--") or ".xn--" in sender:
        signal("sender", "punycode_sender", "medium", address)
    if reply_to and sender and organisation(reply_to) != organisation(sender):
        signal("reply_to", "reply_to_mismatch", "medium", get("reply-to"))
    if return_path and sender and organisation(return_path) != organisation(sender) and (claimed or fake):
        signal("reply_to", "return_path_mismatch", "low", rp)

    # Where its links go.
    pairs, form = _links(html_text, text)
    links: list[dict] = []
    for href, label in pairs:
        host = domain_of(urlsplit(href).hostname or "")
        flags: list[str] = []
        shown = _DOMAIN_TEXT.match(label)
        if shown and organisation(domain_of(shown.group(1))) != organisation(host):
            flags.append("mismatch")
        if host in SHORTENERS:
            flags.append("shortener")
        if _ip(host):
            flags.append("ip")
        if host.startswith("xn--") or ".xn--" in host:
            flags.append("punycode")
        if host.rsplit(".", 1)[-1] in ODD_TLDS:
            flags.append("odd_tld")
        if lookalike(host):
            flags.append("lookalike")
        if claimed and not _official_domain(host, _body_domains(claimed)):
            flags.append("not_official")
        links.append({"text": _cut(label, 120), "href": _cut(href, 300), "domain": host, "flags": flags})
    for flag, code, severity in [
        ("mismatch", "link_mismatch", "high"),
        ("lookalike", "link_lookalike", "high"),
        ("ip", "link_ip", "high"),
        ("not_official", "link_not_official", "high"),
        ("punycode", "link_punycode", "medium"),
        ("shortener", "link_shortener", "medium"),
        ("odd_tld", "link_odd_tld", "medium"),
    ]:
        hit = next((link for link in links if flag in link["flags"]), None)
        if hit:
            shown = f"{hit['text']} → {hit['domain']}" if flag == "mismatch" else hit["domain"]
            signal("link", code, severity, shown)
    if form:
        signal("credentials", "html_form", "high", "<form>")

    # What it asks for.
    subject = get("subject")
    body = f"{subject}\n{text}"
    low = body.lower()
    for kind, code, severity, patterns in [
        ("urgency", "urgency", "medium", URGENCY),
        ("payment", "payment_request", "low", PAYMENT),
        ("credentials", "card_data", "high", CARD),
        ("credentials", "credentials", "medium", CREDENTIALS),
    ]:
        m = next((m for p in patterns if (m := re.search(p, low))), None)
        if m:
            signal(kind, code, severity, _sentence(body, m.start(), m.end()))

    # What it carries.
    for f in attachments:
        ext = Path(f).suffix.lower()
        if ext in RISKY_FILES:
            signal("attachment", "risky_attachment", "high", f)
        elif ext in ARCHIVES:
            signal("attachment", "archive_attachment", "low", f)

    score = sum(SEVERITY_WEIGHT[s["severity"]] for s in signals)
    risk = "high" if score >= 6 else "medium" if score >= 3 else "low" if score else "none"
    return {
        "version": VERSION,
        "risk": risk,
        "auth": auth,
        "from": {"name": name, "address": address, "domain": sender},
        "reply_to": reply_to,
        "return_path": return_path,
        "links": links,
        "signals": signals,
    }


def write(folder: Path, result: dict) -> None:
    (folder / "checks.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


# ---------- command line ----------


def _from_message(folder: Path) -> dict:
    """The checks message.md still allows: no headers but From, no HTML, links as written in the text."""
    md = (folder / "message.md").read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", md, re.S)
    meta: dict[str, str] = {}
    body = md
    if m:
        body = m.group(2)
        for line in m.group(1).splitlines():
            key, _, value = line.partition(": ")
            try:
                meta[key.strip()] = json.loads(value) if value.startswith(("\"", "[")) else value
            except json.JSONDecodeError:
                meta[key.strip()] = value
    attachments = meta.get("attachments") if isinstance(meta.get("attachments"), list) else []
    result = evidence([("from", str(meta.get("from", ""))), ("subject", str(meta.get("subject", "")))], None, body, attachments)
    result["partial"] = True  # saved before checks.json: no SPF/DKIM/DMARC, Reply-To or real link targets
    return result


def check(path: str) -> dict:
    from store import DATA_DIR

    root = (DATA_DIR / "archive" / "email").resolve()
    folder = (DATA_DIR / path).resolve() if not Path(path).is_absolute() else Path(path).resolve()
    if folder.name == "message.md":
        folder = folder.parent
    if folder.parent != root or not (folder / "message.md").is_file():
        raise SystemExit(f"not a saved email: {path} (expected archive/email/<folder>)")
    saved = folder / "checks.json"
    return json.loads(saved.read_text(encoding="utf-8")) if saved.is_file() else _from_message(folder)


def main(argv: list[str]) -> None:
    if len(argv) != 2 or argv[0] != "check":
        print(__doc__.split("\n\n")[1], file=sys.stderr)
        raise SystemExit(2)
    print(json.dumps(check(argv[1]), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1:])
