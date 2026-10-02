#!/usr/bin/env bash
# One-step setup: checks requirements, creates the data folder, builds the web app.
#
# Usage: ./setup.sh [--start]
#   --start   launch the web app when done (http://127.0.0.1:8765)
#
# The data folder is data/ (ignored by git) or the one in AUTOCRATICO_DATA.
# Running it again is safe: existing data is never touched.
set -euo pipefail

cd "$(dirname "$0")"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
fail() {
  printf '  \033[31m✗\033[0m %s\n' "$*" >&2
  exit 1
}

bold "Checking requirements"

command -v python3 >/dev/null || fail "python3 not found: install Python 3.11 or later"
python3 -c 'import sys; sys.exit(sys.version_info < (3, 11))' ||
  fail "Python $(python3 -c 'import platform; print(platform.python_version())') found, 3.11 or later needed"
ok "Python $(python3 -c 'import platform; print(platform.python_version())')"

command -v node >/dev/null || fail "node not found: install Node.js 20.19 or later (https://nodejs.org)"
node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 20 || (a === 20 && b >= 19) ? 0 : 1)' ||
  fail "Node.js $(node -v) found, 20.19 or later needed"
ok "Node.js $(node -v)"

command -v pnpm >/dev/null || fail "pnpm not found: install it with \`npm install -g pnpm\` (https://pnpm.io/installation)"
ok "pnpm $(pnpm -v)"

if command -v claude >/dev/null || [ -x "$HOME/.local/bin/claude" ]; then
  ok "Claude Code found (chat enabled)"
else
  warn "Claude Code not found: the app works, the chat panel does not (https://claude.com/claude-code)"
fi

bold "Data folder"
data_dir="$(cd scripts && python3 -c 'from store import DATA_DIR; print(DATA_DIR)')"
if [ -d "$data_dir" ] && [ -n "$(ls -A "$data_dir" 2>/dev/null)" ]; then
  ok "$data_dir already exists, left untouched"
else
  python3 scripts/init.py >/dev/null
  ok "created $data_dir from the example dataset"
fi

bold "Building the web app"
log="$(mktemp)"
if ! (cd app && pnpm install --frozen-lockfile && pnpm build) >"$log" 2>&1; then
  cat "$log" >&2
  fail "build failed (output above)"
fi
rm -f "$log"
ok "app/dist ready"

echo
bold "Done."
echo "  Start:     python3 scripts/serve.py      → http://127.0.0.1:8765"
echo "  Dev mode:  cd app && pnpm dev            → http://localhost:5173"
echo "  Then replace the example data with yours, or ask Claude Code to do it."

if [ "${1:-}" = "--start" ]; then
  echo
  exec python3 scripts/serve.py
fi
