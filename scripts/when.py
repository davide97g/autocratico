"""Current date and time, and date arithmetic, in the deadlines' time zone (Europe/Rome by default).

Usage: python3 scripts/when.py [WHEN ...]

Without arguments: the current local date and time. Each WHEN is resolved from now:
  +90m  +2h  +3d  +2w  -1d        relative (minutes, hours, days, weeks)
  2026-10-16   2026-10-16 09:00   a date or date-time
  tomorrow 09:00   domani 9:30    oggi / today / dopodomani, optional time
  monday 09:00   lunedì           next such weekday (Italian or English), optional time
  17:00                           today at that time (tomorrow if already past)
For each: the local date-time, weekday, ISO with offset, and the distance from now.
Used by the chat agent to compute reminder times and days left; read-only.
"""

from __future__ import annotations

import os
import re
import sys
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

ZONE = ZoneInfo(os.environ.get("TZ_DEADLINES") or "Europe/Rome")
WEEKDAYS = {
    "monday": 0, "lunedi": 0, "lunedì": 0,
    "tuesday": 1, "martedi": 1, "martedì": 1,
    "wednesday": 2, "mercoledi": 2, "mercoledì": 2,
    "thursday": 3, "giovedi": 3, "giovedì": 3,
    "friday": 4, "venerdi": 4, "venerdì": 4,
    "saturday": 5, "sabato": 5,
    "sunday": 6, "domenica": 6,
}
DAYS = {"today": 0, "oggi": 0, "tomorrow": 1, "domani": 1, "dopodomani": 2}
UNITS = {"m": "minutes", "min": "minutes", "h": "hours", "d": "days", "g": "days", "w": "weeks"}
NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def now() -> datetime:
    # WHEN_NOW (ISO) fixes the clock, for tests.
    fixed = os.environ.get("WHEN_NOW")
    return datetime.fromisoformat(fixed).astimezone(ZONE) if fixed else datetime.now(ZONE)


def _time(text: str | None, default: time) -> time:
    if not text:
        return default
    m = re.fullmatch(r"(\d{1,2})[:.](\d{2})", text)
    if not m or int(m.group(1)) > 23 or int(m.group(2)) > 59:
        raise ValueError(f"invalid time: {text}")
    return time(int(m.group(1)), int(m.group(2)))


def _local(d: date, t: time) -> datetime:
    return datetime.combine(d, t, ZONE)


def resolve(expr: str, base: datetime) -> tuple[datetime, bool]:
    """Datetime for expr, and whether it carries a time of day."""
    e = expr.strip().lower()
    m = re.fullmatch(r"([+-])\s*(\d+)\s*(m|min|h|d|g|w)", e)
    if m:
        n = int(m.group(2)) * (-1 if m.group(1) == "-" else 1)
        delta = timedelta(**{UNITS[m.group(3)]: n})
        # Add wall-clock days/weeks in local time (DST-safe); minutes/hours as elapsed time.
        if m.group(3) in ("d", "g", "w"):
            return (base.replace(tzinfo=None) + delta).replace(tzinfo=ZONE), True
        return (base + delta).astimezone(ZONE), True
    m = re.fullmatch(r"(\d{4}-\d{2}-\d{2})(?:[ t](\d{1,2}[:.]\d{2}))?", e)
    if m:
        return _local(date.fromisoformat(m.group(1)), _time(m.group(2), time(0))), bool(m.group(2))
    m = re.fullmatch(r"(\w+)(?:\s+(?:alle\s+|at\s+)?(\d{1,2}[:.]\d{2}))?", e)
    if m and m.group(1) in DAYS:
        d = base.date() + timedelta(days=DAYS[m.group(1)])
        return _local(d, _time(m.group(2), time(9))), True
    if m and m.group(1) in WEEKDAYS:
        ahead = (WEEKDAYS[m.group(1)] - base.weekday()) % 7 or 7
        return _local(base.date() + timedelta(days=ahead), _time(m.group(2), time(9))), True
    m = re.fullmatch(r"(\d{1,2}[:.]\d{2})", e)
    if m:
        target = _local(base.date(), _time(m.group(1), time(0)))
        return (target if target > base else target + timedelta(days=1)), True
    raise ValueError(f"cannot read {expr!r}: use +90m, +2h, +3d, YYYY-MM-DD [HH:MM], tomorrow 09:00, monday 09:00, 17:00")


def _distance(target: datetime, base: datetime, with_time: bool) -> str:
    if not with_time:
        days = (target.date() - base.date()).days
        return "today" if days == 0 else f"in {days} days" if days > 0 else f"{-days} days ago"
    minutes = round((target - base).total_seconds() / 60)
    sign = "in " if minutes >= 0 else ""
    h, m = divmod(abs(minutes), 60)
    d, h = divmod(h, 24)
    parts = [f"{d} d"] * bool(d) + [f"{h} h"] * bool(h) + [f"{m} min"] * (bool(m) or not (d or h))
    return f"{sign}{' '.join(parts)}" + ("" if minutes >= 0 else " ago")


def describe(dt: datetime, with_time: bool = True) -> str:
    offset = dt.strftime("%z")
    offset = f"UTC{offset[:3]}:{offset[3:]}"
    stamp = dt.strftime("%Y-%m-%d %H:%M") if with_time else dt.strftime("%Y-%m-%d")
    return f"{stamp} {NAMES[dt.weekday()]} ({ZONE.key}, {offset}) · iso {dt.isoformat(timespec='seconds')}"


def main() -> None:
    base = now()
    print(f"now: {describe(base)}")
    # Words belong together ("tomorrow 09:00"): join the arguments, split on commas.
    for expr in [x for x in " ".join(sys.argv[1:]).split(",") if x.strip()]:
        try:
            target, with_time = resolve(expr, base)
        except ValueError as e:
            print(f"error: {e}", file=sys.stderr)
            sys.exit(2)
        print(f"{expr.strip()}: {describe(target, with_time)} · {_distance(target, base, with_time)}")


if __name__ == "__main__":
    main()
