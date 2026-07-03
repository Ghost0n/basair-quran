from pathlib import Path
from typing import Callable

from fastapi.testclient import TestClient

from conftest import create_test_db
from src import main
from src.app.factory import create_app
from src.app.services import app_data_service, auth_service


def build_auth_client(tmp_path: Path, monkeypatch) -> tuple[TestClient, Callable[[], None]]:
    db_path = tmp_path / "fixture.db"
    auth_db_path = tmp_path / "auth.db"
    app_db_path = tmp_path / "app_data.db"
    create_test_db(db_path)

    original_db_path = main.get_db_path()
    original_auth_db_path = main.get_auth_db_path()
    main.close_db_connection()
    main.set_db_path(str(db_path))
    main.set_auth_db_path(str(auth_db_path))

    monkeypatch.setenv("QBASAIR_AUTH_ENABLED", "1")
    monkeypatch.setenv("QBASAIR_SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("QBASAIR_SESSION_SECURE", "0")
    monkeypatch.setenv("QBASAIR_AUTH_DB_PATH", str(auth_db_path))
    monkeypatch.setenv("QBASAIR_APP_DB_PATH", str(app_db_path))

    auth_service.ensure_auth_db()
    app_data_service.ensure_app_db()
    auth_service.create_user("admin@example.com", "secret123", is_admin=True)

    client = TestClient(create_app())

    def finalize() -> None:
        client.close()
        main.close_db_connection()
        main.set_db_path(original_db_path)
        main.set_auth_db_path(original_auth_db_path)

    return client, finalize


def test_auth_session_reports_disabled_by_default(api_client):
    response = api_client.get("/api/auth/session")
    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is False
    assert body["authenticated"] is False
    assert body["user"] is None


def test_reading_and_search_stay_open_to_guests(tmp_path, monkeypatch):
    """Hybrid gating: reading + search need no account; only Studio is gated."""
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        health_response = client.get("/api/health")
        assert health_response.status_code == 200

        # Search is open to guests now (was 401 under the old all-or-nothing gate).
        search_response = client.get(
            "/api/search-v2", params={"q": "shared", "mode": "root", "mushaf": 1}
        )
        assert search_response.status_code == 200

        # The notebook (companions) is reachable as a guest too.
        notebook_response = client.get("/api/notebook")
        assert notebook_response.status_code == 200

        # The Studio/research surface is hard-gated for guests.
        research_response = client.get("/api/research-agent/settings")
        assert research_response.status_code == 401
        assert research_response.json()["detail"]["code"] == "auth_required"
    finally:
        finalize()


def test_login_creates_session_and_logout_revokes_it(tmp_path, monkeypatch):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        session_before = client.get("/api/auth/session")
        assert session_before.json()["authenticated"] is False

        login_response = client.post(
            "/api/auth/login",
            json={"email": "admin@example.com", "password": "secret123"},
        )
        assert login_response.status_code == 200
        assert login_response.json()["authenticated"] is True
        assert login_response.json()["user"]["email"] == "admin@example.com"
        assert login_response.json()["token"]  # native clients get the raw token

        session_after = client.get("/api/auth/session")
        assert session_after.json()["authenticated"] is True

        logout_response = client.post("/api/auth/logout")
        assert logout_response.status_code == 200
        assert logout_response.json()["authenticated"] is False

        session_final = client.get("/api/auth/session")
        assert session_final.json()["authenticated"] is False
    finally:
        finalize()


def test_wrong_password_is_rejected(tmp_path, monkeypatch):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        login_response = client.post(
            "/api/auth/login",
            json={"email": "admin@example.com", "password": "wrongpass"},
        )
        assert login_response.status_code == 401
        assert login_response.json()["detail"] == "Invalid email or password."
    finally:
        finalize()


def test_disabled_user_cannot_authenticate(tmp_path, monkeypatch):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        auth_service.set_user_active("admin@example.com", False)
        login_response = client.post(
            "/api/auth/login",
            json={"email": "admin@example.com", "password": "secret123"},
        )
        assert login_response.status_code == 401
        assert login_response.json()["detail"] == "Invalid email or password."
    finally:
        finalize()
