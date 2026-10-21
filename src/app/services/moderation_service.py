"""Community moderation — trust levels, the checking batches, the moderators' queue,
decisions, strikes, bans and appeals (docs/community-moderation-design.md).

The flow, in short:

- Publishing runs the deterministic audit at once (it still blocks) and then
  *queues* the post; commenting saves the comment. Nothing calls the agent in
  the request.
- :func:`run_batch` (every ``QBASAIR_MODERATION_INTERVAL_SECONDS``, 15 minutes
  by default — see ``src/app/workers/moderation_worker.py``) checks queued
  posts, unchecked comments and reported items with the agent
  (``audit_agent_service``), in the author's interface language, and routes
  them by the author's trust level. Reported items are also checked between
  batches (:func:`run_priority`).
- Every ``unsure`` and ``declined`` goes to a person, and so does each post of
  an unverified author. A moderator's decision is final; declines they uphold
  count as strikes; the third makes the author *suspicious*; moderators may ban
  from posting for 7 or 30 days, admins permanently. An author may appeal a
  decision once; another moderator reviews it.

Nobody moderates their own content (except the single local user when
accounts are off). Every human action is logged in ``moderation_actions``.
"""

from __future__ import annotations

import json
import threading
import time
from datetime import datetime, timezone

from src.app.core import config
from src.app.services import app_data_service, audit_agent_service, auth_service, community_service, feedback_service

PERMANENT = -1
BAN_DAYS = (7, 30)
SUSPICIOUS_STRIKES = 3
REPORTS_TO_HIDE = 3
BATCH_LIMIT = 200
QUEUE_REASONS = ("first_post", "unsure", "declined", "reported")
POST_DECISIONS = ("approve", "decline", "remove", "restore")
COMMENT_DECISIONS = ("approve", "decline", "restore")
# Decisions that count against the author once a moderator takes them.
_STRIKES = {"decline", "remove"}


class ModerationError(ValueError):
    """A refused moderation action; ``status`` is the HTTP status to return."""

    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.status = status


def ensure_tables(connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS user_trust (
            user_id INTEGER PRIMARY KEY,
            level TEXT NOT NULL DEFAULT 'unverified',
            upheld_declines INTEGER NOT NULL DEFAULT 0,
            banned_until INTEGER,
            ban_reason TEXT,
            banned_by INTEGER,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS moderation_checks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_type TEXT NOT NULL,
            item_id TEXT NOT NULL,
            item_version INTEGER NOT NULL DEFAULT 1,
            stage TEXT NOT NULL,
            verdict TEXT NOT NULL,
            confidence REAL,
            issues TEXT NOT NULL DEFAULT '[]',
            model TEXT,
            guidelines_version TEXT,
            language TEXT,
            actor_id INTEGER,
            note TEXT,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_checks_item ON moderation_checks (item_type, item_id, id);
        CREATE INDEX IF NOT EXISTS idx_checks_day ON moderation_checks (stage, created_at);

        CREATE TABLE IF NOT EXISTS moderation_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_type TEXT NOT NULL,
            item_id TEXT NOT NULL,
            reason TEXT NOT NULL,
            opened_at INTEGER NOT NULL,
            decided_at INTEGER,
            decided_by INTEGER,
            decision TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_open ON moderation_queue (item_type, item_id) WHERE decided_at IS NULL;

        CREATE TABLE IF NOT EXISTS moderation_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            actor_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id TEXT NOT NULL,
            subject_user_id INTEGER,
            reason TEXT,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_actions_target ON moderation_actions (target_type, target_id, id);
        CREATE INDEX IF NOT EXISTS idx_actions_actor ON moderation_actions (actor_id, id);

        CREATE TABLE IF NOT EXISTS appeals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            action_id INTEGER NOT NULL UNIQUE,
            target_type TEXT NOT NULL,
            target_id TEXT NOT NULL,
            message TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            created_at INTEGER NOT NULL,
            decided_by INTEGER,
            decided_at INTEGER,
            note TEXT
        );

        CREATE TABLE IF NOT EXISTS moderation_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            started_at INTEGER NOT NULL,
            finished_at INTEGER,
            checked INTEGER NOT NULL DEFAULT 0,
            errors INTEGER NOT NULL DEFAULT 0,
            budget_reached INTEGER NOT NULL DEFAULT 0
        );
        """
    )
    # Earlier publications reviewed at publish time (post_reviews) keep their history.
    (migrated,) = connection.execute("SELECT COUNT(*) FROM moderation_checks WHERE item_type = 'post'").fetchone()
    if not migrated:
        connection.execute(
            "INSERT INTO moderation_checks (item_type, item_id, item_version, stage, verdict, issues, model, "
            "guidelines_version, actor_id, note, created_at) "
            "SELECT 'post', post_id, document_version, CASE stage WHEN 'ai' THEN 'agent' ELSE stage END, verdict, "
            "issues, model, guidelines_version, reviewer_id, note, created_at FROM post_reviews ORDER BY id"
        )


def _now() -> int:
    return int(time.time())


# ----------------------------------------------------------------------
# People: staff, trust, bans
# ----------------------------------------------------------------------


def is_staff(user_id: int) -> bool:
    """Admins and moderators; with accounts off, the single local user."""
    if not config.is_auth_enabled():
        return True
    user = auth_service.get_user_by_id(user_id)
    return bool(user and user.is_active and user.is_staff)


def is_admin(user_id: int) -> bool:
    if not config.is_auth_enabled():
        return True
    user = auth_service.get_user_by_id(user_id)
    return bool(user and user.is_active and user.is_admin)


def _trust_row(connection, user_id: int):
    return connection.execute("SELECT * FROM user_trust WHERE user_id = ?", (user_id,)).fetchone()


def _set_trust(connection, user_id: int, **fields) -> None:
    if _trust_row(connection, user_id) is None:
        connection.execute("INSERT INTO user_trust (user_id, updated_at) VALUES (?, ?)", (user_id, _now()))
    assignments = ", ".join(f"{name} = ?" for name in fields)
    connection.execute(
        f"UPDATE user_trust SET {assignments}, updated_at = ? WHERE user_id = ?", (*fields.values(), _now(), user_id)
    )


def _is_banned(row, now: int | None = None) -> bool:
    if row is None or row["banned_until"] is None:
        return False
    return int(row["banned_until"]) == PERMANENT or int(row["banned_until"]) > (now or _now())


def standing(user_id: int, connection=None) -> dict:
    """The author's trust level, strikes and ban, as the moderation rules see them."""
    if connection is None:
        with app_data_service.connect() as own:
            return standing(user_id, own)
    row = _trust_row(connection, user_id)
    staff = is_staff(user_id)
    banned = _is_banned(row)
    strikes = int(row["upheld_declines"]) if row else 0
    return {
        "user_id": user_id,
        # Staff and the local user publish as verified authors.
        "level": "verified" if staff else (row["level"] if row else "unverified"),
        "upheld_declines": strikes,
        "suspicious": strikes >= SUSPICIOUS_STRIKES,
        "banned": banned,
        "banned_until": (int(row["banned_until"]) if banned else None),
        "ban_reason": (row["ban_reason"] if banned else None),
        "is_staff": staff,
    }


def ensure_can_post(user_id: int) -> None:
    """Raise when the user is banned from posting and commenting."""
    info = standing(user_id)
    if info["banned"]:
        raise community_service.CommunityError(
            "Posting is suspended for this account.",
            status=403,
            code="banned",
            extra={"banned_until": info["banned_until"], "reason": info["ban_reason"]},
        )


def author_language(user_id: int) -> str:
    """The author's interface language: the agent writes its reasons in it."""
    try:
        return str(app_data_service.get_preferences(user_id).get("ui_language") or "ar")
    except Exception:  # noqa: BLE001 — a missing preference never blocks a check
        return "ar"


# ----------------------------------------------------------------------
# Checks, queue, action log
# ----------------------------------------------------------------------


def record_check(connection, item_type: str, item_id: str, version: int, stage: str, verdict: str, **extra) -> None:
    connection.execute(
        "INSERT INTO moderation_checks (item_type, item_id, item_version, stage, verdict, confidence, issues, model, "
        "guidelines_version, language, actor_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            item_type,
            str(item_id),
            version,
            stage,
            verdict,
            extra.get("confidence"),
            json.dumps(extra.get("issues") or [], ensure_ascii=False),
            extra.get("model"),
            extra.get("guidelines_version"),
            extra.get("language"),
            extra.get("actor_id"),
            extra.get("note"),
            _now(),
        ),
    )


def checks_for(connection, item_type: str, item_id: str, limit: int = 8) -> list[dict]:
    rows = connection.execute(
        "SELECT * FROM moderation_checks WHERE item_type = ? AND item_id = ? ORDER BY id DESC LIMIT ?",
        (item_type, str(item_id), limit),
    ).fetchall()
    return [
        {
            "stage": row["stage"],
            "verdict": row["verdict"],
            "confidence": row["confidence"],
            "issues": json.loads(row["issues"] or "[]"),
            "language": row["language"],
            "note": row["note"],
            "created_at": int(row["created_at"]),
        }
        for row in rows
    ]


_REASON_RANK = {"first_post": 0, "unsure": 1, "reported": 2, "declined": 3}


def open_queue(connection, item_type: str, item_id: str, reason: str) -> None:
    """Put an item in front of a person (one open entry per item; the strongest reason wins)."""
    row = connection.execute(
        "SELECT id, reason FROM moderation_queue WHERE item_type = ? AND item_id = ? AND decided_at IS NULL",
        (item_type, str(item_id)),
    ).fetchone()
    if row is None:
        connection.execute(
            "INSERT INTO moderation_queue (item_type, item_id, reason, opened_at) VALUES (?, ?, ?, ?)",
            (item_type, str(item_id), reason, _now()),
        )
    elif _REASON_RANK.get(reason, 0) > _REASON_RANK.get(row["reason"], 0):
        connection.execute("UPDATE moderation_queue SET reason = ? WHERE id = ?", (reason, row["id"]))


def _close_queue(connection, item_type: str, item_id: str, actor_id: int | None, decision: str) -> None:
    connection.execute(
        "UPDATE moderation_queue SET decided_at = ?, decided_by = ?, decision = ? "
        "WHERE item_type = ? AND item_id = ? AND decided_at IS NULL",
        (_now(), actor_id, decision, item_type, str(item_id)),
    )


def _log(connection, actor_id: int, action: str, target_type: str, target_id, subject_user_id: int | None, reason) -> int:
    cursor = connection.execute(
        "INSERT INTO moderation_actions (actor_id, action, target_type, target_id, subject_user_id, reason, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (actor_id, action, target_type, str(target_id), subject_user_id, (reason or "").strip() or None, _now()),
    )
    return int(cursor.lastrowid)


def _strike(connection, user_id: int, delta: int) -> None:
    row = _trust_row(connection, user_id)
    strikes = max(0, (int(row["upheld_declines"]) if row else 0) + delta)
    _set_trust(connection, user_id, upheld_declines=strikes)


# ----------------------------------------------------------------------
# The batches
# ----------------------------------------------------------------------

_batch_lock = threading.Lock()


def _utc_day_start(now: int) -> int:
    moment = datetime.fromtimestamp(now, tz=timezone.utc)
    return int(moment.replace(hour=0, minute=0, second=0, microsecond=0).timestamp())


def budget_left(connection, now: int | None = None) -> int:
    moment = now or _now()
    (used,) = connection.execute(
        "SELECT COUNT(*) FROM moderation_checks WHERE stage = 'agent' AND created_at >= ?", (_utc_day_start(moment),)
    ).fetchone()
    return max(0, config.get_moderation_daily_budget() - int(used))


def _post_under_review(row) -> tuple[dict, int] | None:
    """(snapshot payload, version) of the version a post is waiting with, if any."""
    if row["candidate_state"] == "queued" and row["candidate_snapshot"]:
        return json.loads(row["candidate_snapshot"]), int(row["candidate_version"])
    if row["status"] == "queued":
        return json.loads(row["snapshot"]), int(row["document_version"])
    return None


def _route_post(connection, row, verdict: str, author: dict) -> None:
    """Apply an agent verdict to a queued post (or its queued new version)."""
    post_id = row["id"]
    is_candidate = row["candidate_state"] == "queued"
    if verdict == "declined":
        # Any agent decline returns the author to unverified (not a strike).
        _set_trust(connection, int(row["user_id"]), level="unverified")
    if verdict == "valid" and author["level"] == "verified":
        community_service.publish_reviewed_version(connection, row)
        return
    reason = {"valid": "first_post", "unsure": "unsure", "declined": "declined"}[verdict]
    if is_candidate:
        connection.execute("UPDATE posts SET candidate_state = 'pending_review' WHERE id = ?", (post_id,))
    else:
        connection.execute("UPDATE posts SET status = 'pending_review', updated_at = ? WHERE id = ?", (_now(), post_id))
    open_queue(connection, "post", post_id, reason)


def _route_comment(connection, row, verdict: str, author: dict) -> None:
    comment_id = int(row["id"])
    if verdict == "declined":
        _set_trust(connection, int(row["user_id"]), level="unverified")
    connection.execute("UPDATE post_comments SET checked = 1 WHERE id = ?", (comment_id,))
    if verdict == "valid":
        if row["status"] == "pending":
            connection.execute("UPDATE post_comments SET status = 'visible' WHERE id = ?", (comment_id,))
            community_service.refresh_comment_count(connection, row["post_id"])
        return
    if row["status"] == "visible":
        # A verified author's comment showed at once; it is hidden until a person decides.
        connection.execute("UPDATE post_comments SET status = 'hidden' WHERE id = ?", (comment_id,))
        community_service.refresh_comment_count(connection, row["post_id"])
    open_queue(connection, "comment", comment_id, "declined" if verdict == "declined" else "unsure")


def _check_post(connection, row) -> str:
    under_review = _post_under_review(row)
    if under_review is None:
        return "skipped"
    payload, version = under_review
    author_id = int(row["user_id"])
    result = audit_agent_service.check_post(payload.get("document") or {}, author_language(author_id))
    record_check(connection, "post", row["id"], version, "agent", result["verdict"], **_check_extra(result))
    _route_post(connection, row, result["verdict"], standing(author_id, connection))
    return result["verdict"] if not result.get("fallback_reason") else "error"


def _check_comment(connection, row) -> str:
    post = connection.execute("SELECT title, snapshot FROM posts WHERE id = ?", (row["post_id"],)).fetchone()
    document = (json.loads(post["snapshot"]).get("document") or {}) if post else {}
    author_id = int(row["user_id"])
    result = audit_agent_service.check_comment(
        row["body"], {"title": document.get("title"), "summary": document.get("summary")}, author_language(author_id)
    )
    record_check(connection, "comment", row["id"], 1, "agent", result["verdict"], **_check_extra(result))
    _route_comment(connection, row, result["verdict"], standing(author_id, connection))
    return result["verdict"] if not result.get("fallback_reason") else "error"


def _check_reported(connection, item_type: str, item_id: str) -> str:
    """A reported item is checked again at once; a decline hides it until a person decides."""
    if item_type == "post":
        row = connection.execute("SELECT * FROM posts WHERE id = ?", (item_id,)).fetchone()
        if row is None:
            return "skipped"
        payload = json.loads(row["snapshot"])
        result = audit_agent_service.check_post(payload.get("document") or {}, author_language(int(row["user_id"])))
        record_check(connection, "post", item_id, int(row["document_version"]), "agent", result["verdict"], **_check_extra(result))
        if result["verdict"] == "declined":
            connection.execute("UPDATE posts SET report_hidden = 1 WHERE id = ?", (item_id,))
            community_service.invalidate_trending()
    else:
        row = connection.execute("SELECT * FROM post_comments WHERE id = ?", (int(item_id),)).fetchone()
        if row is None:
            return "skipped"
        post = connection.execute("SELECT snapshot FROM posts WHERE id = ?", (row["post_id"],)).fetchone()
        document = (json.loads(post["snapshot"]).get("document") or {}) if post else {}
        result = audit_agent_service.check_comment(row["body"], document, author_language(int(row["user_id"])))
        record_check(connection, "comment", item_id, 1, "agent", result["verdict"], **_check_extra(result))
        if result["verdict"] == "declined":
            connection.execute("UPDATE post_comments SET report_hidden = 1 WHERE id = ?", (int(item_id),))
    connection.execute(
        "UPDATE reports SET checked = 1 WHERE target_type = ? AND target_id = ? AND checked = 0", (item_type, str(item_id))
    )
    return result["verdict"] if not result.get("fallback_reason") else "error"


def _check_extra(result: dict) -> dict:
    return {
        "confidence": result.get("confidence"),
        "issues": result.get("issues"),
        "model": result.get("model"),
        "guidelines_version": result.get("guidelines_version"),
        "language": result.get("language"),
        "note": result.get("fallback_reason"),
    }


def _run(kind: str, steps) -> dict:
    """Run check steps under the daily budget; one transaction per item."""
    if not _batch_lock.acquire(blocking=False):
        return {"kind": kind, "checked": 0, "errors": 0, "budget_reached": False, "skipped": "busy"}
    try:
        started = _now()
        checked = errors = 0
        budget_reached = False
        with app_data_service.connect() as connection:
            run_id = connection.execute(
                "INSERT INTO moderation_runs (kind, started_at) VALUES (?, ?)", (kind, started)
            ).lastrowid
            connection.commit()
            for step in steps(connection):
                if budget_left(connection) <= 0:
                    budget_reached = True
                    break
                outcome = step()
                connection.commit()
                if outcome == "skipped":
                    continue
                checked += 1
                errors += outcome == "error"
            connection.execute(
                "UPDATE moderation_runs SET finished_at = ?, checked = ?, errors = ?, budget_reached = ? WHERE id = ?",
                (_now(), checked, errors, 1 if budget_reached else 0, run_id),
            )
            connection.commit()
        community_service.invalidate_trending()
        return {"kind": kind, "checked": checked, "errors": errors, "budget_reached": budget_reached}
    finally:
        _batch_lock.release()


def _reported_steps(connection):
    targets = connection.execute(
        "SELECT target_type, target_id, MIN(created_at) AS first FROM reports WHERE checked = 0 "
        "GROUP BY target_type, target_id ORDER BY first LIMIT ?",
        (BATCH_LIMIT,),
    ).fetchall()
    for target in targets:
        yield lambda target=target: _check_reported(connection, target["target_type"], target["target_id"])


def run_priority() -> dict:
    """Check reported items now (between batches)."""
    return _run("priority", _reported_steps)


def run_batch() -> dict:
    """One batch: reported items, then queued posts, then unchecked comments, oldest first."""

    def steps(connection):
        yield from _reported_steps(connection)
        posts = connection.execute(
            "SELECT * FROM posts WHERE status = 'queued' OR candidate_state = 'queued' ORDER BY updated_at LIMIT ?",
            (BATCH_LIMIT,),
        ).fetchall()
        for row in posts:
            yield lambda row=row: _check_post(connection, row)
        comments = connection.execute(
            "SELECT * FROM post_comments WHERE checked = 0 AND status IN ('visible', 'pending') ORDER BY id LIMIT ?",
            (BATCH_LIMIT,),
        ).fetchall()
        for row in comments:
            yield lambda row=row: _check_comment(connection, row)

    return _run("batch", steps)


# ----------------------------------------------------------------------
# Decisions
# ----------------------------------------------------------------------


def _ensure_not_own(author_id: int, actor_id: int) -> None:
    if config.is_auth_enabled() and author_id == actor_id:
        raise ModerationError("Moderators don't decide on their own content.", status=403)


def decide_post(post_id: str, decision: str, actor_id: int, note: str | None) -> dict:
    if decision not in POST_DECISIONS:
        raise ModerationError("Unknown decision.")
    if decision in ("decline", "remove") and not (note or "").strip():
        raise ModerationError("A reason is required; the author reads it.")
    with app_data_service.connect() as connection:
        row = connection.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
        if row is None:
            raise ModerationError("Post not found.", status=404)
        author_id = int(row["user_id"])
        _ensure_not_own(author_id, actor_id)
        version = int(row["candidate_version"] or row["document_version"]) if row["candidate_state"] else int(row["document_version"])
        if decision == "approve":
            if row["candidate_state"] or row["status"] in ("pending_review", "queued", "changes_requested"):
                community_service.publish_reviewed_version(connection, row)
                # A first post approved by a person makes the author verified.
                _set_trust(connection, author_id, level="verified")
        elif decision == "decline":
            if row["candidate_state"]:
                connection.execute("UPDATE posts SET candidate_state = 'changes_requested' WHERE id = ?", (post_id,))
            else:
                connection.execute(
                    "UPDATE posts SET status = 'changes_requested', updated_at = ? WHERE id = ?", (_now(), post_id)
                )
        elif decision == "remove":
            connection.execute(
                "UPDATE posts SET status = 'removed', report_hidden = 0, updated_at = ? WHERE id = ?", (_now(), post_id)
            )
        elif decision == "restore":
            status = "published" if row["status"] in ("removed", "published") and row["published_at"] else row["status"]
            connection.execute("UPDATE posts SET status = ?, report_hidden = 0 WHERE id = ?", (status, post_id))
        if decision in _STRIKES:
            _strike(connection, author_id, +1)
        record_check(connection, "post", post_id, version, "human", decision, actor_id=actor_id, note=note)
        _log(connection, actor_id, f"post_{decision}", "post", post_id, author_id, note)
        _close_queue(connection, "post", post_id, actor_id, decision)
        connection.execute(
            "UPDATE reports SET status = 'resolved' WHERE target_type = 'post' AND target_id = ? AND status = 'open'",
            (post_id,),
        )
        connection.commit()
    community_service.invalidate_trending()
    return community_service.get_post(post_id, actor_id, is_moderator=True) or {}


def decide_comment(comment_id: int, decision: str, actor_id: int, note: str | None) -> dict:
    if decision not in COMMENT_DECISIONS:
        raise ModerationError("Unknown decision.")
    if decision == "decline" and not (note or "").strip():
        raise ModerationError("A reason is required; the author reads it.")
    with app_data_service.connect() as connection:
        row = connection.execute("SELECT * FROM post_comments WHERE id = ?", (comment_id,)).fetchone()
        if row is None or row["status"] == "deleted":
            raise ModerationError("Comment not found.", status=404)
        author_id = int(row["user_id"])
        _ensure_not_own(author_id, actor_id)
        status = "declined" if decision == "decline" else "visible"
        connection.execute(
            "UPDATE post_comments SET status = ?, report_hidden = 0, checked = 1 WHERE id = ?", (status, comment_id)
        )
        if decision in _STRIKES:
            _strike(connection, author_id, +1)
        community_service.refresh_comment_count(connection, row["post_id"])
        record_check(connection, "comment", comment_id, 1, "human", decision, actor_id=actor_id, note=note)
        _log(connection, actor_id, f"comment_{decision}", "comment", comment_id, author_id, note)
        _close_queue(connection, "comment", comment_id, actor_id, decision)
        connection.execute(
            "UPDATE reports SET status = 'resolved' WHERE target_type = 'comment' AND target_id = ? AND status = 'open'",
            (str(comment_id),),
        )
        connection.commit()
        updated = connection.execute("SELECT * FROM post_comments WHERE id = ?", (comment_id,)).fetchone()
    community_service.invalidate_trending()
    return community_service.comment_row(updated, actor_id, staff=True)


# ----------------------------------------------------------------------
# Reports
# ----------------------------------------------------------------------


def on_report(connection, target_type: str, target_id: str) -> None:
    """A report queues the item for a person; three different reporters hide it meanwhile.
    (The agent re-checks it with the next priority run — ``reports.checked``.)"""
    open_queue(connection, target_type, target_id, "reported")
    (reporters,) = connection.execute(
        "SELECT COUNT(DISTINCT user_id) FROM reports WHERE target_type = ? AND target_id = ? AND status = 'open'",
        (target_type, str(target_id)),
    ).fetchone()
    if reporters >= REPORTS_TO_HIDE:
        if target_type == "post":
            connection.execute("UPDATE posts SET report_hidden = 1 WHERE id = ?", (target_id,))
        else:
            connection.execute("UPDATE post_comments SET report_hidden = 1 WHERE id = ?", (int(target_id),))


# ----------------------------------------------------------------------
# Bans
# ----------------------------------------------------------------------


def ban(user_id: int, days: int | None, actor_id: int, reason: str | None) -> dict:
    """Ban from posting and commenting: 7 or 30 days (moderators), or permanently (admins)."""
    if not (reason or "").strip():
        raise ModerationError("A reason is required.")
    if days is None and not is_admin(actor_id):
        raise ModerationError("Only an admin can ban permanently.", status=403)
    if days is not None and days not in BAN_DAYS:
        raise ModerationError("A ban lasts 7 or 30 days, or is permanent.")
    if user_id == actor_id:
        raise ModerationError("You can't ban yourself.", status=403)
    if is_staff(user_id) and config.is_auth_enabled() and not is_admin(actor_id):
        raise ModerationError("Only an admin can ban a moderator.", status=403)
    until = PERMANENT if days is None else _now() + days * 86400
    with app_data_service.connect() as connection:
        _set_trust(connection, user_id, banned_until=until, ban_reason=reason.strip(), banned_by=actor_id)
        _log(connection, actor_id, "ban_permanent" if days is None else f"ban_{days}d", "user", user_id, user_id, reason)
        connection.commit()
        return standing(user_id, connection)


def unban(user_id: int, actor_id: int, reason: str | None = None) -> dict:
    with app_data_service.connect() as connection:
        row = _trust_row(connection, user_id)
        if row is not None and int(row["banned_until"] or 0) == PERMANENT and not is_admin(actor_id):
            raise ModerationError("Only an admin can lift a permanent ban.", status=403)
        _set_trust(connection, user_id, banned_until=None, ban_reason=None, banned_by=None)
        _log(connection, actor_id, "unban", "user", user_id, user_id, reason)
        connection.commit()
        return standing(user_id, connection)


# ----------------------------------------------------------------------
# Appeals
# ----------------------------------------------------------------------

_APPEALABLE = ("post_decline", "post_remove", "comment_decline", "ban_7d", "ban_30d", "ban_permanent")


def _last_action(connection, target_type: str, target_id: str, subject_user_id: int):
    placeholders = ", ".join("?" for _ in _APPEALABLE)
    return connection.execute(
        f"SELECT * FROM moderation_actions WHERE target_type = ? AND target_id = ? AND subject_user_id = ? "
        f"AND action IN ({placeholders}) ORDER BY id DESC LIMIT 1",
        (target_type, str(target_id), subject_user_id, *_APPEALABLE),
    ).fetchone()


def appeal(user_id: int, target_type: str, target_id: str, message: str) -> dict:
    """Contest the latest decision on one's post, comment or ban — once per decision."""
    text = (message or "").strip()
    if not text:
        raise ModerationError("Explain why the decision should change.")
    if target_type == "ban":
        target_type, target_id = "user", str(user_id)
    with app_data_service.connect() as connection:
        action = _last_action(connection, target_type, target_id, user_id)
        if action is None:
            raise ModerationError("There is no decision to appeal.", status=404)
        if connection.execute("SELECT 1 FROM appeals WHERE action_id = ?", (action["id"],)).fetchone():
            raise ModerationError("This decision was already appealed.", status=409)
        cursor = connection.execute(
            "INSERT INTO appeals (user_id, action_id, target_type, target_id, message, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, action["id"], target_type, str(target_id), text[:2000], _now()),
        )
        connection.commit()
        return _appeal_item(connection, connection.execute("SELECT * FROM appeals WHERE id = ?", (cursor.lastrowid,)).fetchone())


def _appeal_item(connection, row) -> dict:
    action = connection.execute("SELECT * FROM moderation_actions WHERE id = ?", (row["action_id"],)).fetchone()
    return {
        "id": int(row["id"]),
        "user_id": int(row["user_id"]),
        "target_type": row["target_type"],
        "target_id": row["target_id"],
        "message": row["message"],
        "status": row["status"],
        "created_at": int(row["created_at"]),
        "decision": action["action"] if action else None,
        "decision_reason": action["reason"] if action else None,
        "decided_by": int(action["actor_id"]) if action else None,
        "note": row["note"],
    }


def decide_appeal(appeal_id: int, outcome: str, actor_id: int, note: str | None) -> dict:
    """``uphold`` keeps the decision; ``overturn`` reverses it (and its strike or ban)."""
    if outcome not in ("uphold", "overturn"):
        raise ModerationError("Unknown outcome.")
    with app_data_service.connect() as connection:
        row = connection.execute("SELECT * FROM appeals WHERE id = ?", (appeal_id,)).fetchone()
        if row is None:
            raise ModerationError("Appeal not found.", status=404)
        if row["status"] != "open":
            raise ModerationError("This appeal was already decided.", status=409)
        action = connection.execute("SELECT * FROM moderation_actions WHERE id = ?", (row["action_id"],)).fetchone()
        if config.is_auth_enabled() and (int(action["actor_id"]) == actor_id or int(row["user_id"]) == actor_id):
            raise ModerationError("Another moderator reviews this appeal.", status=403)
        user_id = int(row["user_id"])
        if outcome == "overturn":
            kind = action["action"]
            if kind.startswith("ban_"):
                _set_trust(connection, user_id, banned_until=None, ban_reason=None, banned_by=None)
            else:
                _strike(connection, user_id, -1)
                if row["target_type"] == "post":
                    post = connection.execute("SELECT * FROM posts WHERE id = ?", (row["target_id"],)).fetchone()
                    if post is not None:
                        community_service.publish_reviewed_version(connection, post)
                else:
                    connection.execute(
                        "UPDATE post_comments SET status = 'visible', report_hidden = 0 WHERE id = ?", (int(row["target_id"]),)
                    )
                    comment = connection.execute("SELECT post_id FROM post_comments WHERE id = ?", (int(row["target_id"]),)).fetchone()
                    if comment:
                        community_service.refresh_comment_count(connection, comment["post_id"])
        connection.execute(
            "UPDATE appeals SET status = ?, decided_by = ?, decided_at = ?, note = ? WHERE id = ?",
            ("overturned" if outcome == "overturn" else "upheld", actor_id, _now(), (note or "").strip() or None, appeal_id),
        )
        _log(connection, actor_id, f"appeal_{outcome}", row["target_type"], row["target_id"], user_id, note)
        connection.commit()
        item = _appeal_item(connection, connection.execute("SELECT * FROM appeals WHERE id = ?", (appeal_id,)).fetchone())
    community_service.invalidate_trending()
    return item


def my_appeals(user_id: int) -> list[dict]:
    with app_data_service.connect() as connection:
        rows = connection.execute("SELECT * FROM appeals WHERE user_id = ? ORDER BY id DESC", (user_id,)).fetchall()
        return [_appeal_item(connection, row) for row in rows]


# ----------------------------------------------------------------------
# The panel
# ----------------------------------------------------------------------


def _author_names(connection, user_ids: set[int]) -> dict[int, str]:
    names: dict[int, str] = {}
    for user_id in user_ids:
        row = connection.execute(
            "SELECT author_name FROM posts WHERE user_id = ? UNION ALL SELECT author_name FROM post_comments WHERE user_id = ? LIMIT 1",
            (user_id, user_id),
        ).fetchone()
        names[user_id] = row["author_name"] if row else f"#{user_id}"
    return names


def queue(viewer_id: int) -> dict:
    """What waits for a person: queue entries (oldest first) and open appeals."""
    with app_data_service.connect() as connection:
        rows = connection.execute("SELECT * FROM moderation_queue WHERE decided_at IS NULL ORDER BY opened_at, id").fetchall()
        items = []
        for row in rows:
            entry = {
                "id": int(row["id"]),
                "item_type": row["item_type"],
                "item_id": row["item_id"],
                "reason": row["reason"],
                "opened_at": int(row["opened_at"]),
                "checks": checks_for(connection, row["item_type"], row["item_id"], limit=4),
                "reports": community_service.reports_for(connection, row["item_type"], row["item_id"]),
            }
            if row["item_type"] == "post":
                post = community_service.get_post(row["item_id"], viewer_id, is_moderator=True, connection=connection)
                if post is None:
                    continue
                entry["post"] = post
                author_id = int(post["author_id"])
            else:
                comment = connection.execute("SELECT * FROM post_comments WHERE id = ?", (int(row["item_id"]),)).fetchone()
                if comment is None:
                    continue
                entry["comment"] = community_service.comment_row(comment, viewer_id, staff=True)
                title = connection.execute("SELECT title FROM posts WHERE id = ?", (comment["post_id"],)).fetchone()
                entry["post_title"] = title["title"] if title else None
                author_id = int(comment["user_id"])
            entry["author"] = {**standing(author_id, connection), "name": _author_names(connection, {author_id})[author_id]}
            entry["is_mine"] = config.is_auth_enabled() and author_id == viewer_id
            items.append(entry)
        appeals = [
            _appeal_item(connection, row)
            for row in connection.execute("SELECT * FROM appeals WHERE status = 'open' ORDER BY id").fetchall()
        ]
    return {"items": items, "appeals": appeals}


def users(kind: str) -> list[dict]:
    """``suspicious`` (three or more upheld declines) or ``banned`` authors."""
    now = _now()
    with app_data_service.connect() as connection:
        if kind == "banned":
            rows = connection.execute(
                "SELECT * FROM user_trust WHERE banned_until IS NOT NULL AND (banned_until = ? OR banned_until > ?) "
                "ORDER BY updated_at DESC",
                (PERMANENT, now),
            ).fetchall()
        else:
            rows = connection.execute(
                "SELECT * FROM user_trust WHERE upheld_declines >= ? ORDER BY upheld_declines DESC, updated_at DESC",
                (SUSPICIOUS_STRIKES,),
            ).fetchall()
        names = _author_names(connection, {int(row["user_id"]) for row in rows})
        result = []
        for row in rows:
            user_id = int(row["user_id"])
            actions = connection.execute(
                "SELECT action, target_type, target_id, reason, created_at FROM moderation_actions "
                "WHERE subject_user_id = ? ORDER BY id DESC LIMIT 10",
                (user_id,),
            ).fetchall()
            result.append(
                {
                    **standing(user_id, connection),
                    "name": names[user_id],
                    "history": [dict(action) for action in actions],
                }
            )
    return result


def actions(actor_id: int | None = None, limit: int = 100) -> list[dict]:
    with app_data_service.connect() as connection:
        if actor_id is None:
            rows = connection.execute("SELECT * FROM moderation_actions ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        else:
            rows = connection.execute(
                "SELECT * FROM moderation_actions WHERE actor_id = ? ORDER BY id DESC LIMIT ?", (actor_id, limit)
            ).fetchall()
    return [
        {
            "id": int(row["id"]),
            "actor_id": int(row["actor_id"]),
            "action": row["action"],
            "target_type": row["target_type"],
            "target_id": row["target_id"],
            "subject_user_id": row["subject_user_id"],
            "reason": row["reason"],
            "created_at": int(row["created_at"]),
        }
        for row in rows
    ]


def health() -> dict:
    now = _now()
    with app_data_service.connect() as connection:

        def count(sql: str, *params) -> int:
            return int(connection.execute(sql, params).fetchone()[0])

        last = connection.execute(
            "SELECT * FROM moderation_runs WHERE kind = 'batch' AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 1"
        ).fetchone()
        day = _utc_day_start(now)
        return {
            "worker": config.get_moderation_worker_mode(),
            "interval_seconds": config.get_moderation_interval_seconds(),
            "backlog": {
                "queued_posts": count("SELECT COUNT(*) FROM posts WHERE status = 'queued' OR candidate_state = 'queued'"),
                "unchecked_comments": count(
                    "SELECT COUNT(*) FROM post_comments WHERE checked = 0 AND status IN ('visible', 'pending')"
                ),
                "unchecked_reports": count("SELECT COUNT(*) FROM reports WHERE checked = 0"),
                "waiting_for_people": count("SELECT COUNT(*) FROM moderation_queue WHERE decided_at IS NULL"),
                "open_appeals": count("SELECT COUNT(*) FROM appeals WHERE status = 'open'"),
                "open_feedback": feedback_service.open_count(connection),
            },
            "last_batch": (
                {
                    "started_at": int(last["started_at"]),
                    "duration_seconds": int(last["finished_at"]) - int(last["started_at"]),
                    "checked": int(last["checked"]),
                    "errors": int(last["errors"]),
                    "budget_reached": bool(last["budget_reached"]),
                }
                if last
                else None
            ),
            "today": {
                "checks": count("SELECT COUNT(*) FROM moderation_checks WHERE stage = 'agent' AND created_at >= ?", day),
                "errors": count(
                    "SELECT COUNT(*) FROM moderation_checks WHERE stage = 'agent' AND note IS NOT NULL AND created_at >= ?",
                    day,
                ),
                "budget": config.get_moderation_daily_budget(),
            },
        }


def team() -> list[dict]:
    """Admins and moderators, with how many decisions each took."""
    staff = auth_service.list_staff() if config.is_auth_enabled() else []
    with app_data_service.connect() as connection:
        counts = {
            int(row["actor_id"]): int(row["n"])
            for row in connection.execute("SELECT actor_id, COUNT(*) AS n FROM moderation_actions GROUP BY actor_id")
        }
    return [
        {
            "user_id": user.id,
            "email": user.email,
            "name": user.name,
            "role": "admin" if user.is_admin else "moderator",
            "actions": counts.get(user.id, 0),
        }
        for user in staff
    ]


def set_role(actor_id: int, email: str, role: str) -> list[dict]:
    """Admins appoint or remove moderators (admins themselves stay as they are)."""
    if not config.is_auth_enabled():
        raise ModerationError("Moderators exist only with accounts enabled.", status=409)
    user = auth_service.get_user_by_email(email)
    if user is None:
        raise ModerationError("No account with this email.", status=404)
    if user.is_admin:
        raise ModerationError("An admin's role is managed on the server.", status=409)
    auth_service.set_moderator(user.id, role == "moderator")
    with app_data_service.connect() as connection:
        _log(connection, actor_id, "appoint_moderator" if role == "moderator" else "remove_moderator", "user", user.id, user.id, None)
        connection.commit()
    return team()


def delete_user(user_id: int, connection) -> None:
    """Account deletion: their trust row and appeals go too (the action log stays, anonymous)."""
    connection.execute("DELETE FROM user_trust WHERE user_id = ?", (user_id,))
    connection.execute("DELETE FROM appeals WHERE user_id = ?", (user_id,))
    connection.execute("UPDATE moderation_actions SET subject_user_id = NULL WHERE subject_user_id = ?", (user_id,))
