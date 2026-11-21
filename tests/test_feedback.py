"""Feedback centre — submissions from guests and members, staff triage (docs/feedback-centre.md)."""

import pytest
from fastapi.testclient import TestClient

from src.app.services import email_check
from test_auth import build_auth_client


@pytest.fixture(autouse=True)
def mail_domains(monkeypatch):
    """No real DNS in tests: these domains take mail, any other doesn't exist."""
    known = {"gmail.com", "basair-mail.org"}
    monkeypatch.setattr(email_check, "_raw_lookup", lambda domain: domain in known)
    monkeypatch.setattr(email_check, "_cache", {})
    monkeypatch.setattr(email_check, "_canary", None)


def test_feedback_from_guests_and_members_is_triaged_by_staff(tmp_path, monkeypatch):
    admin, finalize = build_auth_client(tmp_path, monkeypatch)
    guest = TestClient(admin.app)
    member = TestClient(admin.app)
    try:
        admin.post("/api/auth/login", json={"email": "admin@example.com", "password": "secret123"})
        member.post("/api/auth/signup", json={"email": "amina@example.com", "password": "hidayah8"})

        sent = guest.post("/api/feedback", json={"kind": "contact", "message": "السلام عليكم", "email": "guest@basair-mail.org"})
        assert sent.status_code == 200
        assert set(sent.json()) == {"id", "kind", "status", "message", "created_at", "updated_at"}  # no staff fields
        assert guest.post("/api/feedback", json={"kind": "bug", "message": "  "}).status_code == 422
        assert guest.get("/api/feedback/mine").status_code == 401

        feature = member.post("/api/feedback", json={"kind": "feature", "message": "وضع ليلي للقارئ", "language": "ar"}).json()
        report = {
            "kind": "error",
            "detail": {"scope": "reader", "user_message": "تعذّر", "detail": "500", "breadcrumbs": []},
            "url": "/?mode=reader",
        }
        assert member.post("/api/feedback", json={"kind": "error"}).status_code == 422  # a report needs its detail
        assert member.post("/api/feedback", json=report).status_code == 200
        # Diagnostic reports aren't listed back to their sender, messages are.
        assert [item["kind"] for item in member.get("/api/feedback/mine").json()] == ["feature"]

        assert member.get("/api/moderation/feedback").status_code == 403
        page = admin.get("/api/moderation/feedback").json()
        assert [item["kind"] for item in page["items"]] == ["error", "feature", "contact"]
        assert page["counts"] == {"new": 3, "in_progress": 0, "resolved": 0, "closed": 0}
        error = page["items"][0]
        assert error["detail"]["scope"] == "reader" and error["url"] == "/?mode=reader" and error["user_agent"]
        assert page["items"][2]["email"] == "guest@basair-mail.org"
        assert [item["kind"] for item in admin.get("/api/moderation/feedback", params={"kind": "feature"}).json()["items"]] == ["feature"]

        updated = admin.patch(
            f"/api/moderation/feedback/{feature['id']}", json={"status": "in_progress", "staff_note": "مقترح جيد"}
        ).json()
        assert updated["status"] == "in_progress" and updated["staff_note"] == "مقترح جيد" and updated["assigned_to"]
        assert member.get("/api/feedback/mine").json()[0]["status"] == "in_progress"
        assert admin.get("/api/moderation/health").json()["backlog"]["open_feedback"] == 3
    finally:
        guest.close()
        member.close()
        finalize()


def test_feedback_is_rate_limited_per_ip(tmp_path, monkeypatch):
    monkeypatch.setenv("QBASAIR_RATE_LIMIT_FEEDBACK_MAX", "2")
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        for _ in range(2):
            assert client.post("/api/feedback", json={"kind": "help", "message": "سؤال", "email": "a@gmail.com"}).status_code == 200
        assert client.post("/api/feedback", json={"kind": "help", "message": "سؤال", "email": "a@gmail.com"}).status_code == 429
    finally:
        finalize()


def test_a_guest_leaves_a_real_email_to_be_answered(tmp_path, monkeypatch):
    guest, finalize = build_auth_client(tmp_path, monkeypatch)
    member = TestClient(guest.app)
    try:
        def send(client, **fields):
            return client.post("/api/feedback", json={"kind": "contact", "message": "سؤال", **fields})

        def code(response):
            assert response.status_code == 422
            return response.json()["detail"]["code"]

        assert code(send(guest)) == "email_required"
        assert code(send(guest, email="  ")) == "email_required"
        assert code(send(guest, email="not-an-email")) == "email_invalid"
        assert code(send(guest, email="someone@gmial.con")) == "email_domain"
        assert code(send(guest, email="someone@example.com")) == "email_domain"
        assert code(send(guest, email="someone@mailinator.com")) == "email_disposable"
        assert send(guest, email=" Someone@GMAIL.com ").status_code == 200
        # A diagnostic report needs no address; a signed-in member is answered in the app.
        report = {"kind": "error", "detail": {"scope": "reader", "detail": "500"}}
        assert guest.post("/api/feedback", json=report).status_code == 200
        member.post("/api/auth/signup", json={"email": "amina@basair-mail.org", "password": "hidayah8"})
        assert send(member).status_code == 200
    finally:
        member.close()
        finalize()


def test_a_contact_message_is_forwarded_to_the_contact_address(tmp_path, monkeypatch):
    """The landing's contact form reaches contact@basairquran.com (or QBASAIR_CONTACT_EMAIL), replying to the sender."""
    from src.app.services import mail_service

    monkeypatch.setenv("QBASAIR_SMTP_HOST", "smtp.example.org")
    monkeypatch.setenv("QBASAIR_SMTP_USER", "mailer@example.org")
    monkeypatch.delenv("QBASAIR_CONTACT_EMAIL", raising=False)
    sent = []
    monkeypatch.setattr(mail_service, "transport", lambda settings, message: sent.append(message))
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        answer = client.post(
            "/api/feedback",
            json={"kind": "contact", "message": "سؤال عن التطبيق", "email": "guest@basair-mail.org", "language": "fr", "url": "/about"},
        )
        assert answer.status_code == 200
        assert len(sent) == 1
        mail = sent[0]
        assert mail["To"] == "contact@basairquran.com"
        assert mail["Reply-To"] == "guest@basair-mail.org"
        assert "سؤال عن التطبيق" in mail.get_content()
        assert f"#{answer.json()['id']}" in mail["Subject"]

        # Other kinds stay in the feedback centre only.
        client.post("/api/feedback", json={"kind": "bug", "message": "خطأ", "email": "guest@basair-mail.org"})
        assert len(sent) == 1

        monkeypatch.setenv("QBASAIR_CONTACT_EMAIL", "team@example.org")
        client.post("/api/feedback", json={"kind": "contact", "message": "مرحباً", "email": "guest@basair-mail.org"})
        assert sent[-1]["To"] == "team@example.org"
    finally:
        finalize()


def test_a_contact_message_is_kept_when_mail_is_not_configured(tmp_path, monkeypatch):
    from src.app.services import mail_service

    monkeypatch.delenv("QBASAIR_SMTP_HOST", raising=False)
    sent = []
    monkeypatch.setattr(mail_service, "transport", lambda settings, message: sent.append(message))
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        answer = client.post("/api/feedback", json={"kind": "contact", "message": "مرحباً", "email": "guest@basair-mail.org"})
        assert answer.status_code == 200
        assert sent == []
    finally:
        finalize()
