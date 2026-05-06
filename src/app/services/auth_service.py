from __future__ import annotations

from dataclasses import dataclass
import hashlib
import hmac
import os
from pathlib import Path
import sqlite3
import time

from src.app.core import config


@dataclass(frozen=True)
class AuthUser:
    id: int
    email: str
    is_admin: bool
    is_active: bool


class AuthError(ValueError):
    """Raised when auth management input is invalid."""


def normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if not normalized or "@" not in normalized:
        raise AuthError("A valid email address is required.")
    return normalized


def validate_password(password: str) -> str:
    cleaned = password.strip()
    if len(cleaned) < 8:
        raise AuthError("Passwords must contain at least 8 characters.")
    return cleaned


def _connect() -> sqlite3.Connection:
    db_path = Path(config.get_auth_db_path())
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    return connection


def ensure_auth_db() -> None:
    with _connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_salt TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                is_admin INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_users_active ON users (is_active);
            """
        )
        connection.commit()


def _hash_password(password: str, salt_hex: str | None = None) -> tuple[str, str]:
    salt = bytes.fromhex(salt_hex) if salt_hex else os.urandom(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=64)
    return salt.hex(), digest.hex()


def _row_to_user(row: sqlite3.Row | None) -> AuthUser | None:
    if row is None:
        return None
    return AuthUser(
        id=int(row["id"]),
        email=str(row["email"]),
        is_admin=bool(row["is_admin"]),
        is_active=bool(row["is_active"]),
    )


def count_users() -> int:
    ensure_auth_db()
    with _connect() as connection:
        row = connection.execute("SELECT COUNT(*) AS count FROM users").fetchone()
    return int(row["count"]) if row else 0


def list_users() -> list[AuthUser]:
    ensure_auth_db()
    with _connect() as connection:
        rows = connection.execute("SELECT id, email, is_admin, is_active FROM users ORDER BY email ASC").fetchall()
    return [user for row in rows if (user := _row_to_user(row)) is not None]


def create_user(email: str, password: str, *, is_admin: bool = False) -> AuthUser:
    ensure_auth_db()
    normalized_email = normalize_email(email)
    validated_password = validate_password(password)
    salt_hex, password_hash = _hash_password(validated_password)
    now = int(time.time())

    try:
        with _connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO users (email, password_salt, password_hash, is_active, is_admin, created_at, updated_at)
                VALUES (?, ?, ?, 1, ?, ?, ?)
                """,
                (normalized_email, salt_hex, password_hash, 1 if is_admin else 0, now, now),
            )
            connection.commit()
            user_id = int(cursor.lastrowid)
    except sqlite3.IntegrityError as exc:
        raise AuthError(f"User '{normalized_email}' already exists.") from exc

    return AuthUser(id=user_id, email=normalized_email, is_admin=is_admin, is_active=True)


def set_user_password(email: str, password: str) -> AuthUser:
    ensure_auth_db()
    normalized_email = normalize_email(email)
    validated_password = validate_password(password)
    salt_hex, password_hash = _hash_password(validated_password)
    now = int(time.time())

    with _connect() as connection:
        cursor = connection.execute(
            """
            UPDATE users
            SET password_salt = ?, password_hash = ?, updated_at = ?
            WHERE email = ?
            """,
            (salt_hex, password_hash, now, normalized_email),
        )
        connection.commit()
        if cursor.rowcount == 0:
            raise AuthError(f"User '{normalized_email}' was not found.")
        row = connection.execute(
            "SELECT id, email, is_admin, is_active FROM users WHERE email = ?",
            (normalized_email,),
        ).fetchone()
    user = _row_to_user(row)
    if user is None:
        raise AuthError(f"User '{normalized_email}' was not found.")
    return user


def set_user_active(email: str, is_active: bool) -> AuthUser:
    ensure_auth_db()
    normalized_email = normalize_email(email)
    now = int(time.time())

    with _connect() as connection:
        cursor = connection.execute(
            "UPDATE users SET is_active = ?, updated_at = ? WHERE email = ?",
            (1 if is_active else 0, now, normalized_email),
        )
        connection.commit()
        if cursor.rowcount == 0:
            raise AuthError(f"User '{normalized_email}' was not found.")
        row = connection.execute(
            "SELECT id, email, is_admin, is_active FROM users WHERE email = ?",
            (normalized_email,),
        ).fetchone()
    user = _row_to_user(row)
    if user is None:
        raise AuthError(f"User '{normalized_email}' was not found.")
    return user


def get_user_by_id(user_id: int) -> AuthUser | None:
    ensure_auth_db()
    with _connect() as connection:
        row = connection.execute(
            "SELECT id, email, is_admin, is_active FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    return _row_to_user(row)


def authenticate_user(email: str, password: str) -> AuthUser | None:
    ensure_auth_db()
    normalized_email = normalize_email(email)
    password = password.strip()

    with _connect() as connection:
        row = connection.execute(
            """
            SELECT id, email, password_salt, password_hash, is_active, is_admin
            FROM users
            WHERE email = ?
            """,
            (normalized_email,),
        ).fetchone()

    if row is None or not bool(row["is_active"]):
        return None

    _, candidate_hash = _hash_password(password, str(row["password_salt"]))
    if not hmac.compare_digest(candidate_hash, str(row["password_hash"])):
        return None

    return AuthUser(
        id=int(row["id"]),
        email=str(row["email"]),
        is_admin=bool(row["is_admin"]),
        is_active=bool(row["is_active"]),
    )
