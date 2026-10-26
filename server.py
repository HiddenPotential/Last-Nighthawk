#!/usr/bin/env python3
"""Serve Drift, plus a tiny shared store for the quotes people send up on lanterns.

    python3 server.py [port]

Everyone who opens the game from this server reads the same quotes. They are kept in
quotes.json next to this file, so they survive restarts.

  GET  /api/quotes          -> {"quotes": [{"id", "text", "t"}, ...]}  (newest last)
  POST /api/quotes {"text"} -> {"quote": {...}}
"""
import json
import os
import sys
import threading
import time
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.join(ROOT, "quotes.json")
MAX_LEN = 160  # characters per quote
MAX_QUOTES = 500  # oldest are dropped past this
MIN_GAP = 4.0  # seconds between quotes from one address

lock = threading.Lock()
last_post = {}


def load():
    try:
        with open(STORE, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (OSError, ValueError):
        return []


def save(quotes):
    tmp = STORE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(quotes, f, ensure_ascii=False, indent=1)
    os.replace(tmp, STORE)  # never leave a half-written file behind


quotes = load()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/quotes":
            with lock:
                self.send_json(200, {"quotes": quotes})
            return
        if self.path.split("?")[0].rsplit("/", 1)[-1] in ("quotes.json", "quotes.json.tmp", "server.py"):
            self.send_error(404)
            return
        super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/quotes":
            self.send_error(404)
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n > 4096:
                raise ValueError
            text = json.loads(self.rfile.read(n) or b"{}").get("text", "")
            if not isinstance(text, str):
                raise ValueError
        except ValueError:
            self.send_json(400, {"error": "bad request"})
            return
        text = " ".join(text.split())[:MAX_LEN]  # one line, trimmed
        if not text:
            self.send_json(400, {"error": "empty"})
            return
        ip, now = self.client_address[0], time.time()
        with lock:
            if now - last_post.get(ip, 0) < MIN_GAP:
                self.send_json(429, {"error": "slow down"})
                return
            last_post[ip] = now
            q = {"id": uuid.uuid4().hex[:12], "text": text, "t": int(now * 1000)}
            quotes.append(q)
            del quotes[:-MAX_QUOTES]
            save(quotes)
        self.send_json(201, {"quote": q})

    def log_message(self, fmt, *args):
        # only log quote traffic, not every file the page loads
        if "/api/" in getattr(self, "path", ""):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5517
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Drift on http://localhost:{port}  ({len(quotes)} lantern quotes)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
