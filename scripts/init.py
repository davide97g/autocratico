"""Create the data folder by copying the example (made-up data), unless it already exists.

Usage: python3 scripts/init.py
The folder is `data/` (ignored by git) or the one set in AUTOCRATICO_DATA.
"""

import shutil
import sys

from store import DATA_DIR, ROOT


def main() -> None:
    if DATA_DIR.exists() and any(DATA_DIR.iterdir()):
        print(f"{DATA_DIR} already exists: leaving it untouched.")
        sys.exit(1)
    shutil.copytree(ROOT / "example", DATA_DIR, dirs_exist_ok=True)
    (DATA_DIR / "secrets").mkdir(mode=0o700, exist_ok=True)
    print(f"Created {DATA_DIR} with example data. Replace it with your own (or ask Claude to).")


if __name__ == "__main__":
    main()
