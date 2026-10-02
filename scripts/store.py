"""Data loading for autocratico: deadlines, state, profile, cases, catalog."""

from __future__ import annotations

import calendar
import json
import os
import re
import tomllib
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Personal data lives outside the code: `data/` (ignored by git) or the folder in AUTOCRATICO_DATA.
DATA_DIR = Path(os.environ.get("AUTOCRATICO_DATA") or ROOT / "data").expanduser().resolve()
DEADLINES_FILE = DATA_DIR / "deadlines.toml"
PROFILE_FILE = DATA_DIR / "profile.toml"
STATE_FILE = DATA_DIR / "state.json"
CASES_DIR = DATA_DIR / "cases"
CATALOG_DIR = DATA_DIR / "catalog"
SEVERITIES = ("high", "medium", "low")


@dataclass
class Deadline:
    id: str
    title: str
    area: str
    date: date | None
    repeat: str = "none"
    severity: str = "medium"
    remind_days: tuple[int, ...] = ()
    amount: float | None = None
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
        result.append(
            Deadline(
                id=did,
                title=r["title"],
                area=r.get("area", "other"),
                date=d if isinstance(d, date) else None,
                repeat=r.get("repeat", "none"),
                severity=r.get("severity", "medium"),
                remind_days=tuple(r.get("remind_days", [])),
                amount=r.get("amount"),
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
    """Dates of d within [start, end]."""
    if d.date is None:
        return []
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
                    "amount": d.amount,
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
        if not d.complete
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
            }
        )
    return cases


def load_catalog() -> list[dict]:
    entries = []
    for f in sorted(CATALOG_DIR.glob("*.md")):
        md = f.read_text(encoding="utf-8")
        title = next((r[2:].strip() for r in md.splitlines() if r.startswith("# ")), f.stem)
        entries.append({"name": f.stem, "title": title, "md": md})
    return entries
