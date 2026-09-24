"""Identity layer — signup, profile, devices, bearer auth, guest merge/undo."""

from test_auth import build_auth_client

from src.app.services import app_data_service, auth_service


# --- Auth hardening (T1.5): invite gate, 409 de-reflection, timing, rate limit ---


def test_signup_conflict_does_not_reflect_email(tmp_path, monkeypatch):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        client.post(
            "/api/auth/signup",
            json={"email": "reflect@example.com", "password": "hidayah8"},
        )
        duplicate = client.post(
            "/api/auth/signup",
            json={"email": "reflect@example.com", "password": "hidayah8"},
        )
        assert duplicate.status_code == 409
        assert "reflect@example.com" not in duplicate.json()["detail"]
    finally:
        finalize()


def test_signup_requires_invite_when_configured(tmp_path, monkeypatch):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        monkeypatch.setenv("QBASAIR_INVITE_CODES", "letmein, second-code")

        missing = client.post(
            "/api/auth/signup",
            json={"email": "guest@example.com", "password": "hidayah8"},
        )
        assert missing.status_code == 403

        wrong = client.post(
            "/api/auth/signup",
            json={"email": "guest@example.com", "password": "hidayah8", "invite_code": "nope"},
        )
        assert wrong.status_code == 403

        ok = client.post(
            "/api/auth/signup",
            json={"email": "guest@example.com", "password": "hidayah8", "invite_code": "second-code"},
        )
        assert ok.status_code == 200
    finally:
        finalize()


def test_unknown_email_login_returns_401(tmp_path, monkeypatch):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        response = client.post(
            "/api/auth/login",
            json={"email": "ghost@example.com", "password": "whatever8"},
        )
        assert response.status_code == 401
    finally:
        finalize()


def test_login_is_rate_limited_after_threshold(tmp_path, monkeypatch):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        monkeypatch.setenv("QBASAIR_RATE_LIMIT_AUTH_MAX", "2")
        payload = {"email": "ghost@example.com", "password": "whatever8"}
        assert client.post("/api/auth/login", json=payload).status_code == 401
        assert client.post("/api/auth/login", json=payload).status_code == 401
        throttled = client.post("/api/auth/login", json=payload)
        assert throttled.status_code == 429
    finally:
        finalize()


def test_signup_creates_account_and_session(tmp_path, monkeypatch):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        response = client.post(
            "/api/auth/signup",
            json={"email": "talib@example.com", "password": "hidayah8", "name": "أبو محمد"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["authenticated"] is True
        assert body["user"]["email"] == "talib@example.com"
        assert body["user"]["name"] == "أبو محمد"
        assert body["user"]["onboarded"] is False
        assert body["token"]

        # Duplicate email is a conflict, not a silent overwrite.
        duplicate = client.post(
            "/api/auth/signup",
            json={"email": "talib@example.com", "password": "hidayah8"},
        )
        assert duplicate.status_code == 409
    finally:
        finalize()


def test_profile_sets_avatar_name_and_onboarded(tmp_path, monkeypatch):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        client.post(
            "/api/auth/signup",
            json={"email": "talib@example.com", "password": "hidayah8"},
        )
        response = client.patch(
            "/api/auth/profile",
            json={"name": "ابن الجزري", "avatar": "ب", "onboarded": True},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "ابن الجزري"
        assert body["avatar"] == "ب"
        assert body["onboarded"] is True

        session = client.get("/api/auth/session")
        assert session.json()["user"]["onboarded"] is True
    finally:
        finalize()


def test_profile_requires_authentication(tmp_path, monkeypatch):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        response = client.patch("/api/auth/profile", json={"avatar": "ن"})
        assert response.status_code == 401
    finally:
        finalize()


def test_bearer_token_resolves_like_the_cookie(tmp_path, monkeypatch):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        signup = client.post(
            "/api/auth/signup",
            json={"email": "talib@example.com", "password": "hidayah8", "platform": "ios"},
        )
        token = signup.json()["token"]

        # Drop cookies — a native client only has the bearer token.
        client.cookies.clear()
        session = client.get("/api/auth/session", headers={"Authorization": f"Bearer {token}"})
        assert session.json()["authenticated"] is True
        assert session.json()["user"]["email"] == "talib@example.com"

        # No token at all → unauthenticated (but not an error on /session).
        anon = client.get("/api/auth/session")
        assert anon.json()["authenticated"] is False
    finally:
        finalize()


def test_devices_list_current_and_eject(tmp_path, monkeypatch):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        client.post(
            "/api/auth/signup",
            json={"email": "talib@example.com", "password": "hidayah8", "device_label": "MacBook · Safari"},
        )
        user = auth_service.get_user_by_id(
            auth_service.authenticate_user("talib@example.com", "hidayah8").id
        )
        # A second device (e.g. the phone app) mints another session.
        other_token, other_session = auth_service.create_session(
            user.id, device_label="iPhone · التطبيق", platform="ios"
        )

        devices = client.get("/api/auth/devices").json()
        assert len(devices) == 2
        current = [d for d in devices if d["is_current"]]
        assert len(current) == 1
        assert current[0]["device_label"] == "MacBook · Safari"

        # Eject the other device — its token stops resolving.
        eject = client.delete(f"/api/auth/devices/{other_session.id}")
        assert eject.status_code == 200
        assert eject.json()["deleted"] is True
        assert auth_service.resolve_session(other_token) is None

        remaining = client.get("/api/auth/devices").json()
        assert len(remaining) == 1
    finally:
        finalize()


def test_guest_merge_moves_rows_and_undo_restores_them(tmp_path, monkeypatch):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        # Seed guest (user_id=0) data stamped with this device's guest token.
        gid = "guest-token-A"
        app_data_service.add_notebook_item({"ayah_id": 104, "surah": "الأنعام", "ayah": 104}, 0, gid)
        app_data_service.add_notebook_item({"ayah_id": 203, "surah": "الأعراف", "ayah": 203}, 0, gid)
        app_data_service.add_followed_root({"root_text": "ب ص ر", "occurrences": 148}, 0, gid)
        guest_notebook_before = app_data_service.list_notebook_items(0)
        assert len(guest_notebook_before) == 2

        signup = client.post(
            "/api/auth/signup",
            json={"email": "talib@example.com", "password": "hidayah8"},
        )
        user_id = signup.json()["user"]["id"]

        merge = client.post(
            "/api/auth/merge-guest-data", json={}, headers={"X-QBasair-Guest-Id": gid}
        )
        assert merge.status_code == 200
        result = merge.json()
        assert result["merged"] is True
        assert result["notebook_moved"] == 2
        assert result["roots_moved"] == 1
        undo_token = result["undo_token"]
        assert undo_token

        # Guest is now empty; the account owns the rows.
        assert app_data_service.list_notebook_items(0) == []
        assert len(app_data_service.list_notebook_items(user_id)) == 2

        # Re-running the merge is idempotent — nothing left to move.
        again = client.post(
            "/api/auth/merge-guest-data", json={}, headers={"X-QBasair-Guest-Id": gid}
        )
        assert again.json()["notebook_moved"] == 0

        undo = client.post("/api/auth/merge-guest-data/undo", json={"undo_token": undo_token})
        assert undo.status_code == 200
        # Rows are back on the guest — still nothing deleted.
        assert len(app_data_service.list_notebook_items(0)) == 2
        assert app_data_service.list_notebook_items(user_id) == []
    finally:
        finalize()


def test_merge_cannot_claim_another_guests_rows(tmp_path, monkeypatch):
    """The HIGH-severity fix: an account may only claim its OWN guest token's rows."""
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        # Two distinct guest devices seed data.
        app_data_service.add_notebook_item({"ayah_id": 1}, 0, "guest-A")
        app_data_service.add_notebook_item({"ayah_id": 2}, 0, "guest-B")
        app_data_service.add_notebook_item({"ayah_id": 3}, 0, "guest-B")

        signup = client.post(
            "/api/auth/signup",
            json={"email": "attacker@example.com", "password": "hidayah8"},
        )
        user_id = signup.json()["user"]["id"]

        # The account presents guest-A's token: it must NOT sweep guest-B's rows.
        merge = client.post(
            "/api/auth/merge-guest-data", json={}, headers={"X-QBasair-Guest-Id": "guest-A"}
        )
        assert merge.json()["notebook_moved"] == 1
        assert len(app_data_service.list_notebook_items(user_id)) == 1
        # guest-B's two rows are untouched on the guest.
        assert len(app_data_service.list_notebook_items(0)) == 2

        # A merge with no token harvests nothing at all.
        empty = client.post("/api/auth/merge-guest-data", json={})
        assert empty.json()["notebook_moved"] == 0
        assert len(app_data_service.list_notebook_items(0)) == 2
    finally:
        finalize()


def test_account_deletion_erases_user_sessions_and_data(tmp_path, monkeypatch):
    """T6.2: DELETE /api/auth/account removes the user, sessions, and app data."""
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        signup = client.post(
            "/api/auth/signup",
            json={"email": "gone@example.com", "password": "hidayah8"},
        )
        assert signup.status_code == 200
        user_id = signup.json()["user"]["id"]

        # Seed some owned app data.
        app_data_service.add_notebook_item({"ayah_id": 5}, user_id)
        assert len(app_data_service.list_notebook_items(user_id)) == 1

        # Session is live before deletion.
        assert client.get("/api/auth/session").json()["authenticated"] is True

        deleted = client.delete("/api/auth/account")
        assert deleted.status_code == 200
        assert deleted.json()["deleted"] is True

        # Session no longer authenticates; app data and user row are gone.
        assert client.get("/api/auth/session").json()["authenticated"] is False
        assert app_data_service.list_notebook_items(user_id) == []
        assert auth_service.get_user_by_id(user_id) is None
    finally:
        finalize()


def test_password_reset_flow(tmp_path, monkeypatch):
    """T6.1: forgot-password mints a token; reset-password sets a new password."""
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        client.post("/api/auth/signup", json={"email": "forgot@example.com", "password": "oldpass12"})

        # Forgot-password never reveals whether the account exists.
        assert client.post("/api/auth/forgot-password", json={"email": "forgot@example.com"}).status_code == 200
        assert client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"}).status_code == 200

        token = auth_service.create_password_reset("forgot@example.com")
        assert token

        # Wrong token → 400; weak password → 422.
        assert client.post("/api/auth/reset-password", json={"token": "bad-token-xxxx", "password": "newpass12"}).status_code == 400
        assert client.post("/api/auth/reset-password", json={"token": token, "password": "short"}).status_code == 422

        # Valid reset → 200, old password no longer works, new one does.
        ok = client.post("/api/auth/reset-password", json={"token": token, "password": "newpass12"})
        assert ok.status_code == 200
        assert auth_service.authenticate_user("forgot@example.com", "oldpass12") is None
        assert auth_service.authenticate_user("forgot@example.com", "newpass12") is not None

        # Token is single-use.
        assert client.post("/api/auth/reset-password", json={"token": token, "password": "newpass12"}).status_code == 400
    finally:
        finalize()


def test_web_login_without_label_names_the_device_from_user_agent(tmp_path, monkeypatch):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        client.post(
            "/api/auth/signup",
            json={"email": "ua@example.com", "password": "hidayah8"},
            headers={"User-Agent": ua},
        )
        devices = client.get("/api/auth/devices").json()
        assert devices[0]["device_label"] == "Safari · iPhone"
        assert devices[0]["platform"] == "web"  # the client-declared platform is kept
    finally:
        finalize()
