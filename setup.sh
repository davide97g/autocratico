#!/usr/bin/env bash
# One-step setup: checks requirements, creates the data folder, builds the web app.
#
# Usage: ./setup.sh [--example] [--start]
#   --example  start from the made-up example dataset instead of an empty register
#   --start    launch the server when done (http://127.0.0.1:8790)
#
# The data folder is data/ (ignored by git) or the one in AUTOCRATICO_DATA.
# Running it again is safe: existing data is never touched.
set -euo pipefail

cd "$(dirname "$0")"

example=""
start=""
for arg in "$@"; do
  case "$arg" in
    --example) example="--example" ;;
    --start) start=1 ;;
    *) printf 'unknown option: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

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

command -v node >/dev/null || fail "node not found: install Node.js 24 or later (https://nodejs.org)"
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' ||
  fail "Node.js $(node -v) found, 24 or later needed (the server runs TypeScript directly)"
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
  python3 scripts/init.py $example >/dev/null
  if [ -n "$example" ]; then ok "created $data_dir from the example dataset"; else ok "created $data_dir (empty register)"; fi
fi

bold "Building the web app"
log="$(mktemp)"
if ! (pnpm install --frozen-lockfile && pnpm --filter @autocratico/web build) >"$log" 2>&1; then
  cat "$log" >&2
  fail "build failed (output above)"
fi
rm -f "$log"
ok "apps/web/dist ready"

echo
bold "Done."
echo "  Start:     pnpm start                    → http://127.0.0.1:8790"
echo "  Dev mode:  pnpm dev                      → http://localhost:5173"
echo "  Agent:     AUTOCRATICO_JOBS=on pnpm start  (Gmail sync, filing what arrives, reminders, backups)"
echo "  Online (any server with Docker, other devices): docs/self-hosting.md"
echo "  Make it yours (another country, sources, notifications): CUSTOMIZE.md"
echo "  First open: the onboarding sets your name and masterpass, then your profile and documents."

if [ -n "$start" ]; then
  echo
  exec node apps/server/src/main.ts
fi
