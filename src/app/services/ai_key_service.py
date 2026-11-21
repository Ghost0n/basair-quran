"""The reader's AI connection kept on their account (docs/ai-connections.md).

Which provider the study uses and, per provider, the reader's key and chosen
model: one record per account, so a key entered on one device is there on
every other after sign-in, and leaves a browser at sign-out.

The record is encrypted at rest (Fernet: AES-128-CBC + HMAC-SHA256) with a key
from ``QBASAIR_AI_KEYS_SECRET``, or, when that is unset, derived (HKDF-SHA256)
from the session secret production already requires. A record the current
secret can't open (the secret changed) reads as no connection: the reader enters
the key again. Keys are only ever returned to their own account.
"""

from __future__ import annotations

import base64
import json
import logging
import time
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from src.app.core import config
from src.app.services import app_data_service, llm_providers

logger = logging.getLogger(__name__)

MAX_KEY_LENGTH = 4096
MAX_MODEL_LENGTH = 200

_TABLE = """
CREATE TABLE IF NOT EXISTS ai_connections (
    user_id INTEGER PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
)
"""


@lru_cache(maxsize=4)
def _fernet(secret: str) -> Fernet:
    if not secret:
        raise ValueError("no secret to encrypt AI keys with")
    derived = HKDF(algorithm=hashes.SHA256(), length=32, salt=b"qbasair-ai-keys", info=b"ai-connection v1").derive(
        secret.encode("utf-8")
    )
    return Fernet(base64.urlsafe_b64encode(derived))


def _cipher() -> Fernet:
    return _fernet(config.get_ai_keys_secret())


def _ensure(connection) -> None:
    connection.execute(_TABLE)


def clean(provider: str | None, keys: dict[str, str], models: dict[str, str]) -> dict:
    """Only known providers, trimmed values, sane lengths; empty entries dropped."""
    known = set(llm_providers.PROVIDERS)
    if provider is not None and provider not in known:
        raise ValueError(f"unknown provider: {provider}")
    clean_keys = {}
    for provider_id, key in (keys or {}).items():
        if provider_id not in known:
            raise ValueError(f"unknown provider: {provider_id}")
        key = (key or "").strip()
        if len(key) > MAX_KEY_LENGTH:
            raise ValueError("key too long")
        if key:
            clean_keys[provider_id] = key
    clean_models = {}
    for provider_id, model in (models or {}).items():
        if provider_id not in known:
            raise ValueError(f"unknown provider: {provider_id}")
        model = (model or "").strip()
        if len(model) > MAX_MODEL_LENGTH:
            raise ValueError("model name too long")
        if model:
            clean_models[provider_id] = model
    return {"provider": provider, "keys": clean_keys, "models": clean_models}


def get_connection(user_id: int) -> dict | None:
    """The account's connection, or None (none saved, or saved under another secret)."""
    with app_data_service.connect() as connection:
        _ensure(connection)
        row = connection.execute("SELECT data, updated_at FROM ai_connections WHERE user_id = ?", (user_id,)).fetchone()
    if row is None:
        return None
    try:
        payload = json.loads(_cipher().decrypt(row["data"].encode("ascii")))
    except (InvalidToken, ValueError):
        logger.warning("ai connection of user %s can't be opened with the current secret; ignored", user_id)
        return None
    return {**payload, "updated_at": int(row["updated_at"])}


def save_connection(user_id: int, provider: str | None, keys: dict[str, str], models: dict[str, str]) -> dict:
    """Replace the account's connection; returns it as saved."""
    payload = clean(provider, keys, models)
    token = _cipher().encrypt(json.dumps(payload, separators=(",", ":")).encode("utf-8")).decode("ascii")
    now = int(time.time())
    with app_data_service.connect() as connection:
        _ensure(connection)
        connection.execute(
            "INSERT INTO ai_connections (user_id, data, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
            (user_id, token, now),
        )
        connection.commit()
    return {**payload, "updated_at": now}


def delete_connection(user_id: int) -> None:
    with app_data_service.connect() as connection:
        _ensure(connection)
        connection.execute("DELETE FROM ai_connections WHERE user_id = ?", (user_id,))
        connection.commit()
