"""Feedback centre — what people send us, in one place (docs/feedback-centre.md).

Five kinds: ``contact``, ``bug``, ``help`` (assistance), ``feature`` (a
request) and ``error`` (the diagnostic bundle the error screens assemble,
``apps/web/lib/error-report.ts``). Guests may write too (an email to answer
them is optional); signed-in people see what they sent and its status. Staff
triage it in the supervision panel: ``new`` → ``in_progress`` → ``resolved``
(or ``closed`` when there is nothing to do).

Privacy: a diagnostic bundle carries the sanitized message, the technical
detail, breadcrumbs, the page and the user agent — no Quran content,
notebook or research text (docs/error-reporting.md). Nothing else is
collected.
"""

from __future__ import annotations

import json
import time

from src.app.services import app_data_service

KINDS = ("contact", "bug", "help", "feature", "error")
STATUSES = ("new", "in_progress", "resolved", "closed")
MAX_MESSAGE = 4000
MAX_DETAIL_BYTES = 32_000
PAGE_SIZE = 50


class FeedbackError(ValueError):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.status = status


def ensure_tables(connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'new',
            user_id INTEGER,
            email TEXT,
            message TEXT NOT NULL DEFAULT '',
            detail TEXT,
            url TEXT,
            user_agent TEXT,
            language TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            assigned_to INTEGER,
            staff_note TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_feedback_triage ON feedback (status, kind, id);
        CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback (user_id, id);
        """
    )


def _item(row, *, staff: bool) -> dict:
    item = {
        "id": int(row["id"]),
        "kind": row["kind"],
        "status": row["status"],
        "message": row["message"],
        "created_at": int(row["created_at"]),
        "updated_at": int(row["updated_at"]),
    }
    if staff:
        item.update(
            {
                "user_id": row["user_id"],
                "email": row["email"],
                "detail": json.loads(row["detail"]) if row["detail"] else None,
                "url": row["url"],
                "user_agent": row["user_agent"],
                "language": row["language"],
                "assigned_to": row["assigned_to"],
                "staff_note": row["staff_note"],
            }
        )
    return item


def submit(
    kind: str,
    message: str,
    *,
    user_id: int | None,
    email: str | None = None,
    detail: dict | None = None,
    url: str | None = None,
    user_agent: str | None = None,
    language: str | None = None,
) -> dict:
    if kind not in KINDS:
        raise FeedbackError("Unknown kind.")
    text = (message or "").strip()[:MAX_MESSAGE]
    if kind != "error" and not text:
        raise FeedbackError("Write a message.")
    encoded = None
    if kind == "error":
        if not detail:
            raise FeedbackError("A diagnostic report needs its detail.")
        encoded = json.dumps(detail, ensure_ascii=False)
        if len(encoded.encode("utf-8")) > MAX_DETAIL_BYTES:
            raise FeedbackError("The diagnostic report is too large.", status=413)
    now = int(time.time())
    with app_data_service.connect() as connection:
        cursor = connection.execute(
            "INSERT INTO feedback (kind, user_id, email, message, detail, url, user_agent, language, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                kind,
                user_id,
                (email or "").strip()[:200] or None,
                text,
                encoded,
                (url or "")[:500] or None,
                (user_agent or "")[:300] or None,
                (language or "")[:12] or None,
                now,
                now,
            ),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM feedback WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return _item(row, staff=False)


def mine(user_id: int) -> list[dict]:
    with app_data_service.connect() as connection:
        rows = connection.execute(
            "SELECT * FROM feedback WHERE user_id = ? AND kind != 'error' ORDER BY id DESC LIMIT 100", (user_id,)
        ).fetchall()
    return [_item(row, staff=False) for row in rows]


def triage_list(status: str | None = None, kind: str | None = None, before: int | None = None) -> dict:
    """Newest first, ``PAGE_SIZE`` at a time (``before`` = the last id seen), with the counts per status."""
    where, params = [], []
    if status:
        where.append("status = ?")
        params.append(status)
    if kind:
        where.append("kind = ?")
        params.append(kind)
    if before:
        where.append("id < ?")
        params.append(before)
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    with app_data_service.connect() as connection:
        rows = connection.execute(
            f"SELECT * FROM feedback {clause} ORDER BY id DESC LIMIT ?", (*params, PAGE_SIZE + 1)
        ).fetchall()
        counts = {row["status"]: int(row["n"]) for row in connection.execute("SELECT status, COUNT(*) AS n FROM feedback GROUP BY status")}
    page = rows[:PAGE_SIZE]
    return {
        "items": [_item(row, staff=True) for row in page],
        "next_before": int(page[-1]["id"]) if len(rows) > PAGE_SIZE else None,
        "counts": {status_name: counts.get(status_name, 0) for status_name in STATUSES},
    }


def update(feedback_id: int, *, status: str | None, staff_note: str | None, assigned_to: int | None, actor_id: int) -> dict:
    if status is not None and status not in STATUSES:
        raise FeedbackError("Unknown status.")
    with app_data_service.connect() as connection:
        row = connection.execute("SELECT * FROM feedback WHERE id = ?", (feedback_id,)).fetchone()
        if row is None:
            raise FeedbackError("Not found.", status=404)
        connection.execute(
            "UPDATE feedback SET status = ?, staff_note = ?, assigned_to = ?, updated_at = ? WHERE id = ?",
            (
                status or row["status"],
                row["staff_note"] if staff_note is None else (staff_note.strip()[:2000] or None),
                assigned_to if assigned_to is not None else (row["assigned_to"] or actor_id),
                int(time.time()),
                feedback_id,
            ),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM feedback WHERE id = ?", (feedback_id,)).fetchone()
    return _item(row, staff=True)


def open_count(connection) -> int:
    (count,) = connection.execute("SELECT COUNT(*) FROM feedback WHERE status IN ('new', 'in_progress')").fetchone()
    return int(count)


def delete_user(user_id: int, connection) -> None:
    connection.execute("DELETE FROM feedback WHERE user_id = ?", (user_id,))
