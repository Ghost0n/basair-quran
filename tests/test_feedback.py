"""Feedback centre — submissions from guests and members, staff triage (docs/feedback-centre.md)."""

from fastapi.testclient import TestClient

from test_auth import build_auth_client


def test_feedback_from_guests_and_members_is_triaged_by_staff(tmp_path, monkeypatch):
    admin, finalize = build_auth_client(tmp_path, monkeypatch)
    guest = TestClient(admin.app)
    member = TestClient(admin.app)
    try:
        admin.post("/api/auth/login", json={"email": "admin@example.com", "password": "secret123"})
        member.post("/api/auth/signup", json={"email": "amina@example.com", "password": "hidayah8"})

        sent = guest.post("/api/feedback", json={"kind": "contact", "message": "السلام عليكم", "email": "guest@example.com"})
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
        assert page["items"][2]["email"] == "guest@example.com"
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
            assert client.post("/api/feedback", json={"kind": "help", "message": "سؤال"}).status_code == 200
        assert client.post("/api/feedback", json={"kind": "help", "message": "سؤال"}).status_code == 429
    finally:
        finalize()
