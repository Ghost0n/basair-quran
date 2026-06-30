"""User-data store — notebook items, research sessions, followed roots.

This service owns ``data/app_data.db``, a SQLite database that holds
user-generated content. It is created and migrated at runtime and is
NEVER produced by ``scripts/build_db.py``; a ``[rebuild-db]`` deploy must
not touch it.

Every table carries a ``user_id`` column so the store is ready for
multi-tenant use. Until the product owner decides multi-tenant vs
single-user (an open question in the design handoff), callers pass the
authenticated session user id, falling back to ``0`` when auth is off.
"""

from __future__ import annotations

import json
from pathlib import Path
import sqlite3
import time

from src.app.core import config

DEFAULT_USER_ID = 0


def _connect() -> sqlite3.Connection:
    db_path = Path(config.get_app_db_path())
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    return connection


def ensure_app_db() -> None:
    """Create the user-data tables if they do not exist yet."""
    with _connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS notebook_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 0,
                ayah_id INTEGER NOT NULL,
                mushaf_id INTEGER NOT NULL DEFAULT 1,
                surah_id INTEGER,
                surah TEXT,
                ayah INTEGER,
                text TEXT,
                note TEXT,
                collection TEXT,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_notebook_user ON notebook_items (user_id, created_at);

            CREATE TABLE IF NOT EXISTS research_sessions (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL DEFAULT 0,
                title TEXT NOT NULL,
                mode TEXT NOT NULL DEFAULT 'strict',
                message_count INTEGER NOT NULL DEFAULT 0,
                messages TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON research_sessions (user_id, updated_at);

            CREATE TABLE IF NOT EXISTS followed_roots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 0,
                root_text TEXT NOT NULL,
                root_id INTEGER,
                occurrences INTEGER,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_roots_user ON followed_roots (user_id, root_text);

            CREATE TABLE IF NOT EXISTS user_preferences (
                user_id INTEGER PRIMARY KEY,
                data TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
            """
        )
        connection.commit()


# ----------------------------------------------------------------------
# User preferences
# ----------------------------------------------------------------------

DEFAULT_PREFERENCES: dict = {
    "riwayah": 1,
    "mushaf_font": "amiri-quran",
    "numerals": "arabic-indic",
    "ui_language": "ar",
    "theme": "dark",
    "font_size": 28,
    "reciter": "",
    "mushaf_render": "simple",
    "research": {"default_mode": "strict", "depth": "balanced"},
}


def get_preferences(user_id: int = DEFAULT_USER_ID) -> dict:
    with _connect() as connection:
        row = connection.execute(
            "SELECT data FROM user_preferences WHERE user_id = ?",
            (user_id,),
        ).fetchone()
    merged = {**DEFAULT_PREFERENCES}
    if row is not None:
        stored = json.loads(row["data"])
        merged.update({key: value for key, value in stored.items() if value is not None})
        merged["research"] = {**DEFAULT_PREFERENCES["research"], **(stored.get("research") or {})}
    return merged


def update_preferences(patch: dict, user_id: int = DEFAULT_USER_ID) -> dict:
    current = get_preferences(user_id)
    research_patch = patch.pop("research", None)
    current.update({key: value for key, value in patch.items() if value is not None})
    if research_patch:
        current["research"] = {
            **current["research"],
            **{key: value for key, value in research_patch.items() if value is not None},
        }
    with _connect() as connection:
        connection.execute(
            "INSERT OR REPLACE INTO user_preferences (user_id, data, updated_at) VALUES (?, ?, ?)",
            (user_id, json.dumps(current, ensure_ascii=False), int(time.time())),
        )
        connection.commit()
    return current


# ----------------------------------------------------------------------
# Notebook items (pinned / saved verses)
# ----------------------------------------------------------------------


def list_notebook_items(user_id: int = DEFAULT_USER_ID) -> list[dict]:
    with _connect() as connection:
        rows = connection.execute(
            "SELECT * FROM notebook_items WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def add_notebook_item(payload: dict, user_id: int = DEFAULT_USER_ID) -> dict:
    created_at = int(time.time())
    with _connect() as connection:
        cursor = connection.execute(
            """
            INSERT INTO notebook_items
                (user_id, ayah_id, mushaf_id, surah_id, surah, ayah, text, note, collection, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                payload["ayah_id"],
                payload.get("mushaf_id", 1),
                payload.get("surah_id"),
                payload.get("surah"),
                payload.get("ayah"),
                payload.get("text"),
                payload.get("note"),
                payload.get("collection"),
                created_at,
            ),
        )
        connection.commit()
        item_id = cursor.lastrowid
        row = connection.execute("SELECT * FROM notebook_items WHERE id = ?", (item_id,)).fetchone()
    return dict(row)


def delete_notebook_item(item_id: int, user_id: int = DEFAULT_USER_ID) -> bool:
    with _connect() as connection:
        cursor = connection.execute(
            "DELETE FROM notebook_items WHERE id = ? AND user_id = ?",
            (item_id, user_id),
        )
        connection.commit()
        return cursor.rowcount > 0


# ----------------------------------------------------------------------
# Research sessions
# ----------------------------------------------------------------------


def list_sessions(user_id: int = DEFAULT_USER_ID) -> list[dict]:
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT id, user_id, title, mode, message_count, created_at, updated_at
            FROM research_sessions WHERE user_id = ? ORDER BY updated_at DESC
            """,
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_session(session_id: str, user_id: int = DEFAULT_USER_ID) -> dict | None:
    with _connect() as connection:
        row = connection.execute(
            "SELECT * FROM research_sessions WHERE id = ? AND user_id = ?",
            (session_id, user_id),
        ).fetchone()
    if row is None:
        return None
    session = dict(row)
    session["messages"] = json.loads(session["messages"]) if session.get("messages") else []
    return session


def save_session(payload: dict, user_id: int = DEFAULT_USER_ID) -> dict:
    now = int(time.time())
    messages = payload.get("messages") or []
    with _connect() as connection:
        existing = connection.execute(
            "SELECT created_at FROM research_sessions WHERE id = ? AND user_id = ?",
            (payload["id"], user_id),
        ).fetchone()
        created_at = existing["created_at"] if existing else now
        connection.execute(
            """
            INSERT OR REPLACE INTO research_sessions
                (id, user_id, title, mode, message_count, messages, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["id"],
                user_id,
                payload.get("title", "جلسة بحث"),
                payload.get("mode", "strict"),
                len(messages),
                json.dumps(messages, ensure_ascii=False),
                created_at,
                now,
            ),
        )
        connection.commit()
    result = get_session(payload["id"], user_id)
    assert result is not None
    return result


def delete_session(session_id: str, user_id: int = DEFAULT_USER_ID) -> bool:
    with _connect() as connection:
        cursor = connection.execute(
            "DELETE FROM research_sessions WHERE id = ? AND user_id = ?",
            (session_id, user_id),
        )
        connection.commit()
        return cursor.rowcount > 0


# ----------------------------------------------------------------------
# Followed roots
# ----------------------------------------------------------------------


def list_followed_roots(user_id: int = DEFAULT_USER_ID) -> list[dict]:
    with _connect() as connection:
        rows = connection.execute(
            "SELECT * FROM followed_roots WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def add_followed_root(payload: dict, user_id: int = DEFAULT_USER_ID) -> dict:
    root_text = (payload.get("root_text") or "").strip()
    created_at = int(time.time())
    with _connect() as connection:
        existing = connection.execute(
            "SELECT * FROM followed_roots WHERE user_id = ? AND root_text = ?",
            (user_id, root_text),
        ).fetchone()
        if existing is not None:
            return dict(existing)
        cursor = connection.execute(
            """
            INSERT INTO followed_roots (user_id, root_text, root_id, occurrences, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, root_text, payload.get("root_id"), payload.get("occurrences"), created_at),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM followed_roots WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return dict(row)


def delete_followed_root(root_id: int, user_id: int = DEFAULT_USER_ID) -> bool:
    with _connect() as connection:
        cursor = connection.execute(
            "DELETE FROM followed_roots WHERE id = ? AND user_id = ?",
            (root_id, user_id),
        )
        connection.commit()
        return cursor.rowcount > 0
