"""Catch the local Keycloak's mails (development only, docs/keycloak.md).

A plain SMTP server on 127.0.0.1:1025 that delivers nothing: every message is
kept in .runtime/mail/ and shown on http://127.0.0.1:8025 (newest first, the
HTML as the recipient sees it), so sign-up verification, password resets and
the mail theme can be tried without a mail provider.

    python scripts/dev_mail.py [--smtp-port 1025] [--http-port 8025]

Render the dev realm with ``KC_SMTP_HOST=127.0.0.1 KC_SMTP_PORT=1025``.
Standard library only; never run it anywhere but a developer's machine.
"""

from __future__ import annotations

import argparse
import asyncio
import html
import sys
import threading
from datetime import datetime
from email import message_from_bytes, policy
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STORE = ROOT / ".runtime" / "mail"
MAX_MESSAGE = 10 * 1024 * 1024


class MailStore:
    """The caught messages, in memory and as .eml files."""

    def __init__(self, directory: Path | None = None) -> None:
        self.directory = directory
        self.messages: list[tuple[str, EmailMessage]] = []
        self.lock = threading.Lock()
        if directory:
            directory.mkdir(parents=True, exist_ok=True)

    def add(self, raw: bytes) -> str:
        message = message_from_bytes(raw, policy=policy.default)
        with self.lock:
            key = f"{datetime.now():%Y%m%d-%H%M%S}-{len(self.messages) + 1}"
            self.messages.append((key, message))
        if self.directory:
            (self.directory / f"{key}.eml").write_bytes(raw)
        return key

    def get(self, key: str) -> EmailMessage | None:
        with self.lock:
            return next((message for k, message in self.messages if k == key), None)

    def newest_first(self) -> list[tuple[str, EmailMessage]]:
        with self.lock:
            return list(reversed(self.messages))


async def handle_smtp(store: MailStore, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    """Just enough SMTP for Keycloak (Jakarta Mail): no TLS, no authentication."""

    async def reply(line: str) -> None:
        writer.write(f"{line}\r\n".encode("ascii"))
        await writer.drain()

    await reply("220 dev-mail ESMTP")
    try:
        while line := await reader.readline():
            command = line.decode("utf-8", "replace").strip().upper()
            if command.startswith("EHLO"):
                await reply("250-dev-mail")
                await reply("250-8BITMIME")
                await reply(f"250 SIZE {MAX_MESSAGE}")
            elif command.startswith(("HELO", "MAIL", "RCPT", "RSET", "NOOP")):
                await reply("250 OK")
            elif command == "DATA":
                await reply("354 end with <CRLF>.<CRLF>")
                lines: list[bytes] = []
                while (data := await reader.readline()) and data not in (b".\r\n", b".\n"):
                    lines.append(data[1:] if data.startswith(b"..") else data)
                key = store.add(b"".join(lines))
                await reply("250 OK")
                caught = store.get(key)
                print(f"mail {key}: {caught['subject']!s} → {caught['to']!s}", flush=True)
            elif command == "QUIT":
                await reply("221 bye")
                break
            else:
                await reply("502 not implemented")
    finally:
        writer.close()


def _body(message: EmailMessage) -> tuple[str, str]:
    part = message.get_body(preferencelist=("html", "plain"))
    if part is None:
        return "text/plain", ""
    return part.get_content_type(), part.get_content()


def viewer(store: MailStore) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args) -> None:  # quiet
            pass

        def send(self, body: str, content_type: str = "text/html; charset=utf-8", status: int = 200) -> None:
            data = body.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self) -> None:
            if self.path.startswith("/m/"):
                message = store.get(self.path[3:])
                if message is None:
                    return self.send("not found", "text/plain; charset=utf-8", 404)
                content_type, body = _body(message)
                return self.send(body, f"{content_type}; charset=utf-8")
            rows = "".join(
                f'<li><a href="/m/{key}"><b>{html.escape(str(message["subject"]))}</b></a>'
                f' <span>{html.escape(str(message["to"]))} · {key}</span></li>'
                for key, message in store.newest_first()
            )
            self.send(
                "<!doctype html><meta charset=utf-8><title>dev mail</title>"
                "<meta http-equiv=refresh content=5>"
                "<style>body{font:15px system-ui;margin:24px;max-width:760px}li{margin:8px 0}span{color:#777}</style>"
                f"<h1>Caught mail (SMTP 127.0.0.1)</h1><ul>{rows or '<li>none yet</li>'}</ul>"
            )

    return Handler


async def serve(smtp_port: int, http_port: int, store: MailStore) -> None:
    http = ThreadingHTTPServer(("127.0.0.1", http_port), viewer(store))
    threading.Thread(target=http.serve_forever, daemon=True).start()
    server = await asyncio.start_server(lambda r, w: handle_smtp(store, r, w), "127.0.0.1", smtp_port)
    print(f"dev mail: SMTP 127.0.0.1:{smtp_port} · http://127.0.0.1:{http_port} · {store.directory}", flush=True)
    async with server:
        await server.serve_forever()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--smtp-port", type=int, default=1025)
    parser.add_argument("--http-port", type=int, default=8025)
    args = parser.parse_args(argv)
    # Subjects are Arabic first: a Windows console (cp1252) cannot encode them.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    try:
        asyncio.run(serve(args.smtp_port, args.http_port, MailStore(STORE)))
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
