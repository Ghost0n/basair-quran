"""scripts/dev_mail.py: the local mail catcher keeps what Keycloak sends."""

import asyncio
import smtplib
import threading
import urllib.request
from email.message import EmailMessage
from http.server import ThreadingHTTPServer

from scripts import dev_mail


def test_the_catcher_keeps_and_shows_a_mail(tmp_path):
    store = dev_mail.MailStore(tmp_path)
    loop = asyncio.new_event_loop()
    server = loop.run_until_complete(
        asyncio.start_server(lambda r, w: dev_mail.handle_smtp(store, r, w), "127.0.0.1", 0)
    )
    smtp_port = server.sockets[0].getsockname()[1]
    threading.Thread(target=loop.run_forever, daemon=True).start()
    http = ThreadingHTTPServer(("127.0.0.1", 0), dev_mail.viewer(store))
    threading.Thread(target=http.serve_forever, daemon=True).start()
    try:
        message = EmailMessage()
        message["From"], message["To"], message["Subject"] = "no-reply@localhost", "member@basair.test", "تأكيد البريد"
        message.set_content("plain")
        message.add_alternative('<p dir="rtl">.اضغط <a href="http://x/verify">هنا</a></p>', subtype="html")
        with smtplib.SMTP("127.0.0.1", smtp_port, timeout=5) as client:
            client.send_message(message)

        [(key, caught)] = store.newest_first()
        assert caught["subject"] == "تأكيد البريد" and (tmp_path / f"{key}.eml").exists()
        base = f"http://127.0.0.1:{http.server_address[1]}"
        assert "تأكيد البريد" in urllib.request.urlopen(base + "/").read().decode("utf-8")
        page = urllib.request.urlopen(f"{base}/m/{key}").read().decode("utf-8")
        assert 'href="http://x/verify"' in page and page.startswith('<p dir="rtl">.اضغط')
    finally:
        http.shutdown()
        loop.call_soon_threadsafe(server.close)
        loop.call_soon_threadsafe(loop.stop)
