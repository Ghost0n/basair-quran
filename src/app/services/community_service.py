"""Community — publishing research documents, the feed, likes, comments, reports, moderation.

Publishing pipeline (docs/ai-audit-agent.md, docs/community-guidelines.md §7):

1. deterministic audit (blocking) — ``research_document_service.audit_document``;
2. AI audit agent (advisory) — ``audit_agent_service.run_ai_audit``: ``pass`` publishes,
   anything else waits for a moderator (the agent fails closed);
3. human moderation — the final say (publish / request changes / reject / remove).

A post is an immutable *snapshot* of a document version (plus, for a document
exported from a theme board, a read-only copy of that board), so later edits
never change what readers saw; republishing re-enters the pipeline.
"""

from __future__ import annotations

import base64
import json
import re
import secrets
import time

from src.app.services import (
    app_data_service,
    audit_agent_service,
    quran_service,
    research_document_service,
)

MAX_LINKS_PER_COMMENT = 2
FEED_PAGE_SIZE = 20
_URL = re.compile(r"https?://|www\.", re.IGNORECASE)


class CommunityError(ValueError):
    """A rejected community action; ``status`` is the HTTP status to return."""

    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.status = status


def ensure_tables() -> None:
    with app_data_service.connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS posts (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                author_name TEXT NOT NULL,
                document_id TEXT NOT NULL,
                document_version INTEGER NOT NULL,
                snapshot TEXT NOT NULL,
                title TEXT NOT NULL,
                visibility TEXT NOT NULL DEFAULT 'public',
                status TEXT NOT NULL,
                like_count INTEGER NOT NULL DEFAULT 0,
                comment_count INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                published_at INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_posts_feed ON posts (status, visibility, published_at);
            CREATE INDEX IF NOT EXISTS idx_posts_user ON posts (user_id, updated_at);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_document ON posts (user_id, document_id);

            CREATE TABLE IF NOT EXISTS post_reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id TEXT NOT NULL,
                document_version INTEGER NOT NULL,
                stage TEXT NOT NULL,
                verdict TEXT NOT NULL,
                issues TEXT NOT NULL DEFAULT '[]',
                model TEXT,
                guidelines_version TEXT,
                reviewer_id INTEGER,
                note TEXT,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_reviews_post ON post_reviews (post_id, created_at);

            CREATE TABLE IF NOT EXISTS post_likes (
                post_id TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY (post_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS post_comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                author_name TEXT NOT NULL,
                body TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'visible',
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_comments_post ON post_comments (post_id, created_at);

            CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                target_type TEXT NOT NULL,
                target_id TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                rule TEXT NOT NULL,
                note TEXT,
                status TEXT NOT NULL DEFAULT 'open',
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status, created_at);

            CREATE TABLE IF NOT EXISTS post_saves (
                post_id TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY (post_id, user_id)
            );
            CREATE INDEX IF NOT EXISTS idx_saves_user ON post_saves (user_id, created_at);
            """
        )
        # Feed filter columns (Q-Basair-23), derived from the snapshot: added to
        # older databases, then backfilled for the rows that predate them.
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(posts)")}
        for name, ddl in _INDEX_COLUMNS.items():
            if name not in columns:
                connection.execute(f"ALTER TABLE posts ADD COLUMN {name} {ddl}")
        stale = connection.execute("SELECT id, snapshot FROM posts WHERE indexed = 0").fetchall()
        for row in stale:
            fields = _index_fields(json.loads(row["snapshot"]))
            connection.execute(
                "UPDATE posts SET surahs = ?, tags = ?, search_text = ?, mode = ?, has_board = ?, indexed = 1 WHERE id = ?",
                (fields["surahs"], fields["tags"], fields["search_text"], fields["mode"], fields["has_board"], row["id"]),
            )
        connection.commit()


_INDEX_COLUMNS = {
    "surahs": "TEXT NOT NULL DEFAULT ''",
    "tags": "TEXT NOT NULL DEFAULT ''",
    "search_text": "TEXT NOT NULL DEFAULT ''",
    "mode": "TEXT",
    "has_board": "INTEGER NOT NULL DEFAULT 0",
    "indexed": "INTEGER NOT NULL DEFAULT 0",
}

MAX_TAGS = 8
_SEARCH_FOLD = str.maketrans({"\u0649": "\u064a", "\u0629": "\u0647"})


def search_norm(text: str) -> str:
    """Normalisation shared by the stored search text and the query: no
    diacritics, one alef, ى→ي, ة→ه, lower-case Latin, single spaces."""
    return quran_service.normalize_query_search(text or "").translate(_SEARCH_FOLD).lower()


def clean_tags(tags) -> list[str]:
    seen: list[str] = []
    for tag in tags or []:
        value = " ".join(str(tag).replace("|", " ").replace("#", " ").split())[:40]
        if value and value not in seen:
            seen.append(value)
    return seen[:MAX_TAGS]


def _index_fields(payload: dict) -> dict:
    """Denormalised filter columns for a post snapshot (`|`-delimited lists so
    `instr()` matches whole values)."""
    document = payload.get("document") or {}
    surah_ids = sorted(
        {int(ref["surah_id"]) for section in document.get("sections", []) for ref in section.get("ayahs", []) if ref.get("surah_id")}
    )
    tags = clean_tags(document.get("tags"))
    parts = [document.get("title") or "", document.get("summary") or "", " ".join(tags)]
    parts += [(section.get("title") or "") + " " + (section.get("body") or "") for section in document.get("sections", [])]
    return {
        "surahs": "|" + "|".join(str(surah) for surah in surah_ids) + "|" if surah_ids else "",
        "tags": "|" + "|".join(search_norm(tag) for tag in tags) + "|" if tags else "",
        "search_text": search_norm(" ".join(parts))[:6000],
        "mode": (document.get("provenance") or {}).get("mode"),
        "has_board": 1 if payload.get("board") else 0,
    }


# ----------------------------------------------------------------------
# Snapshots
# ----------------------------------------------------------------------


def _board_snapshot(document: dict, user_id: int) -> dict | None:
    """A read-only copy of the theme board a document was exported from."""
    provenance = document.get("provenance") or {}
    if provenance.get("created_from") != "board" or not provenance.get("source_id"):
        return None
    try:
        theme_id = int(provenance["source_id"])
    except (TypeError, ValueError):
        return None
    theme = app_data_service.get_theme(theme_id, user_id)
    if not theme or not theme.get("board"):
        return None
    board = theme["board"]
    ayahs: dict[str, dict] = {}
    for node in board.get("nodes", []):
        if node.get("type") != "ayah":
            continue
        data = node.get("data") or {}
        row = quran_service.get_db().execute(
            "SELECT a.surah_id, a.number_in_surah, a.text_uthmani, s.name_arabic FROM ayahs a "
            "JOIN surahs s ON s.id = a.surah_id WHERE a.id = ?",
            (data.get("ayah_id"),),
        ).fetchone()
        if row:
            ayahs[node["id"]] = {
                "surah_id": row["surah_id"],
                "surah": row["name_arabic"],
                "ayah": row["number_in_surah"],
                "text": row["text_uthmani"],
            }
    return {"theme": {"name": theme["name"], "color": theme["color"]}, "board": board, "ayahs": ayahs}


def _excerpt(document: dict) -> dict | None:
    for section in document.get("sections", []):
        for ref in section.get("ayahs", []):
            if ref.get("text"):
                return {"surah_id": ref["surah_id"], "ayah": ref["ayah"], "text": ref["text"][:400]}
    return None


# ----------------------------------------------------------------------
# Publishing
# ----------------------------------------------------------------------


def _record_review(connection, post_id: str, version: int, stage: str, verdict: str, **extra) -> None:
    connection.execute(
        "INSERT INTO post_reviews (post_id, document_version, stage, verdict, issues, model, guidelines_version, "
        "reviewer_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            post_id,
            version,
            stage,
            verdict,
            json.dumps(extra.get("issues") or [], ensure_ascii=False),
            extra.get("model"),
            extra.get("guidelines_version"),
            extra.get("reviewer_id"),
            extra.get("note"),
            int(time.time()),
        ),
    )


def publish_document(
    document_id: str,
    user_id: int,
    author_name: str,
    visibility: str,
    accept_guidelines: bool,
) -> dict:
    if not accept_guidelines:
        raise CommunityError("Accept the community guidelines before publishing.")
    document = research_document_service.get_document(document_id, user_id)
    if document is None:
        raise CommunityError("Research document not found.", status=404)

    audit = research_document_service.audit_document(document)
    if not audit["publishable"]:
        return {"status": "blocked", "post_id": None, "audit": audit, "ai_audit": None}

    snapshot = {key: document[key] for key in ("title", "summary", "language", "tags", "sections", "references", "provenance")}
    snapshot["id"] = document_id
    snapshot["version"] = document["version"]
    board = _board_snapshot(document, user_id)
    payload = {"document": snapshot, "board": board, "excerpt": _excerpt(document)}

    fields = _index_fields(payload)

    ai_audit = audit_agent_service.run_ai_audit(snapshot)
    status = "published" if ai_audit["verdict"] == "pass" else "pending_review"
    now = int(time.time())

    with app_data_service.connect() as connection:
        existing = connection.execute(
            "SELECT id, published_at FROM posts WHERE user_id = ? AND document_id = ?", (user_id, document_id)
        ).fetchone()
        if existing:
            post_id = existing["id"]
            connection.execute(
                "UPDATE posts SET snapshot = ?, title = ?, visibility = ?, status = ?, document_version = ?, "
                "author_name = ?, updated_at = ?, published_at = ?, surahs = ?, tags = ?, search_text = ?, mode = ?, "
                "has_board = ?, indexed = 1 WHERE id = ?",
                (
                    json.dumps(payload, ensure_ascii=False),
                    document["title"],
                    visibility,
                    status,
                    document["version"],
                    author_name,
                    now,
                    (existing["published_at"] or now) if status == "published" else existing["published_at"],
                    fields["surahs"],
                    fields["tags"],
                    fields["search_text"],
                    fields["mode"],
                    fields["has_board"],
                    post_id,
                ),
            )
        else:
            post_id = f"post-{secrets.token_urlsafe(9)}"
            connection.execute(
                "INSERT INTO posts (id, user_id, author_name, document_id, document_version, snapshot, title, "
                "visibility, status, created_at, updated_at, published_at, surahs, tags, search_text, mode, has_board, "
                "indexed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
                (
                    post_id,
                    user_id,
                    author_name,
                    document_id,
                    document["version"],
                    json.dumps(payload, ensure_ascii=False),
                    document["title"],
                    visibility,
                    status,
                    now,
                    now,
                    now if status == "published" else None,
                    fields["surahs"],
                    fields["tags"],
                    fields["search_text"],
                    fields["mode"],
                    fields["has_board"],
                ),
            )
        _record_review(connection, post_id, document["version"], "deterministic", "pass", issues=audit["checks"])
        _record_review(
            connection,
            post_id,
            document["version"],
            "ai",
            ai_audit["verdict"],
            issues=ai_audit["issues"],
            model=ai_audit.get("model"),
            guidelines_version=audit_agent_service.GUIDELINES_VERSION,
            note=ai_audit.get("fallback_reason"),
        )
        connection.commit()
        invalidate_trending()
    return {"status": status, "post_id": post_id, "audit": audit, "ai_audit": ai_audit}


# ----------------------------------------------------------------------
# Reading
# ----------------------------------------------------------------------


WORDS_PER_MINUTE = 180
TRENDING_WINDOW = 500
TRENDING_GRAVITY = 1.4


def _reading_minutes(document: dict) -> int:
    words = 0
    for section in document.get("sections", []):
        words += len(((section.get("title") or "") + " " + (section.get("body") or "")).split())
        words += sum(len((ref.get("text") or "").split()) for ref in section.get("ayahs", []))
    words += len((document.get("summary") or "").split())
    return max(1, round(words / WORDS_PER_MINUTE))


def _summary(row, viewer_id: int | None, liked: set[str], saved: set[str] = frozenset()) -> dict:
    payload = json.loads(row["snapshot"])
    document = payload.get("document") or {}
    provenance = document.get("provenance") or {}
    surah_ids = sorted(
        {int(ref["surah_id"]) for section in document.get("sections", []) for ref in section.get("ayahs", []) if ref.get("surah_id")}
    )
    return {
        "id": row["id"],
        "title": row["title"],
        "summary": document.get("summary"),
        "author_name": row["author_name"],
        "author_id": int(row["user_id"]),
        "visibility": row["visibility"],
        "status": row["status"],
        "mode": provenance.get("mode"),
        "created_from": provenance.get("created_from", "manual"),
        "has_board": bool(payload.get("board")),
        "ayah_count": sum(len(section.get("ayahs", [])) for section in document.get("sections", [])),
        "tags": clean_tags(document.get("tags")),
        "surah_ids": surah_ids,
        "reading_minutes": _reading_minutes(document),
        "like_count": int(row["like_count"]),
        "comment_count": int(row["comment_count"]),
        "liked_by_me": row["id"] in liked,
        "saved_by_me": row["id"] in saved,
        "is_mine": viewer_id is not None and int(row["user_id"]) == viewer_id,
        "published_at": row["published_at"],
        "updated_at": int(row["updated_at"]),
        "excerpt": payload.get("excerpt"),
    }


def _viewer_set(connection, table: str, viewer_id: int | None, post_ids: list[str]) -> set[str]:
    if viewer_id is None or not post_ids:
        return set()
    placeholders = ", ".join("?" for _ in post_ids)
    rows = connection.execute(
        f"SELECT post_id FROM {table} WHERE user_id = ? AND post_id IN ({placeholders})", (viewer_id, *post_ids)
    ).fetchall()
    return {row["post_id"] for row in rows}


def _liked_set(connection, viewer_id: int | None, post_ids: list[str]) -> set[str]:
    return _viewer_set(connection, "post_likes", viewer_id, post_ids)


def _saved_set(connection, viewer_id: int | None, post_ids: list[str]) -> set[str]:
    return _viewer_set(connection, "post_saves", viewer_id, post_ids)


def _encode_cursor(published_at: int, post_id: str) -> str:
    return base64.urlsafe_b64encode(f"{published_at}:{post_id}".encode()).decode()


def _decode_cursor(cursor: str) -> tuple[int, str] | None:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        stamp, post_id = raw.split(":", 1)
        return int(stamp), post_id
    except (ValueError, UnicodeDecodeError):
        return None


def _encode_offset(offset: int) -> str:
    return base64.urlsafe_b64encode(f"o:{offset}".encode()).decode()


def _decode_offset(cursor: str | None) -> int:
    if not cursor:
        return 0
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        return max(0, int(raw.split(":", 1)[1])) if raw.startswith("o:") else 0
    except (ValueError, UnicodeDecodeError, IndexError):
        return 0


def trending_score(like_count: int, comment_count: int, age_seconds: float) -> float:
    """«الأبرز»: engagement (a comment weighs two likes) decayed by age, so a
    new post with a few reactions can pass an old one with many."""
    hours = max(0.0, age_seconds) / 3600
    return (like_count + 2 * comment_count + 1) / ((hours + 2) ** TRENDING_GRAVITY)


# «الأبرز» ranking cache: the ranked ids per filter set, kept for
# TRENDING_CACHE_SECONDS and dropped on any community write. Paging through
# one cached ranking also keeps offsets stable while reactions come in.
TRENDING_CACHE_SECONDS = 60
TRENDING_CACHE_MAX = 256
_trending_cache: dict[tuple, tuple[float, list[str]]] = {}


def invalidate_trending() -> None:
    _trending_cache.clear()


def _trending_ids(connection, where_sql: str, params: tuple) -> list[str]:
    key = (where_sql, params)
    now = time.time()
    cached = _trending_cache.get(key)
    if cached and now - cached[0] < TRENDING_CACHE_SECONDS:
        return cached[1]
    rows = connection.execute(
        f"SELECT id, like_count, comment_count, published_at FROM posts WHERE {where_sql} "
        "ORDER BY published_at DESC LIMIT ?",
        (*params, TRENDING_WINDOW),
    ).fetchall()
    ranked = [
        row["id"]
        for row in sorted(
            rows,
            key=lambda row: (
                -trending_score(int(row["like_count"]), int(row["comment_count"]), now - (row["published_at"] or now)),
                -(row["published_at"] or 0),
                row["id"],
            ),
        )
    ]
    if len(_trending_cache) >= TRENDING_CACHE_MAX:
        _trending_cache.pop(next(iter(_trending_cache)))
    _trending_cache[key] = (now, ranked)
    return ranked


def feed(
    viewer_id: int | None,
    cursor: str | None = None,
    limit: int = FEED_PAGE_SIZE,
    *,
    sort: str = "latest",
    q: str | None = None,
    surah: int | None = None,
    tag: str | None = None,
    mode: str | None = None,
    board: bool = False,
    author: int | None = None,
    saved: bool = False,
) -> dict:
    """Published public posts with optional filters. `latest` is newest first
    (keyset pagination); `top` ranks the most recent ``TRENDING_WINDOW``
    matches by :func:`trending_score` (offset pagination)."""
    limit = max(1, min(limit, 50))
    where = ["status = 'published'", "visibility = 'public'"]
    params: list = []
    for token in search_norm(q or "").split()[:6]:
        where.append("instr(search_text, ?) > 0")
        params.append(token)
    if surah:
        where.append("instr(surahs, ?) > 0")
        params.append(f"|{int(surah)}|")
    tag_key = search_norm(clean_tags([tag])[0]) if tag and clean_tags([tag]) else ""
    if tag_key:
        where.append("instr(tags, ?) > 0")
        params.append(f"|{tag_key}|")
    if mode in ("strict", "tafssir"):
        where.append("mode = ?")
        params.append(mode)
    if board:
        where.append("has_board = 1")
    if author is not None:
        where.append("user_id = ?")
        params.append(int(author))
    if saved:
        if viewer_id is None:
            return {"posts": [], "next_cursor": None}
        where.append("EXISTS (SELECT 1 FROM post_saves s WHERE s.post_id = posts.id AND s.user_id = ?)")
        params.append(viewer_id)

    with app_data_service.connect() as connection:
        if sort == "top":
            ranked_ids = _trending_ids(connection, " AND ".join(where), tuple(params))
            offset = _decode_offset(cursor)
            page_ids = ranked_ids[offset : offset + limit]
            by_id = {}
            if page_ids:
                placeholders = ", ".join("?" for _ in page_ids)
                by_id = {
                    row["id"]: row
                    for row in connection.execute(f"SELECT * FROM posts WHERE id IN ({placeholders})", page_ids)
                }
            # A post withdrawn or removed since the ranking was cached simply drops out.
            page = [by_id[post_id] for post_id in page_ids if post_id in by_id and by_id[post_id]["status"] == "published"]
            next_cursor = _encode_offset(offset + limit) if offset + limit < len(ranked_ids) else None
        else:
            position = _decode_cursor(cursor) if cursor else None
            if position:
                where.append("(published_at < ? OR (published_at = ? AND id < ?))")
                params += [position[0], position[0], position[1]]
            rows = connection.execute(
                f"SELECT * FROM posts WHERE {' AND '.join(where)} ORDER BY published_at DESC, id DESC LIMIT ?",
                (*params, limit + 1),
            ).fetchall()
            page = rows[:limit]
            next_cursor = _encode_cursor(page[-1]["published_at"], page[-1]["id"]) if len(rows) > limit else None
        ids = [row["id"] for row in page]
        liked = _liked_set(connection, viewer_id, ids)
        saved_ids = _saved_set(connection, viewer_id, ids)
    return {"posts": [_summary(row, viewer_id, liked, saved_ids) for row in page], "next_cursor": next_cursor}


def popular_tags(limit: int = 20) -> list[dict]:
    """The most used tags among recent public posts (display form of the first use)."""
    counts: dict[str, int] = {}
    display: dict[str, str] = {}
    with app_data_service.connect() as connection:
        rows = connection.execute(
            "SELECT snapshot FROM posts WHERE status = 'published' AND visibility = 'public' AND tags != '' "
            "ORDER BY published_at DESC LIMIT 1000"
        ).fetchall()
    for row in rows:
        document = (json.loads(row["snapshot"]).get("document")) or {}
        for tag in clean_tags(document.get("tags")):
            key = search_norm(tag)
            counts[key] = counts.get(key, 0) + 1
            display.setdefault(key, tag)
    ranked = sorted(counts.items(), key=lambda item: (-item[1], display[item[0]]))
    return [{"tag": display[key], "count": count} for key, count in ranked[:limit]]


def my_posts(user_id: int) -> list[dict]:
    with app_data_service.connect() as connection:
        rows = connection.execute(
            "SELECT * FROM posts WHERE user_id = ? AND status != 'withdrawn' ORDER BY updated_at DESC", (user_id,)
        ).fetchall()
        ids = [row["id"] for row in rows]
        liked = _liked_set(connection, user_id, ids)
        saved = _saved_set(connection, user_id, ids)
    return [_summary(row, user_id, liked, saved) for row in rows]


def _reviews(connection, post_id: str) -> list[dict]:
    rows = connection.execute(
        "SELECT stage, verdict, issues, note, created_at FROM post_reviews WHERE post_id = ? ORDER BY id DESC LIMIT 6",
        (post_id,),
    ).fetchall()
    return [
        {
            "stage": row["stage"],
            "verdict": row["verdict"],
            "issues": json.loads(row["issues"] or "[]"),
            "note": row["note"],
            "created_at": int(row["created_at"]),
        }
        for row in rows
    ]


def _can_view(row, viewer_id: int | None, is_moderator: bool) -> bool:
    if row["status"] == "published":
        return True  # public or unlisted (by link)
    if row["status"] in ("withdrawn", "removed"):
        return is_moderator
    return is_moderator or (viewer_id is not None and int(row["user_id"]) == viewer_id)


def get_post(post_id: str, viewer_id: int | None, is_moderator: bool = False) -> dict | None:
    with app_data_service.connect() as connection:
        row = connection.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
        if row is None or not _can_view(row, viewer_id, is_moderator):
            return None
        liked = _liked_set(connection, viewer_id, [post_id])
        saved = _saved_set(connection, viewer_id, [post_id])
        is_owner = viewer_id is not None and int(row["user_id"]) == viewer_id
        reviews = _reviews(connection, post_id) if (is_owner or is_moderator) else []
    payload = json.loads(row["snapshot"])
    return {
        **_summary(row, viewer_id, liked, saved),
        "document": payload.get("document") or {},
        "board": payload.get("board"),
        "reviews": reviews,
    }


def withdraw_post(post_id: str, user_id: int) -> bool:
    with app_data_service.connect() as connection:
        cursor = connection.execute(
            "UPDATE posts SET status = 'withdrawn', updated_at = ? WHERE id = ? AND user_id = ? AND status != 'removed'",
            (int(time.time()), post_id, user_id),
        )
        connection.commit()
        invalidate_trending()
        return cursor.rowcount > 0


# ----------------------------------------------------------------------
# Likes & comments
# ----------------------------------------------------------------------


def _published(connection, post_id: str):
    row = connection.execute("SELECT * FROM posts WHERE id = ? AND status = 'published'", (post_id,)).fetchone()
    if row is None:
        raise CommunityError("Post not found.", status=404)
    return row


def set_like(post_id: str, user_id: int, liked: bool) -> dict:
    with app_data_service.connect() as connection:
        _published(connection, post_id)
        if liked:
            connection.execute(
                "INSERT OR IGNORE INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)",
                (post_id, user_id, int(time.time())),
            )
        else:
            connection.execute("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?", (post_id, user_id))
        (count,) = connection.execute("SELECT COUNT(*) FROM post_likes WHERE post_id = ?", (post_id,)).fetchone()
        connection.execute("UPDATE posts SET like_count = ? WHERE id = ?", (count, post_id))
        connection.commit()
        invalidate_trending()
    return {"liked": liked, "like_count": int(count)}


def set_saved(post_id: str, user_id: int, saved: bool) -> dict:
    """«احفظ» — a private bookmark; only the viewer sees it (no public count)."""
    with app_data_service.connect() as connection:
        _published(connection, post_id)
        if saved:
            connection.execute(
                "INSERT OR IGNORE INTO post_saves (post_id, user_id, created_at) VALUES (?, ?, ?)",
                (post_id, user_id, int(time.time())),
            )
        else:
            connection.execute("DELETE FROM post_saves WHERE post_id = ? AND user_id = ?", (post_id, user_id))
        connection.commit()
    return {"saved": saved}


def _comment_row(row, viewer_id: int | None) -> dict:
    return {
        "id": int(row["id"]),
        "post_id": row["post_id"],
        "author_name": row["author_name"],
        "body": row["body"],
        "is_mine": viewer_id is not None and int(row["user_id"]) == viewer_id,
        "status": row["status"],
        "created_at": int(row["created_at"]),
    }


def list_comments(post_id: str, viewer_id: int | None) -> list[dict]:
    with app_data_service.connect() as connection:
        _published(connection, post_id)
        rows = connection.execute(
            "SELECT * FROM post_comments WHERE post_id = ? AND status = 'visible' ORDER BY created_at, id", (post_id,)
        ).fetchall()
    return [_comment_row(row, viewer_id) for row in rows]


def check_comment(body: str) -> str:
    """Deterministic comment checks; returns the cleaned body or raises."""
    cleaned = body.strip()
    if not cleaned:
        raise CommunityError("التعليق فارغ.")
    if len(_URL.findall(cleaned)) > MAX_LINKS_PER_COMMENT:
        raise CommunityError("التعليق يحوي روابط كثيرة (إرشادات المجتمع §٦).")
    return cleaned


def add_comment(post_id: str, user_id: int, author_name: str, body: str) -> dict:
    cleaned = check_comment(body)
    with app_data_service.connect() as connection:
        _published(connection, post_id)
        cursor = connection.execute(
            "INSERT INTO post_comments (post_id, user_id, author_name, body, created_at) VALUES (?, ?, ?, ?, ?)",
            (post_id, user_id, author_name, cleaned, int(time.time())),
        )
        _refresh_comment_count(connection, post_id)
        connection.commit()
        invalidate_trending()
        row = connection.execute("SELECT * FROM post_comments WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return _comment_row(row, user_id)


def _refresh_comment_count(connection, post_id: str) -> None:
    (count,) = connection.execute(
        "SELECT COUNT(*) FROM post_comments WHERE post_id = ? AND status = 'visible'", (post_id,)
    ).fetchone()
    connection.execute("UPDATE posts SET comment_count = ? WHERE id = ?", (count, post_id))


def delete_comment(comment_id: int, user_id: int, is_moderator: bool = False) -> bool:
    with app_data_service.connect() as connection:
        row = connection.execute("SELECT * FROM post_comments WHERE id = ?", (comment_id,)).fetchone()
        if row is None or (int(row["user_id"]) != user_id and not is_moderator):
            return False
        connection.execute("UPDATE post_comments SET status = 'hidden' WHERE id = ?", (comment_id,))
        _refresh_comment_count(connection, row["post_id"])
        connection.commit()
        invalidate_trending()
    return True


# ----------------------------------------------------------------------
# Reports & moderation
# ----------------------------------------------------------------------


def report(target_type: str, target_id: str, user_id: int, rule: str, note: str | None) -> dict:
    with app_data_service.connect() as connection:
        if target_type == "post":
            exists = connection.execute("SELECT 1 FROM posts WHERE id = ?", (target_id,)).fetchone()
        else:
            exists = connection.execute(
                "SELECT 1 FROM post_comments WHERE id = ?", (int(target_id) if target_id.isdigit() else -1,)
            ).fetchone()
        if not exists:
            raise CommunityError("Reported content not found.", status=404)
        duplicate = connection.execute(
            "SELECT id FROM reports WHERE target_type = ? AND target_id = ? AND user_id = ? AND status = 'open'",
            (target_type, target_id, user_id),
        ).fetchone()
        if duplicate:
            report_id = int(duplicate["id"])
        else:
            cursor = connection.execute(
                "INSERT INTO reports (target_type, target_id, user_id, rule, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (target_type, target_id, user_id, rule, (note or "").strip() or None, int(time.time())),
            )
            report_id = int(cursor.lastrowid)
        connection.commit()
    return {"id": report_id}


def moderation_queue() -> dict:
    with app_data_service.connect() as connection:
        rows = connection.execute(
            "SELECT id FROM posts WHERE status = 'pending_review' ORDER BY updated_at"
        ).fetchall()
        report_rows = connection.execute(
            "SELECT * FROM reports WHERE status = 'open' ORDER BY created_at"
        ).fetchall()
        reports = []
        for row in report_rows:
            preview = None
            if row["target_type"] == "post":
                target = connection.execute("SELECT title FROM posts WHERE id = ?", (row["target_id"],)).fetchone()
                preview = target["title"] if target else None
            elif str(row["target_id"]).isdigit():
                target = connection.execute(
                    "SELECT body FROM post_comments WHERE id = ?", (int(row["target_id"]),)
                ).fetchone()
                preview = target["body"][:200] if target else None
            reports.append(
                {
                    "id": int(row["id"]),
                    "target_type": row["target_type"],
                    "target_id": row["target_id"],
                    "rule": row["rule"],
                    "note": row["note"],
                    "status": row["status"],
                    "created_at": int(row["created_at"]),
                    "target_preview": preview,
                }
            )
    posts = [get_post(row["id"], None, is_moderator=True) for row in rows]
    return {"posts": [post for post in posts if post], "reports": reports}


_DECISION_STATUS = {
    "publish": "published",
    "reject": "rejected",
    "request_changes": "changes_requested",
    "remove": "removed",
}


def decide(post_id: str, decision: str, moderator_id: int, note: str | None) -> dict | None:
    status = _DECISION_STATUS[decision]
    now = int(time.time())
    with app_data_service.connect() as connection:
        row = connection.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
        if row is None:
            return None
        connection.execute(
            "UPDATE posts SET status = ?, updated_at = ?, published_at = COALESCE(published_at, ?) WHERE id = ?",
            (status, now, now if status == "published" else None, post_id),
        )
        _record_review(
            connection, post_id, int(row["document_version"]), "human", decision, reviewer_id=moderator_id, note=note
        )
        if decision == "remove":
            connection.execute(
                "UPDATE reports SET status = 'resolved' WHERE target_type = 'post' AND target_id = ?", (post_id,)
            )
        connection.commit()
        invalidate_trending()
    return get_post(post_id, None, is_moderator=True)


def hide_comment(comment_id: int) -> bool:
    with app_data_service.connect() as connection:
        row = connection.execute("SELECT post_id FROM post_comments WHERE id = ?", (comment_id,)).fetchone()
        if row is None:
            return False
        connection.execute("UPDATE post_comments SET status = 'hidden' WHERE id = ?", (comment_id,))
        connection.execute(
            "UPDATE reports SET status = 'resolved' WHERE target_type = 'comment' AND target_id = ?", (str(comment_id),)
        )
        _refresh_comment_count(connection, row["post_id"])
        connection.commit()
        invalidate_trending()
    return True


def resolve_report(report_id: int) -> bool:
    with app_data_service.connect() as connection:
        cursor = connection.execute("UPDATE reports SET status = 'resolved' WHERE id = ?", (report_id,))
        connection.commit()
        return cursor.rowcount > 0


def delete_user_content(user_id: int) -> None:
    """Account deletion: the user's posts, likes, comments and reports go too."""
    with app_data_service.connect() as connection:
        post_ids = [row["id"] for row in connection.execute("SELECT id FROM posts WHERE user_id = ?", (user_id,))]
        for post_id in post_ids:
            connection.execute("DELETE FROM post_likes WHERE post_id = ?", (post_id,))
            connection.execute("DELETE FROM post_comments WHERE post_id = ?", (post_id,))
            connection.execute("DELETE FROM post_reviews WHERE post_id = ?", (post_id,))
            connection.execute("DELETE FROM post_saves WHERE post_id = ?", (post_id,))
        connection.execute("DELETE FROM posts WHERE user_id = ?", (user_id,))
        connection.execute("DELETE FROM post_saves WHERE user_id = ?", (user_id,))
        affected = {row["post_id"] for row in connection.execute("SELECT DISTINCT post_id FROM post_likes WHERE user_id = ?", (user_id,))}
        affected |= {row["post_id"] for row in connection.execute("SELECT DISTINCT post_id FROM post_comments WHERE user_id = ?", (user_id,))}
        connection.execute("DELETE FROM post_likes WHERE user_id = ?", (user_id,))
        connection.execute("DELETE FROM post_comments WHERE user_id = ?", (user_id,))
        connection.execute("DELETE FROM reports WHERE user_id = ?", (user_id,))
        for post_id in affected:
            (likes,) = connection.execute("SELECT COUNT(*) FROM post_likes WHERE post_id = ?", (post_id,)).fetchone()
            connection.execute("UPDATE posts SET like_count = ? WHERE id = ?", (likes, post_id))
            _refresh_comment_count(connection, post_id)
        connection.commit()
        invalidate_trending()
