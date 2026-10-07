"""Generate out/autocratico.ics from deadlines.toml.

Usage: python3 scripts/ics.py
Import the file into a dedicated calendar. To update: delete that calendar and import again.
"""

from datetime import datetime, timedelta, timezone

from store import DATA_DIR, load_deadlines, occurrences, today

OUTPUT = DATA_DIR / "out" / "autocratico.ics"
# Deadlines moved off weekends and holidays (`shift`) cannot be one RRULE: one event per occurrence, this far ahead.
SHIFT_YEARS = 5


def _text(s: str) -> str:
    return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line: str) -> str:
    """Fold lines longer than 75 octets, as per RFC 5545."""
    out, current = [], b""
    for ch in line:
        b = ch.encode("utf-8")
        if len(current) + len(b) > 75:
            out.append(current.decode("utf-8"))
            current = b" " + b
        else:
            current += b
    out.append(current.decode("utf-8"))
    return "\r\n".join(out)


def _event(d, uid: str, on, description: str, rule: str | None, now: str) -> list[str]:
    lines = [
        "BEGIN:VEVENT",
        f"UID:{uid}@autocratico",
        f"DTSTAMP:{now}",
        f"DTSTART;VALUE=DATE:{on:%Y%m%d}",
        f"DTEND;VALUE=DATE:{on + timedelta(days=1):%Y%m%d}",
        f"SUMMARY:{_text(d.title)}",
        f"CATEGORIES:{_text(d.area)}",
        "TRANSP:TRANSPARENT",
    ]
    if description:
        lines.append(f"DESCRIPTION:{_text(description)}")
    if rule:
        lines.append(rule)
    for days in d.remind_days:
        # All-day event: remind at 9:00, `days` days before.
        lines += [
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            f"DESCRIPTION:{_text(d.title)}",
            f"TRIGGER:-P{days - 1}DT15H" if days > 0 else "TRIGGER:PT9H",
            "END:VALARM",
        ]
    lines.append("END:VEVENT")
    return lines


def main() -> None:
    now = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//autocratico//deadlines//EN",
        "CALSCALE:GREGORIAN",
        "X-WR-CALNAME:Autocratico",
    ]
    skipped = []
    events = 0
    for d in load_deadlines():
        if d.date is None:
            skipped.append(d.id)
            continue
        description = "\n".join(x for x in (d.notes, d.source) if x)
        step = d.step()
        if d.shift != "none":
            start = today() - timedelta(days=366)
            dates = [on for on, _ in occurrences(d, start, start + timedelta(days=366 * (SHIFT_YEARS + 1)))]
            for on in dates:
                lines += _event(d, f"{d.id}-{on:%Y%m%d}", on, description, None, now)
            events += len(dates)
            continue
        rule = None
        if step:
            unit, n = step
            rule = f"RRULE:FREQ={'YEARLY' if unit == 'years' else 'MONTHLY'};INTERVAL={n}"
        lines += _event(d, d.id, d.date, description, rule, now)
        events += 1
    lines.append("END:VCALENDAR")

    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text("\r\n".join(_fold(r) for r in lines) + "\r\n", encoding="utf-8", newline="")
    print(f"{OUTPUT}: {events} events")
    if skipped:
        print(f"skipped (date TODO): {', '.join(skipped)}")


if __name__ == "__main__":
    main()
