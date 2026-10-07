"""Data loading for autocratico: deadlines, state, profile, cases, catalog."""

from __future__ import annotations

import calendar
import json
import math
import os
import re
import tomllib
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
# Personal data lives outside the code: `data/` (ignored by git) or the folder in AUTOCRATICO_DATA.
DATA_DIR = Path(os.environ.get("AUTOCRATICO_DATA") or ROOT / "data").expanduser().resolve()

DEADLINES_FILE = DATA_DIR / "deadlines.toml"
PROFILE_FILE = DATA_DIR / "profile.toml"
STATE_FILE = DATA_DIR / "state.json"
CASES_DIR = DATA_DIR / "cases"
CATALOG_DIR = DATA_DIR / "catalog"
SEVERITIES = ("high", "medium", "low")


def today() -> date:
    """Today in the register's time zone (TZ_DEADLINES, as the server uses), not the machine's."""
    return datetime.now(ZoneInfo(os.environ.get("TZ_DEADLINES") or "Europe/Rome")).date()


@dataclass
class Deadline:
    id: str
    title: str
    area: str
    date: date | None
    repeat: str = "none"
    until: date | None = None
    severity: str = "medium"
    remind_days: tuple[int, ...] = ()
    amount: float | None = None
    amounts: dict[str, float] = field(default_factory=dict)
    payment: bool = False
    sensitive: bool = False
    case: str | None = None
    notes: str = ""
    source: str = ""

    @property
    def complete(self) -> bool:
        return self.date is not None

    def step(self) -> tuple[str, int] | None:
        """Repeat unit and interval, None when it does not repeat."""
        r = self.repeat.strip().lower()
        if r in ("", "none"):
            return None
        if r == "yearly":
            return ("years", 1)
        if r == "monthly":
            return ("months", 1)
        m = re.fullmatch(r"every (\d+) (years|months)", r)
        if m:
            return (m.group(2), int(m.group(1)))
        raise ValueError(f"{self.id}: invalid repeat: {self.repeat!r}")


def _number(v) -> float | None:
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _money(did: str, amount, amounts) -> dict:
    """amount (euro or "TODO") and amounts ({"YYYY-MM-DD" = euro}) of a deadline (mirrors core/deadlines.ts)."""
    if amount is not None and amount != "TODO" and _number(amount) is None:
        raise ValueError(f'{did}: amount must be a number of euro or "TODO"')
    recorded: dict[str, float] = {}
    if amounts is not None:
        if not isinstance(amounts, dict):
            raise ValueError(f'{did}: amounts must be a table of "YYYY-MM-DD" = euro')
        for on, v in sorted(amounts.items()):
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", on) or _number(v) is None:
                raise ValueError(f'{did}: amounts must be a table of "YYYY-MM-DD" = euro')
            recorded[on] = v
    return {"amount": _number(amount), "amounts": recorded, "payment": amount is not None or bool(recorded)}


def occurrence_amount(d: Deadline, on: date) -> tuple[float | None, str | None]:
    """Amount of d on `on` and where it comes from: known, estimate, unknown (None: not a payment).

    Its recorded amount, else the deadline's, else the average of the amounts recorded in the year
    up to the latest one before `on` (or the latest one at all).
    """
    day = on.isoformat()
    if day in d.amounts:
        return d.amounts[day], "known"
    if d.amount is not None:
        return d.amount, "known"
    dates = list(d.amounts)  # sorted by load_deadlines
    if not dates:
        return None, "unknown" if d.payment else None
    pool = [x for x in dates if x < day] or dates
    start = _add_months(date.fromisoformat(pool[-1]), -12).isoformat()
    sample = [d.amounts[x] for x in pool if x > start]
    mean = sum(sample) / len(sample)
    return math.floor(mean * 100 + 0.5) / 100, "estimate"


def _add_months(d: date, months: int) -> date:
    total = d.year * 12 + d.month - 1 + months
    year, month = divmod(total, 12)
    month += 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def load_deadlines() -> list[Deadline]:
    if not DEADLINES_FILE.exists():
        raise FileNotFoundError(f"{DEADLINES_FILE} is missing: run `python3 scripts/init.py` to create the data folder")
    with DEADLINES_FILE.open("rb") as f:
        raw = tomllib.load(f).get("deadline", [])
    seen: set[str] = set()
    result = []
    for r in raw:
        did = r["id"]
        if did in seen:
            raise ValueError(f"duplicate id in deadlines.toml: {did}")
        seen.add(did)
        d = r.get("date")
        until = r.get("until")
        if until is not None and not isinstance(until, date):
            raise ValueError(f"{did}: until must be a date (YYYY-MM-DD)")
        result.append(
            Deadline(
                id=did,
                title=r["title"],
                area=r.get("area", "other"),
                date=d if isinstance(d, date) else None,
                repeat=r.get("repeat", "none"),
                until=until,
                severity=r.get("severity", "medium"),
                remind_days=tuple(r.get("remind_days", [])),
                **_money(did, r.get("amount"), r.get("amounts")),
                sensitive=r.get("sensitive", False),
                case=r.get("case"),
                notes=r.get("notes", ""),
                source=r.get("source", ""),
            )
        )
    for d in result:
        d.step()  # validate the repeat field right away
        if d.severity not in SEVERITIES:
            raise ValueError(f"{d.id}: invalid severity: {d.severity!r} (allowed: {', '.join(SEVERITIES)})")
    return result


def occurrences(d: Deadline, start: date, end: date) -> list[date]:
    """Dates of d within [start, end], and not after its until."""
    if d.date is None:
        return []
    if d.until is not None and d.until < end:
        end = d.until
    step = d.step()
    if step is None:
        return [d.date] if start <= d.date <= end else []
    unit, n = step
    months = n * 12 if unit == "years" else n
    found = []
    i = 0
    while True:
        o = _add_months(d.date, months * i)
        if o > end:
            break
        if o >= start:
            found.append(o)
        i += 1
    return found


def key(d: Deadline, on: date) -> str:
    return f"{d.id}@{on.isoformat()}"


def load_state() -> dict:
    if not STATE_FILE.exists():
        return {"done": {}}
    return json.loads(STATE_FILE.read_text(encoding="utf-8"))


def save_state(state: dict) -> None:
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    tmp.replace(STATE_FILE)


def agenda(today: date, back: int = 120, ahead: int = 400) -> list[dict]:
    """Occurrences in the window, with done/overdue state."""
    done = load_state()["done"]
    items = []
    for d in load_deadlines():
        for on in occurrences(d, today - timedelta(days=back), today + timedelta(days=ahead)):
            k = key(d, on)
            amount, basis = occurrence_amount(d, on)
            items.append(
                {
                    "key": k,
                    "id": d.id,
                    "title": d.title,
                    "area": d.area,
                    "date": on.isoformat(),
                    "days": (on - today).days,
                    "done_on": done.get(k),
                    "repeat": d.repeat,
                    "severity": d.severity,
                    "amount": amount,
                    "amount_basis": basis,
                    "sensitive": d.sensitive,
                    "case": d.case,
                    "notes": d.notes,
                    "source": d.source,
                }
            )
    items.sort(key=lambda i: (i["date"], i["title"]))
    return items


def incomplete() -> list[dict]:
    return [
        {"id": d.id, "title": d.title, "area": d.area, "severity": d.severity, "notes": d.notes}
        for d in load_deadlines()
        if not d.complete and d.until is None
    ]


def _jsonable(v):
    if isinstance(v, dict):
        return {k: _jsonable(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_jsonable(x) for x in v]
    if isinstance(v, date):
        return v.isoformat()
    return v


def load_profile() -> dict:
    if not PROFILE_FILE.exists():
        return {}
    with PROFILE_FILE.open("rb") as f:
        return _jsonable(tomllib.load(f))


def load_cases() -> list[dict]:
    cases = []
    for readme in sorted(CASES_DIR.glob("*/README.md"), reverse=True):
        md = readme.read_text(encoding="utf-8")
        title = next((r[2:].strip() for r in md.splitlines() if r.startswith("# ")), readme.parent.name)
        status = re.search(r"^\*\*Status:\*\*\s*(.+)$", md, re.M)
        cases.append(
            {
                "slug": readme.parent.name,
                "title": title,
                "status": status.group(1).strip() if status else "",
                "done": len(re.findall(r"^\s*- \[x\]", md, re.M | re.I)),
                "total": len(re.findall(r"^\s*- \[[ x]\]", md, re.M | re.I)),
                "md": md,
                "documents": list_documents(document_refs(md)),
            }
        )
    return cases


# Original files a case mentions (mirrors packages/core/src/documents.ts and node.ts).
NOT_DOCUMENTS = {"item.json", "content.md"}


def is_document_path(path: str) -> bool:
    parts = path.rstrip("/").split("/")
    return (
        parts[0] in ("inbox", "archive")
        and len(parts) >= 2
        and all(p and not p.startswith(".") and "\\" not in p for p in parts)
        and parts[-1] not in NOT_DOCUMENTS
    )


def document_refs(md: str) -> list[str]:
    refs = [re.sub(r"[.,;:!?]+$", "", m) for m in re.findall(r"(?<![\w/.-])((?:inbox|archive)/[^\s`'\"()<>\[\]|*]+)", md)]
    return [r for r in dict.fromkeys(refs) if is_document_path(r)]


def list_documents(refs: list[str]) -> list[str]:
    out: list[str] = []
    for ref in refs:
        path = ref.rstrip("/")
        full = DATA_DIR / path
        if full.is_file():
            out.append(path)
        elif full.is_dir():
            for f in sorted(p.name for p in full.iterdir()):
                if not f.startswith(".") and f not in NOT_DOCUMENTS and (full / f).is_file():
                    out.append(f"{path}/{f}")
    return list(dict.fromkeys(out))


def load_catalog() -> list[dict]:
    entries = []
    for f in sorted(CATALOG_DIR.glob("*.md")):
        md = f.read_text(encoding="utf-8")
        title = next((r[2:].strip() for r in md.splitlines() if r.startswith("# ")), f.stem)
        entries.append({"name": f.stem, "title": title, "md": md})
    return entries


def dump(today: date) -> dict:
    """Everything the web app shows, as JSON-ready data (used by the parity test with packages/core)."""
    return {
        "today": today.isoformat(),
        "agenda": agenda(today),
        "incomplete": incomplete(),
        "cases": load_cases(),
        "profile": load_profile(),
        "catalog": load_catalog(),
    }


if __name__ == "__main__":
    import sys

    # python3 scripts/store.py [YYYY-MM-DD]: print the data as JSON
    day = date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else today()
    print(json.dumps(dump(day), ensure_ascii=False, indent=2))
