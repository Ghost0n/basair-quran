"""Password-reset email delivery (services/mail_service.py)."""

from test_auth import build_auth_client

from src.app.services import mail_service


def _smtp_env(monkeypatch):
    monkeypatch.setenv("QBASAIR_SMTP_HOST", "smtp.example.org")
    monkeypatch.setenv("QBASAIR_SMTP_USER", "mailer@example.org")
    monkeypatch.setenv("QBASAIR_SMTP_PASSWORD", "secret")
    monkeypatch.setenv("QBASAIR_PUBLIC_URL", "https://basair.example.org/")


def test_without_smtp_nothing_is_sent_and_the_token_is_never_logged(monkeypatch, caplog):
    monkeypatch.delenv("QBASAIR_SMTP_HOST", raising=False)
    sent = []
    monkeypatch.setattr(mail_service, "transport", lambda settings, message: sent.append(message))
    with caplog.at_level("DEBUG", logger="q_basair.mail"):
        assert mail_service.send_password_reset("a@example.org", "tok123") is False
    assert sent == []
    assert "no SMTP configured" in caplog.text
    assert "tok123" not in caplog.text


def test_with_smtp_an_arabic_reset_email_with_link_is_sent(monkeypatch):
    _smtp_env(monkeypatch)
    sent = []
    monkeypatch.setattr(mail_service, "transport", lambda settings, message: sent.append((settings, message)))

    assert mail_service.send_password_reset("a@example.org", "tok 123") is True
    settings, message = sent[0]
    assert settings.host == "smtp.example.org" and settings.port == 587 and settings.security == "starttls"
    assert message["To"] == "a@example.org"
    assert message["From"] == "mailer@example.org"
    assert "كلمة المرور" in message["Subject"]
    text = message.get_body(("plain",)).get_content()
    assert "https://basair.example.org/login?reset=tok%20123" in text
    assert "tok 123" in text
    assert 'dir="rtl"' in message.get_body(("html",)).get_content()


def test_delivery_failure_is_swallowed(monkeypatch):
    _smtp_env(monkeypatch)

    def boom(settings, message):
        raise OSError("connection refused")

    monkeypatch.setattr(mail_service, "transport", boom)
    assert mail_service.send_password_reset("a@example.org", "tok") is False


def test_ssl_security_defaults_to_port_465(monkeypatch):
    _smtp_env(monkeypatch)
    monkeypatch.setenv("QBASAIR_SMTP_SECURITY", "ssl")
    assert mail_service.smtp_settings().port == 465


def test_forgot_password_emails_only_existing_accounts(tmp_path, monkeypatch):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        _smtp_env(monkeypatch)
        sent = []
        monkeypatch.setattr(mail_service, "transport", lambda settings, message: sent.append(message))
        client.post("/api/auth/signup", json={"email": "reader@example.com", "password": "hidayah8"})

        assert client.post("/api/auth/forgot-password", json={"email": "reader@example.com"}).status_code == 200
        assert client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"}).status_code == 200

        assert [m["To"] for m in sent] == ["reader@example.com"]
        assert "/login?reset=" in sent[0].get_body(("plain",)).get_content()
    finally:
        finalize()
