from __future__ import annotations

from dataclasses import dataclass
import hashlib
import hmac
import os
from pathlib import Path
import secrets
import sqlite3
import time

from src.app.core import config

# A session lives 14 days, and every authenticated request slides the window
# forward (see ``resolve_session``). The raw token is delivered once — as an
# httpOnly cookie for the web app, or as a Bearer token for native clients —
# and only its sha256 hash is ever stored.
SESSION_TTL_SECONDS = 60 * 60 * 24 * 14


@dataclass(frozen=True)
class AuthUser:
    id: int
    email: str
    is_admin: bool
    is_active: bool
    name: str | None = None
    avatar: str | None = None
    onboarded: bool = False


@dataclass(frozen=True)
class AuthSession:
    """One row of the ``sessions`` table — a device holding a live token."""

    id: int
    user_id: int
    device_label: str | None
    platform: str | None
    created_at: int
    last_seen_at: int
    expires_at: int


@dataclass(frozen=True)
class ResolvedSession:
    """The identity a presented token resolves to."""

    user: AuthUser
    session_id: int


class AuthError(ValueError):
    """Raised when auth management input is invalid."""


class EmailAlreadyExistsError(AuthError):
    """Raised when signup targets an email that is already registered."""


# A fixed salt used only to burn an equivalent scrypt on the login miss path, so
# an unknown email costs the same wall-clock as a known one (no enumeration oracle).
_DUMMY_PASSWORD_SALT_HEX = "00" * 16


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


def _clean_name(name: str | None) -> str | None:
    if name is None:
        return None
    cleaned = name.strip()
    return cleaned[:80] if cleaned else None


def _connect() -> sqlite3.Connection:
    db_path = Path(config.get_auth_db_path())
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    return connection


def _column_names(connection: sqlite3.Connection, table: str) -> set[str]:
    rows = connection.execute(f"PRAGMA table_info({table})").fetchall()
    return {str(row["name"]) for row in rows}


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

            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                device_label TEXT,
                platform TEXT,
                created_at INTEGER NOT NULL,
                last_seen_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                revoked_at INTEGER
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token_hash);
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id, last_seen_at);
            """
        )
        # Idempotent identity-column migration (name / avatar medallion / onboarded).
        existing = _column_names(connection, "users")
        if "name" not in existing:
            connection.execute("ALTER TABLE users ADD COLUMN name TEXT")
        if "avatar" not in existing:
            connection.execute("ALTER TABLE users ADD COLUMN avatar TEXT")
        if "onboarded" not in existing:
            connection.execute("ALTER TABLE users ADD COLUMN onboarded INTEGER NOT NULL DEFAULT 0")
        connection.commit()


def _hash_password(password: str, salt_hex: str | None = None) -> tuple[str, str]:
    salt = bytes.fromhex(salt_hex) if salt_hex else os.urandom(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=64)
    return salt.hex(), digest.hex()


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


_USER_COLUMNS = "id, email, is_admin, is_active, name, avatar, onboarded"


def _row_to_user(row: sqlite3.Row | None) -> AuthUser | None:
    if row is None:
        return None
    keys = set(row.keys())
    return AuthUser(
        id=int(row["id"]),
        email=str(row["email"]),
        is_admin=bool(row["is_admin"]),
        is_active=bool(row["is_active"]),
        name=(str(row["name"]) if "name" in keys and row["name"] is not None else None),
        avatar=(str(row["avatar"]) if "avatar" in keys and row["avatar"] is not None else None),
        onboarded=(bool(row["onboarded"]) if "onboarded" in keys else False),
    )


def count_users() -> int:
    ensure_auth_db()
    with _connect() as connection:
        row = connection.execute("SELECT COUNT(*) AS count FROM users").fetchone()
    return int(row["count"]) if row else 0


def list_users() -> list[AuthUser]:
    ensure_auth_db()
    with _connect() as connection:
        rows = connection.execute(f"SELECT {_USER_COLUMNS} FROM users ORDER BY email ASC").fetchall()
    return [user for row in rows if (user := _row_to_user(row)) is not None]


def create_user(email: str, password: str, *, name: str | None = None, is_admin: bool = False) -> AuthUser:
    ensure_auth_db()
    normalized_email = normalize_email(email)
    validated_password = validate_password(password)
    cleaned_name = _clean_name(name)
    salt_hex, password_hash = _hash_password(validated_password)
    now = int(time.time())

    try:
        with _connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO users
                    (email, password_salt, password_hash, is_active, is_admin, name, onboarded, created_at, updated_at)
                VALUES (?, ?, ?, 1, ?, ?, 0, ?, ?)
                """,
                (normalized_email, salt_hex, password_hash, 1 if is_admin else 0, cleaned_name, now, now),
            )
            connection.commit()
            user_id = int(cursor.lastrowid)
    except sqlite3.IntegrityError as exc:
        raise EmailAlreadyExistsError(f"User '{normalized_email}' already exists.") from exc

    return AuthUser(
        id=user_id,
        email=normalized_email,
        is_admin=is_admin,
        is_active=True,
        name=cleaned_name,
        avatar=None,
        onboarded=False,
    )


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
            f"SELECT {_USER_COLUMNS} FROM users WHERE email = ?",
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
            f"SELECT {_USER_COLUMNS} FROM users WHERE email = ?",
            (normalized_email,),
        ).fetchone()
    user = _row_to_user(row)
    if user is None:
        raise AuthError(f"User '{normalized_email}' was not found.")
    return user


def update_profile(
    user_id: int,
    *,
    name: str | None = None,
    avatar: str | None = None,
    onboarded: bool | None = None,
) -> AuthUser:
    """Set the display name, medallion avatar, and/or onboarding flag."""
    ensure_auth_db()
    fields: list[str] = []
    values: list[object] = []
    if name is not None:
        fields.append("name = ?")
        values.append(_clean_name(name))
    if avatar is not None:
        fields.append("avatar = ?")
        values.append(avatar.strip()[:8] or None)
    if onboarded is not None:
        fields.append("onboarded = ?")
        values.append(1 if onboarded else 0)

    with _connect() as connection:
        if fields:
            fields.append("updated_at = ?")
            values.append(int(time.time()))
            values.append(user_id)
            cursor = connection.execute(
                f"UPDATE users SET {', '.join(fields)} WHERE id = ?",
                tuple(values),
            )
            connection.commit()
            if cursor.rowcount == 0:
                raise AuthError("User was not found.")
        row = connection.execute(
            f"SELECT {_USER_COLUMNS} FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    user = _row_to_user(row)
    if user is None:
        raise AuthError("User was not found.")
    return user


def get_user_by_id(user_id: int) -> AuthUser | None:
    ensure_auth_db()
    with _connect() as connection:
        row = connection.execute(
            f"SELECT {_USER_COLUMNS} FROM users WHERE id = ?",
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
            SELECT id, email, password_salt, password_hash, is_active, is_admin, name, avatar, onboarded
            FROM users
            WHERE email = ?
            """,
            (normalized_email,),
        ).fetchone()

    if row is None or not bool(row["is_active"]):
        # Burn an equivalent scrypt so a missing/inactive account is not
        # distinguishable from a wrong password by response time.
        _hash_password(password, _DUMMY_PASSWORD_SALT_HEX)
        return None

    _, candidate_hash = _hash_password(password, str(row["password_salt"]))
    if not hmac.compare_digest(candidate_hash, str(row["password_hash"])):
        return None

    return _row_to_user(row)


# ---------------------------------------------------------------------------
# Sessions / devices — one row per live token, cookie (web) or bearer (native)
# ---------------------------------------------------------------------------


def _row_to_session(row: sqlite3.Row) -> AuthSession:
    return AuthSession(
        id=int(row["id"]),
        user_id=int(row["user_id"]),
        device_label=(str(row["device_label"]) if row["device_label"] is not None else None),
        platform=(str(row["platform"]) if row["platform"] is not None else None),
        created_at=int(row["created_at"]),
        last_seen_at=int(row["last_seen_at"]),
        expires_at=int(row["expires_at"]),
    )


def create_session(
    user_id: int,
    *,
    device_label: str | None = None,
    platform: str | None = "web",
) -> tuple[str, AuthSession]:
    """Mint a new session for ``user_id``. Returns ``(raw_token, session)``.

    The raw token is returned exactly once and never stored — only its
    sha256 hash lands in the ``sessions`` table.
    """
    ensure_auth_db()
    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw_token)
    now = int(time.time())
    expires_at = now + SESSION_TTL_SECONDS
    label = (device_label.strip()[:120] if device_label else None) or None
    plat = (platform.strip()[:16] if platform else None) or "web"

    with _connect() as connection:
        cursor = connection.execute(
            """
            INSERT INTO sessions
                (user_id, token_hash, device_label, platform, created_at, last_seen_at, expires_at, revoked_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
            """,
            (user_id, token_hash, label, plat, now, now, expires_at),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM sessions WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return raw_token, _row_to_session(row)


def resolve_session(raw_token: str | None) -> ResolvedSession | None:
    """Resolve a presented token to its user, sliding the expiry window.

    Returns ``None`` when the token is missing, unknown, revoked, expired, or
    the user is inactive. Expired rows are lazily deleted.
    """
    if not raw_token:
        return None
    ensure_auth_db()
    token_hash = _hash_token(raw_token)
    now = int(time.time())

    with _connect() as connection:
        row = connection.execute(
            "SELECT * FROM sessions WHERE token_hash = ?",
            (token_hash,),
        ).fetchone()
        if row is None or row["revoked_at"] is not None:
            return None
        if int(row["expires_at"]) <= now:
            connection.execute("DELETE FROM sessions WHERE id = ?", (int(row["id"]),))
            connection.commit()
            return None

        user_row = connection.execute(
            f"SELECT {_USER_COLUMNS} FROM users WHERE id = ?",
            (int(row["user_id"]),),
        ).fetchone()
        user = _row_to_user(user_row)
        if user is None or not user.is_active:
            return None

        # Slide the window forward on activity.
        connection.execute(
            "UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?",
            (now, now + SESSION_TTL_SECONDS, int(row["id"])),
        )
        connection.commit()

    return ResolvedSession(user=user, session_id=int(row["id"]))


def list_sessions(user_id: int) -> list[AuthSession]:
    """Active (non-revoked, non-expired) sessions for a user, newest first."""
    ensure_auth_db()
    now = int(time.time())
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT * FROM sessions
            WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
            ORDER BY last_seen_at DESC
            """,
            (user_id, now),
        ).fetchall()
    return [_row_to_session(row) for row in rows]


def revoke_session(session_id: int, user_id: int) -> bool:
    """Eject a device: revoke one session, scoped to its owner."""
    ensure_auth_db()
    now = int(time.time())
    with _connect() as connection:
        cursor = connection.execute(
            "UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
            (now, session_id, user_id),
        )
        connection.commit()
        return cursor.rowcount > 0


def revoke_session_by_token(raw_token: str | None) -> bool:
    """Revoke the session identified by a raw token (logout of current device)."""
    if not raw_token:
        return False
    ensure_auth_db()
    now = int(time.time())
    with _connect() as connection:
        cursor = connection.execute(
            "UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
            (now, _hash_token(raw_token)),
        )
        connection.commit()
        return cursor.rowcount > 0
