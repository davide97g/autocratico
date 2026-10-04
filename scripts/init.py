"""Create the data folder, unless it already exists: an empty register, or the made-up example.

Usage: python3 scripts/init.py [--example]
The folder is `data/` (ignored by git) or the one set in AUTOCRATICO_DATA. The web app's
onboarding fills in the empty register; --example copies example/ to try the app first.
"""

import shutil
import sys

from store import DATA_DIR, ROOT


def main() -> None:
    example = "--example" in sys.argv[1:]
    if DATA_DIR.exists() and any(DATA_DIR.iterdir()):
        print(f"{DATA_DIR} already exists: leaving it untouched.")
        sys.exit(1)
    source = ROOT / ("example" if example else "template")
    shutil.copytree(source, DATA_DIR, dirs_exist_ok=True, ignore=shutil.ignore_patterns(".gitkeep"))
    for folder in ("cases", "catalog", "inbox", "archive"):
        (DATA_DIR / folder).mkdir(exist_ok=True)
    (DATA_DIR / "secrets").mkdir(mode=0o700, exist_ok=True)
    if example:
        print(f"Created {DATA_DIR} with example data. Replace it with your own (or ask Claude to).")
    else:
        print(f"Created {DATA_DIR}: open the web app to set it up.")


if __name__ == "__main__":
    main()
