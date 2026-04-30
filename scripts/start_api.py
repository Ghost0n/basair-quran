"""Startup wrapper for the FastAPI service.

This script can rebuild the SQLite database on startup when the committed DB
does not yet contain the schema required by the current backend code.
"""

from __future__ import annotations

import os
from pathlib import Path
import sqlite3

import scripts.build_db as build_db
from src import main

REQUIRED_TABLES = frozenset({"morphology_search_variants", "ayah_words"})


def get_build_db_on_start_mode() -> str:
    """Return the startup DB policy: never, auto, or always."""
    raw_value = os.environ.get("QBASAIR_BUILD_DB_ON_START", "auto").strip().lower()
    if raw_value in {"0", "false", "no", "off", "never"}:
        return "never"
    if raw_value in {"1", "true", "yes", "on", "always"}:
        return "always"
    return "auto"


def database_has_required_tables(db_path: str | None = None) -> bool:
    """Return True when the DB contains the offline-precompute tables."""
    target_path = Path(db_path or main.get_db_path())
    if not target_path.exists():
        return False

    try:
        connection = sqlite3.connect(target_path)
        try:
            cursor = connection.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
            tables = {row[0] for row in cursor.fetchall()}
        finally:
            connection.close()
    except sqlite3.Error:
        return False

    return REQUIRED_TABLES.issubset(tables)


def ensure_database_ready() -> None:
    """Rebuild the DB only when startup policy requires it."""
    mode = get_build_db_on_start_mode()
    if mode == "never":
        return

    ready = database_has_required_tables()
    if mode == "auto" and ready:
        return

    print("Database schema missing or startup rebuild forced; rebuilding quran.db...")
    exit_code = build_db.build_db()
    if exit_code != 0:
        raise SystemExit(exit_code)

    if not database_has_required_tables():
        raise SystemExit("Database rebuild completed but required tables are still missing.")


def run() -> None:
    """Ensure DB readiness, then launch the API."""
    ensure_database_ready()

    import uvicorn

    port = int(os.environ.get("PORT", "8001"))
    uvicorn.run(main.app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    run()
