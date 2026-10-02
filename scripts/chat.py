"""Web app chat: forwards a question to Claude Code (`claude -p`) and translates its stream.

Each conversation is its own Claude Code session: the first question starts a new one,
follow-ups resume it with `--resume`. Claude works read-only on the project folder and
loads only project settings (no personal hooks).
"""

import json
import os
import re
import shutil
import subprocess
from collections.abc import Iterator
from datetime import date
from pathlib import Path

from store import DATA_DIR, ROOT

TOOLS = [
    "Read",
    "Glob",
    "Grep",
    "WebSearch",
    "WebFetch",
    "Bash(python3 scripts/upcoming.py:*)",
]
# `//` marks an absolute path in Claude Code permission rules.
DENIED = ["Edit", "Write", "NotebookEdit", f"Read(/{DATA_DIR}/secrets/**)", f"Grep(/{DATA_DIR}/secrets/**)"]
LANGUAGES = {"it": "Italian", "en": "English"}

INSTRUCTIONS = """You are answering from the side chat of the autocratico web app, the user's personal register of Italian bureaucracy.
- Be direct and brief; use simple Markdown (lists, bold, small tables).
- Read the data files (deadlines.toml, state.json, profile.toml, cases/, catalog/, notes/) before answering about facts and dates.
- Wrap every piece of personal data in ||...|| (amounts, birth dates, addresses, document numbers): the web app hides them in privacy mode.
- To read, use Read, Glob and Grep; the only command you may run is `python3 scripts/upcoming.py [days]`, on its own, without pipes or other commands.
- You are read-only: do not modify files. If a change is needed, say which file and what to change.
- Tell what is verified apart from what is inferred. Never send personal data to web searches."""

_ID = re.compile(r"^[0-9a-f-]{36}$")


def _claude() -> str | None:
    return shutil.which("claude") or next(
        (str(p) for p in [Path.home() / ".local/bin/claude"] if p.is_file()), None
    )


def _detail(name: str, args: dict) -> str:
    for field in ("file_path", "pattern", "command", "query", "url", "path"):
        if isinstance(args.get(field), str):
            value = args[field]
            if field == "file_path":
                for base in (DATA_DIR, ROOT):
                    value = value.removeprefix(f"{base}/")
            return value
    return ""


def converse(message: str, session: str | None, view: str | None, locale: str | None) -> Iterator[dict]:
    """Run one question and yield simple events for the web app.

    Events: session {id} · text {text} · block · tool {name, detail} ·
    end {cost, duration_ms} · error {message}.
    """
    executable = _claude()
    if not executable:
        yield {"type": "error", "message": "`claude` command not found in PATH."}
        return
    language = LANGUAGES.get(locale or "", "English")
    context = f"\nToday is {date.today().isoformat()}. The data is in {DATA_DIR}. Always answer in {language}."
    if view:
        context += f" The user is looking at the «{view}» section of the web app."
    command = [
        executable,
        "-p",
        "--output-format", "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--setting-sources", "project,local",
        "--permission-mode", "dontAsk",
        "--allowedTools", *TOOLS,
        "--disallowedTools", *DENIED,
        "--append-system-prompt", INSTRUCTIONS + context,
    ]
    if not DATA_DIR.is_relative_to(ROOT):
        command += ["--add-dir", str(DATA_DIR)]
    if session and _ID.match(session):
        command += ["--resume", session]

    process = subprocess.Popen(
        command,
        cwd=ROOT,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env={**os.environ, "CLAUDE_CODE_ENTRYPOINT": "autocratico-webapp"},
    )
    try:
        process.stdin.write(message)
        process.stdin.close()
        finished = False
        for line in process.stdout:
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            kind = e.get("type")
            if kind == "system" and e.get("subtype") == "init":
                yield {"type": "session", "id": e.get("session_id")}
            elif kind == "stream_event" and e.get("parent_tool_use_id") is None:
                ev = e.get("event", {})
                if ev.get("type") == "content_block_start" and ev.get("content_block", {}).get("type") == "text":
                    yield {"type": "block"}
                elif ev.get("type") == "content_block_delta" and ev.get("delta", {}).get("type") == "text_delta":
                    yield {"type": "text", "text": ev["delta"]["text"]}
            elif kind == "assistant" and e.get("parent_tool_use_id") is None:
                for c in e.get("message", {}).get("content", []):
                    if c.get("type") == "tool_use":
                        name = c.get("name", "")
                        yield {"type": "tool", "name": name, "detail": _detail(name, c.get("input") or {})}
            elif kind == "result":
                finished = True
                if e.get("is_error"):
                    yield {"type": "error", "message": str(e.get("result") or e.get("subtype") or "error")}
                yield {"type": "end", "cost": e.get("total_cost_usd"), "duration_ms": e.get("duration_ms")}
        process.wait()
        if not finished:
            stderr = (process.stderr.read() or "").strip().splitlines()
            yield {"type": "error", "message": stderr[-1] if stderr else f"claude exited with code {process.returncode}"}
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
