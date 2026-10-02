"""Local web app for autocratico.

Usage: python3 scripts/serve.py [port]   (default 8765, listens on 127.0.0.1 only)
"""

import json
import sys
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from chat import converse
from store import (
    ROOT,
    agenda,
    incomplete,
    load_catalog,
    load_cases,
    load_profile,
    load_state,
    save_state,
)

WEB = ROOT / "app" / "dist"
TYPES = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".png": "image/png",
    ".ico": "image/x-icon",
}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes, kind: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", f"{kind}; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, payload) -> None:
        self._send(code, json.dumps(payload, ensure_ascii=False).encode("utf-8"), "application/json")

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        if path == "/api/data":
            try:
                today = date.today()
                self._json(
                    200,
                    {
                        "today": today.isoformat(),
                        "agenda": agenda(today),
                        "incomplete": incomplete(),
                        "cases": load_cases(),
                        "profile": load_profile(),
                        "catalog": load_catalog(),
                    },
                )
            except Exception as e:  # malformed TOML file: show it in the page
                self._json(500, {"error": f"{type(e).__name__}: {e}"})
            return
        if not WEB.is_dir():
            self._send(503, b"UI not built: run `pnpm build` in app/", "text/plain")
            return
        name = "index.html" if path == "/" else path.lstrip("/")
        file = (WEB / name).resolve()
        if not file.is_relative_to(WEB) or not file.is_file():
            file = WEB / "index.html"  # SPA: unknown routes fall back to the app
        self._send(200, file.read_bytes(), TYPES.get(file.suffix, "application/octet-stream"))

    def do_POST(self) -> None:
        if self.path not in ("/api/done", "/api/chat"):
            self._send(404, b"not found", "text/plain")
            return
        length = int(self.headers.get("Content-Length", 0))
        request = json.loads(self.rfile.read(length) or b"{}")
        if self.path == "/api/chat":
            self._chat(request)
            return
        k = request.get("key")
        if not isinstance(k, str) or "@" not in k:
            self._json(400, {"error": "missing key"})
            return
        state = load_state()
        if request.get("done"):
            state["done"][k] = date.today().isoformat()
        else:
            state["done"].pop(k, None)
        save_state(state)
        self._json(200, {"key": k, "done_on": state["done"].get(k)})

    def _chat(self, request: dict) -> None:
        message = request.get("message")
        if not isinstance(message, str) or not message.strip():
            self._json(400, {"error": "empty message"})
            return
        # One JSON line per event; the connection closes when the answer ends.
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()
        self.close_connection = True
        events = converse(message.strip(), request.get("session"), request.get("view"), request.get("locale"))
        try:
            for event in events:
                self.wfile.write(json.dumps(event, ensure_ascii=False).encode("utf-8") + b"\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass  # the web app aborted: closing the generator stops claude
        finally:
            events.close()

    def log_message(self, format, *args) -> None:
        pass


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"autocratico on http://127.0.0.1:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
