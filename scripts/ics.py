"""Generate out/autocratico.ics from deadlines.toml.

Usage: python3 scripts/ics.py
Import the file into a dedicated calendar. To update: delete that calendar and import again.
"""

from datetime import datetime, timedelta, timezone

from store import DATA_DIR, load_deadlines

OUTPUT = DATA_DIR / "out" / "autocratico.ics"


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
        lines += [
            "BEGIN:VEVENT",
            f"UID:{d.id}@autocratico",
            f"DTSTAMP:{now}",
            f"DTSTART;VALUE=DATE:{d.date:%Y%m%d}",
            f"DTEND;VALUE=DATE:{d.date + timedelta(days=1):%Y%m%d}",
            f"SUMMARY:{_text(d.title)}",
            f"CATEGORIES:{_text(d.area)}",
            "TRANSP:TRANSPARENT",
        ]
        if description:
            lines.append(f"DESCRIPTION:{_text(description)}")
        step = d.step()
        if step:
            unit, n = step
            freq = "YEARLY" if unit == "years" else "MONTHLY"
            lines.append(f"RRULE:FREQ={freq};INTERVAL={n}")
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
        events += 1
    lines.append("END:VCALENDAR")

    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text("\r\n".join(_fold(r) for r in lines) + "\r\n", encoding="utf-8", newline="")
    print(f"{OUTPUT}: {events} events")
    if skipped:
        print(f"skipped (date TODO): {', '.join(skipped)}")


if __name__ == "__main__":
    main()
