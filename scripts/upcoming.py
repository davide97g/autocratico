"""List deadlines in the next N days (default 60) and those still missing a date.

Usage: python3 scripts/upcoming.py [days]
"""

import sys
from datetime import date

from store import agenda, incomplete


def main() -> None:
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    today = date.today()
    items = [i for i in agenda(today, back=120, ahead=days) if not i["done_on"]]

    overdue = [i for i in items if i["days"] < 0]
    upcoming = [i for i in items if i["days"] >= 0]

    if overdue:
        print("OVERDUE, not marked as done")
        for i in overdue:
            print(f"  {i['date']}  {-i['days']:>4} d ago   {i['title']}  [{i['area']}]")
        print()

    print(f"NEXT {days} DAYS")
    if not upcoming:
        print("  nothing")
    for i in upcoming:
        d = date.fromisoformat(i["date"])
        print(f"  {i['date']} {d:%a}  in {i['days']:>3} d   {i['title']}  [{i['area']}]")

    missing = incomplete()
    if missing:
        print()
        print("TO COMPLETE (date missing in deadlines.toml)")
        for m in missing:
            print(f"  {m['id']:<24} {m['title']}")


if __name__ == "__main__":
    main()
