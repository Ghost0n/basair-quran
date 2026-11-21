"""The reader's AI connection on their account (docs/ai-connections.md): saved
encrypted, found again from any device after sign-in, only by that account,
never cached, and gone with the account."""

import sqlite3

import pytest
from fastapi.testclient import TestClient

from test_auth import build_auth_client

from src.app.factory import create_app
from src.app.services import ai_key_service, app_data_service

CONNECTION = {
    "provider": "ollama",
    "keys": {"ollama": "  sk-ollama-secret-123  ", "openai": "sk-openai-456"},
    "models": {"ollama": "gpt-oss:120b"},
}


def signup(client, email):
    response = client.post("/api/auth/signup", json={"email": email, "password": "hidayah8"})
    assert response.status_code == 200
    return response.json()["user"]["id"]


def test_a_key_saved_on_one_device_is_there_on_another(tmp_path, monkeypatch):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        signup(client, "amina@example.com")
        empty = client.get("/api/user/ai-connection")
        assert empty.status_code == 200
        assert empty.json() == {"provider": None, "keys": {}, "models": {}, "updated_at": 0}

        saved = client.put("/api/user/ai-connection", json=CONNECTION)
        assert saved.status_code == 200
        body = saved.json()
        assert body["provider"] == "ollama" and body["updated_at"] > 0
        assert body["keys"] == {"ollama": "sk-ollama-secret-123", "openai": "sk-openai-456"}  # trimmed
        assert saved.headers["cache-control"] == "no-store"

        # Another device: a fresh browser signing in to the same account.
        other = TestClient(client.app)
        assert other.post("/api/auth/login", json={"email": "amina@example.com", "password": "hidayah8"}).status_code == 200
        there = other.get("/api/user/ai-connection")
        assert there.headers["cache-control"] == "no-store"
        assert there.json()["keys"]["ollama"] == "sk-ollama-secret-123"
        assert there.json()["models"] == {"ollama": "gpt-oss:120b"}

        # Forgetting the key (Settings) clears it everywhere.
        forgotten = client.delete("/api/user/ai-connection")
        assert forgotten.json() == {"deleted": True} and forgotten.headers["cache-control"] == "no-store"
        assert other.get("/api/user/ai-connection").json()["keys"] == {}
    finally:
        finalize()


def test_keys_are_encrypted_at_rest_and_unreadable_under_another_secret(tmp_path, monkeypatch):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        user_id = signup(client, "amina@example.com")
        client.put("/api/user/ai-connection", json=CONNECTION)
        with sqlite3.connect(tmp_path / "app_data.db") as db:
            (stored,) = db.execute("SELECT data FROM ai_connections WHERE user_id = ?", (user_id,)).fetchone()
        assert "sk-ollama-secret-123" not in stored and "ollama" not in stored

        # A dedicated secret replaces the session-derived one: the old record reads as none.
        monkeypatch.setenv("QBASAIR_AI_KEYS_SECRET", "another-secret")
        assert ai_key_service.get_connection(user_id) is None
        assert client.get("/api/user/ai-connection").json()["keys"] == {}
    finally:
        finalize()


def test_only_the_account_reads_its_keys(tmp_path, monkeypatch):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        signup(client, "amina@example.com")
        client.put("/api/user/ai-connection", json=CONNECTION)

        guest = TestClient(client.app)
        assert guest.get("/api/user/ai-connection").status_code == 401
        assert guest.put("/api/user/ai-connection", json=CONNECTION).status_code == 401

        stranger = TestClient(client.app)
        signup(stranger, "yusuf@example.com")
        assert stranger.get("/api/user/ai-connection").json()["keys"] == {}
    finally:
        finalize()


@pytest.mark.parametrize(
    "payload",
    [
        {"provider": "nobody", "keys": {}, "models": {}},
        {"provider": None, "keys": {"nobody": "k"}, "models": {}},
        {"provider": None, "keys": {"openai": "k" * 5000}, "models": {}},
        {"provider": None, "keys": {}, "models": {"openai": "m" * 300}},
    ],
)
def test_unknown_providers_and_oversized_values_are_refused(tmp_path, monkeypatch, payload):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        signup(client, "amina@example.com")
        assert client.put("/api/user/ai-connection", json=payload).status_code == 422
    finally:
        finalize()


def test_deleting_the_account_deletes_its_keys(tmp_path, monkeypatch):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        user_id = signup(client, "amina@example.com")
        client.put("/api/user/ai-connection", json=CONNECTION)
        assert client.delete("/api/auth/account").json()["deleted"] is True
        with app_data_service.connect() as db:
            assert db.execute("SELECT COUNT(*) FROM ai_connections WHERE user_id = ?", (user_id,)).fetchone()[0] == 0
    finally:
        finalize()


def test_without_accounts_there_is_no_account_connection(tmp_path, monkeypatch):
    monkeypatch.setenv("QBASAIR_AUTH_ENABLED", "0")
    monkeypatch.setenv("QBASAIR_APP_DB_PATH", str(tmp_path / "app_data.db"))
    with TestClient(create_app()) as client:
        assert client.get("/api/user/ai-connection").status_code == 401
