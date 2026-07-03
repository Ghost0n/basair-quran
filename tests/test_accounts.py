"""Identity layer — signup, profile, devices, bearer auth, guest merge/undo."""

from test_auth import build_auth_client

from src.app.services import app_data_service, auth_service


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
        # Seed guest (user_id=0) data as if browsed before signing up.
        app_data_service.add_notebook_item({"ayah_id": 104, "surah": "الأنعام", "ayah": 104}, 0)
        app_data_service.add_notebook_item({"ayah_id": 203, "surah": "الأعراف", "ayah": 203}, 0)
        app_data_service.add_followed_root({"root_text": "ب ص ر", "occurrences": 148}, 0)
        guest_notebook_before = app_data_service.list_notebook_items(0)
        assert len(guest_notebook_before) == 2

        signup = client.post(
            "/api/auth/signup",
            json={"email": "talib@example.com", "password": "hidayah8"},
        )
        user_id = signup.json()["user"]["id"]

        merge = client.post("/api/auth/merge-guest-data", json={})
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

        # Total notebook rows never changed — nothing was deleted.
        total_notebook = len(app_data_service.list_notebook_items(0)) + len(
            app_data_service.list_notebook_items(user_id)
        )
        assert total_notebook == 2

        undo = client.post("/api/auth/merge-guest-data/undo", json={"undo_token": undo_token})
        assert undo.status_code == 200
        # Rows are back on the guest — still nothing deleted.
        assert len(app_data_service.list_notebook_items(0)) == 2
        assert app_data_service.list_notebook_items(user_id) == []
    finally:
        finalize()
