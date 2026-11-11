"""Community — publishing research documents, the feed, likes, comments, reports.

Publishing pipeline (docs/community-moderation-design.md, docs/community-guidelines.md §9):

1. deterministic audit (blocking, at once) — ``research_document_service.audit_document``;
2. the post is *queued*: the moderation batches (``moderation_service.run_batch``)
   check it with the agent in the author's language and route it by the
   author's trust level — published, or waiting for a moderator;
3. human moderation — the final say (``moderation_service.decide_post``).

A post is an immutable *snapshot* of a document version (plus, for a document
exported from a theme board, a read-only copy of that board), so later edits
never change what readers saw. Republishing a published post queues the new
version as a *candidate*; the published one stays until the candidate passes.
"""

from __future__ import annotations

import base64
import json
import re
import secrets
import time

from src.app.services import (
    app_data_service,
    feedback_service,
    moderation_service,
    quran_service,
    research_document_service,
)

MAX_LINKS_PER_COMMENT = 2
FEED_PAGE_SIZE = 20
_URL = re.compile(r"https?://|www\.", re.IGNORECASE)


class CommunityError(ValueError):
    """A rejected community action; ``status`` is the HTTP status to return,
    ``code`` (with ``extra``) a machine-readable reason for the interface."""

    def __init__(self, message: str, status: int = 422, code: str | None = None, extra: dict | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.extra = extra or {}


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
        for name, ddl in {**_INDEX_COLUMNS, **_REVIEW_COLUMNS}.items():
            if name not in columns:
                connection.execute(f"ALTER TABLE posts ADD COLUMN {name} {ddl}")
        # Moderation columns (docs/community-moderation-design.md): comments and
        # reports that predate the batches count as already checked.
        for table, name, ddl in (
            ("post_comments", "checked", "INTEGER NOT NULL DEFAULT 0"),
            ("post_comments", "report_hidden", "INTEGER NOT NULL DEFAULT 0"),
            ("reports", "checked", "INTEGER NOT NULL DEFAULT 0"),
        ):
            if name not in {row["name"] for row in connection.execute(f"PRAGMA table_info({table})")}:
                connection.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
                if name == "checked":
                    connection.execute(f"UPDATE {table} SET checked = 1")
        moderation_service.ensure_tables(connection)
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

# A new version of a published post waits here while it is reviewed.
_REVIEW_COLUMNS = {
    "candidate_snapshot": "TEXT",
    "candidate_version": "INTEGER",
    "candidate_state": "TEXT",
    "report_hidden": "INTEGER NOT NULL DEFAULT 0",
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


def _pick_board(stored: object, board_id: str | None) -> tuple[dict, str | None] | None:
    """The board a research came from, inside a theme's stored boards.

    A theme stores either one legacy board (``v: 1``) or a set of named boards
    (``v: 2``, ``boards: [{id, name, board}]``). ``board_id`` None means the
    theme's first board (researches exported before boards were named).
    """
    if not isinstance(stored, dict):
        return None
    if stored.get("v") == 2:
        entries = [entry for entry in stored.get("boards") or [] if isinstance(entry, dict)]
        entry = next((item for item in entries if item.get("id") == board_id), None) if board_id else (entries[0] if entries else None)
        if not entry or not isinstance(entry.get("board"), dict):
            return None
        return entry["board"], entry.get("name")
    if stored.get("v") == 1 and board_id in (None, "b-1"):
        return stored, None
    return None


def _board_snapshot(document: dict, user_id: int) -> dict | None:
    """A read-only copy of the theme board a document was exported from.

    ``provenance.source_id`` is ``"<theme id>"`` or ``"<theme id>:<board id>"``.
    """
    provenance = document.get("provenance") or {}
    if provenance.get("created_from") != "board" or not provenance.get("source_id"):
        return None
    theme_part, _, board_part = str(provenance["source_id"]).partition(":")
    try:
        theme_id = int(theme_part)
    except (TypeError, ValueError):
        return None
    theme = app_data_service.get_theme(theme_id, user_id)
    if not theme or not theme.get("board"):
        return None
    picked = _pick_board(theme["board"], board_part or None)
    if not picked:
        return None
    board, board_name = picked
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
    # The snapshot keeps its shape (one v1 board); a named board shows its name.
    return {"theme": {"name": board_name or theme["name"], "color": theme["color"]}, "board": board, "ayahs": ayahs}


def _excerpt(document: dict) -> dict | None:
    for section in document.get("sections", []):
        for ref in section.get("ayahs", []):
            if ref.get("text"):
                return {"surah_id": ref["surah_id"], "ayah": ref["ayah"], "text": ref["text"][:400]}
    return None


# ----------------------------------------------------------------------
# Publishing
# ----------------------------------------------------------------------


def publish_document(
    document_id: str,
    user_id: int,
    author_name: str,
    visibility: str,
    accept_guidelines: bool,
) -> dict:
    """Run the deterministic audit and queue the post for the next moderation batch."""
    if not accept_guidelines:
        raise CommunityError("Accept the community guidelines before publishing.")
    moderation_service.ensure_can_post(user_id)
    document = research_document_service.get_document(document_id, user_id)
    if document is None:
        raise CommunityError("Research document not found.", status=404)

    audit = research_document_service.audit_document(document)
    if not audit["publishable"]:
        return {"status": "blocked", "post_id": None, "audit": audit}

    snapshot = {key: document[key] for key in ("title", "summary", "language", "tags", "sections", "references", "provenance")}
    snapshot["id"] = document_id
    snapshot["version"] = document["version"]
    board = _board_snapshot(document, user_id)
    payload = {"document": snapshot, "board": board, "excerpt": _excerpt(document)}
    encoded = json.dumps(payload, ensure_ascii=False)
    fields = _index_fields(payload)
    now = int(time.time())

    with app_data_service.connect() as connection:
        existing = connection.execute(
            "SELECT id, status FROM posts WHERE user_id = ? AND document_id = ?", (user_id, document_id)
        ).fetchone()
        if existing and existing["status"] == "published":
            # The published version stays up while the new one is reviewed.
            post_id = existing["id"]
            connection.execute(
                "UPDATE posts SET candidate_snapshot = ?, candidate_version = ?, candidate_state = 'queued', "
                "visibility = ?, author_name = ?, updated_at = ? WHERE id = ?",
                (encoded, document["version"], visibility, author_name, now, post_id),
            )
        elif existing:
            post_id = existing["id"]
            connection.execute(
                "UPDATE posts SET snapshot = ?, title = ?, visibility = ?, status = 'queued', document_version = ?, "
                "author_name = ?, updated_at = ?, surahs = ?, tags = ?, search_text = ?, mode = ?, has_board = ?, "
                "indexed = 1, candidate_snapshot = NULL, candidate_version = NULL, candidate_state = NULL WHERE id = ?",
                (
                    encoded,
                    document["title"],
                    visibility,
                    document["version"],
                    author_name,
                    now,
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
                "indexed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, NULL, ?, ?, ?, ?, ?, 1)",
                (
                    post_id,
                    user_id,
                    author_name,
                    document_id,
                    document["version"],
                    encoded,
                    document["title"],
                    visibility,
                    now,
                    now,
                    fields["surahs"],
                    fields["tags"],
                    fields["search_text"],
                    fields["mode"],
                    fields["has_board"],
                ),
            )
        # A new version replaces whatever a person was asked to decide on.
        connection.execute(
            "UPDATE moderation_queue SET decided_at = ?, decision = 'superseded' WHERE item_type = 'post' "
            "AND item_id = ? AND decided_at IS NULL",
            (now, post_id),
        )
        moderation_service.record_check(
            connection, "post", post_id, document["version"], "deterministic", "pass", issues=audit["checks"]
        )
        connection.commit()
        invalidate_trending()
    return {"status": "queued", "post_id": post_id, "audit": audit}


def publish_reviewed_version(connection, row) -> None:
    """Publish the version a post waits with (its candidate, or itself). Caller commits."""
    now = int(time.time())
    if row["candidate_snapshot"]:
        payload = json.loads(row["candidate_snapshot"])
        fields = _index_fields(payload)
        document = payload.get("document") or {}
        connection.execute(
            "UPDATE posts SET snapshot = candidate_snapshot, document_version = candidate_version, title = ?, "
            "status = 'published', published_at = COALESCE(published_at, ?), updated_at = ?, surahs = ?, tags = ?, "
            "search_text = ?, mode = ?, has_board = ?, candidate_snapshot = NULL, candidate_version = NULL, "
            "candidate_state = NULL, report_hidden = 0 WHERE id = ?",
            (
                document.get("title") or row["title"],
                now,
                now,
                fields["surahs"],
                fields["tags"],
                fields["search_text"],
                fields["mode"],
                fields["has_board"],
                row["id"],
            ),
        )
    else:
        connection.execute(
            "UPDATE posts SET status = 'published', published_at = COALESCE(published_at, ?), updated_at = ?, "
            "report_hidden = 0 WHERE id = ?",
            (now, now, row["id"]),
        )


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
        # A new version under review (queued / pending_review / changes_requested), for its author.
        "review_state": row["candidate_state"],
        # Hidden from readers by reports until a moderator decides.
        "hidden": bool(row["report_hidden"]),
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
    where = ["status = 'published'", "visibility = 'public'", "report_hidden = 0"]
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
            page = [
                by_id[post_id]
                for post_id in page_ids
                if post_id in by_id and by_id[post_id]["status"] == "published" and not by_id[post_id]["report_hidden"]
            ]
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
            "SELECT snapshot FROM posts WHERE status = 'published' AND visibility = 'public' AND report_hidden = 0 "
            "AND tags != '' "
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


def _can_view(row, viewer_id: int | None, is_moderator: bool) -> bool:
    is_owner = viewer_id is not None and int(row["user_id"]) == viewer_id
    if row["status"] == "published":
        # Public or unlisted (by link); hidden by reports for everyone but its author and staff.
        return not row["report_hidden"] or is_owner or is_moderator
    if row["status"] == "withdrawn":
        return is_moderator
    # A removed post stays readable by its author (to read the reason and appeal).
    return is_moderator or is_owner


def get_post(post_id: str, viewer_id: int | None, is_moderator: bool = False, connection=None) -> dict | None:
    if connection is None:
        with app_data_service.connect() as own:
            return get_post(post_id, viewer_id, is_moderator, own)
    row = connection.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    if row is None or not _can_view(row, viewer_id, is_moderator):
        return None
    liked = _liked_set(connection, viewer_id, [post_id])
    saved = _saved_set(connection, viewer_id, [post_id])
    is_owner = viewer_id is not None and int(row["user_id"]) == viewer_id
    insider = is_owner or is_moderator
    reviews = moderation_service.checks_for(connection, "post", post_id) if insider else []
    payload = json.loads(row["snapshot"])
    candidate = json.loads(row["candidate_snapshot"]) if insider and row["candidate_snapshot"] else None
    return {
        **_summary(row, viewer_id, liked, saved),
        "document": payload.get("document") or {},
        "board": payload.get("board"),
        "reviews": reviews,
        # The new version under review, shown to its author and moderators.
        "candidate": (candidate.get("document") if candidate else None),
    }


def withdraw_post(post_id: str, user_id: int) -> bool:
    with app_data_service.connect() as connection:
        cursor = connection.execute(
            "UPDATE posts SET status = 'withdrawn', updated_at = ?, candidate_snapshot = NULL, candidate_version = NULL, "
            "candidate_state = NULL WHERE id = ? AND user_id = ? AND status != 'removed'",
            (int(time.time()), post_id, user_id),
        )
        connection.execute(
            "UPDATE moderation_queue SET decided_at = ?, decision = 'withdrawn' WHERE item_type = 'post' "
            "AND item_id = ? AND decided_at IS NULL",
            (int(time.time()), post_id),
        )
        connection.commit()
        invalidate_trending()
        return cursor.rowcount > 0


# ----------------------------------------------------------------------
# Likes & comments
# ----------------------------------------------------------------------


def _published(connection, post_id: str, viewer_id: int | None = None, staff: bool = False):
    row = connection.execute("SELECT * FROM posts WHERE id = ? AND status = 'published'", (post_id,)).fetchone()
    if row is None or not _can_view(row, viewer_id, staff):
        raise CommunityError("Post not found.", status=404)
    return row


def set_like(post_id: str, user_id: int, liked: bool) -> dict:
    with app_data_service.connect() as connection:
        _published(connection, post_id, user_id)
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
        _published(connection, post_id, user_id)
        if saved:
            connection.execute(
                "INSERT OR IGNORE INTO post_saves (post_id, user_id, created_at) VALUES (?, ?, ?)",
                (post_id, user_id, int(time.time())),
            )
        else:
            connection.execute("DELETE FROM post_saves WHERE post_id = ? AND user_id = ?", (post_id, user_id))
        connection.commit()
    return {"saved": saved}


def comment_row(row, viewer_id: int | None, staff: bool = False) -> dict:
    """A comment as a viewer sees it. A hidden one (by a moderator, the agent
    or reports) shows to others as «تعليق مخفي» — no author, no text; its
    author and staff still see it, with its status."""
    is_mine = viewer_id is not None and int(row["user_id"]) == viewer_id
    status = row["status"]
    if status == "visible" and row["report_hidden"]:
        status = "hidden"
    if status == "declined":
        status = "hidden"
    masked = status == "hidden" and not (is_mine or staff)
    return {
        "id": int(row["id"]),
        "post_id": row["post_id"],
        "author_name": "" if masked else row["author_name"],
        "body": "" if masked else row["body"],
        "is_mine": is_mine,
        "status": status,
        "created_at": int(row["created_at"]),
    }


def list_comments(post_id: str, viewer_id: int | None, staff: bool = False) -> list[dict]:
    """Visible and hidden comments; a pending one (waiting for its check) only for its author and staff."""
    with app_data_service.connect() as connection:
        _published(connection, post_id, viewer_id, staff)
        rows = connection.execute(
            "SELECT * FROM post_comments WHERE post_id = ? AND status IN ('visible', 'hidden', 'declined', 'pending') "
            "ORDER BY created_at, id",
            (post_id,),
        ).fetchall()
    return [
        comment_row(row, viewer_id, staff)
        for row in rows
        if row["status"] != "pending" or staff or (viewer_id is not None and int(row["user_id"]) == viewer_id)
    ]


def check_comment(body: str) -> str:
    """Deterministic comment checks; returns the cleaned body or raises."""
    cleaned = body.strip()
    if not cleaned:
        raise CommunityError("التعليق فارغ.")
    if len(_URL.findall(cleaned)) > MAX_LINKS_PER_COMMENT:
        raise CommunityError("التعليق يحوي روابط كثيرة (إرشادات المجتمع §٦).")
    return cleaned


def add_comment(post_id: str, user_id: int, author_name: str, body: str) -> dict:
    """A verified author's comment shows at once (checked afterwards); an
    unverified author's waits for its check (``pending``)."""
    cleaned = check_comment(body)
    moderation_service.ensure_can_post(user_id)
    verified = moderation_service.standing(user_id)["level"] == "verified"
    with app_data_service.connect() as connection:
        _published(connection, post_id, user_id)
        cursor = connection.execute(
            "INSERT INTO post_comments (post_id, user_id, author_name, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (post_id, user_id, author_name, cleaned, "visible" if verified else "pending", int(time.time())),
        )
        refresh_comment_count(connection, post_id)
        connection.commit()
        invalidate_trending()
        row = connection.execute("SELECT * FROM post_comments WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return comment_row(row, user_id)


def refresh_comment_count(connection, post_id: str) -> None:
    (count,) = connection.execute(
        "SELECT COUNT(*) FROM post_comments WHERE post_id = ? AND status = 'visible' AND report_hidden = 0", (post_id,)
    ).fetchone()
    connection.execute("UPDATE posts SET comment_count = ? WHERE id = ?", (count, post_id))


def delete_comment(comment_id: int, user_id: int) -> bool:
    """Its author deletes a comment (moderators decide through the queue)."""
    with app_data_service.connect() as connection:
        row = connection.execute("SELECT * FROM post_comments WHERE id = ?", (comment_id,)).fetchone()
        if row is None or int(row["user_id"]) != user_id:
            return False
        connection.execute("UPDATE post_comments SET status = 'deleted' WHERE id = ?", (comment_id,))
        connection.execute(
            "UPDATE moderation_queue SET decided_at = ?, decision = 'deleted' WHERE item_type = 'comment' "
            "AND item_id = ? AND decided_at IS NULL",
            (int(time.time()), str(comment_id)),
        )
        refresh_comment_count(connection, row["post_id"])
        connection.commit()
        invalidate_trending()
    return True


# ----------------------------------------------------------------------
# Reports
# ----------------------------------------------------------------------


def report(target_type: str, target_id: str, user_id: int, rule: str, note: str | None) -> dict:
    """Report a post or comment: it is re-checked at once, queued for a
    moderator, and hidden once three different people reported it."""
    with app_data_service.connect() as connection:
        if target_type == "post":
            target = connection.execute("SELECT user_id FROM posts WHERE id = ?", (target_id,)).fetchone()
        else:
            target = connection.execute(
                "SELECT user_id FROM post_comments WHERE id = ? AND status != 'deleted'",
                (int(target_id) if target_id.isdigit() else -1,),
            ).fetchone()
        if not target:
            raise CommunityError("Reported content not found.", status=404)
        if int(target["user_id"]) == user_id:
            raise CommunityError("You can't report your own content.")
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
            moderation_service.on_report(connection, target_type, target_id)
        connection.commit()
        invalidate_trending()
    return {"id": report_id}


def reports_for(connection, target_type: str, target_id: str) -> list[dict]:
    rows = connection.execute(
        "SELECT * FROM reports WHERE target_type = ? AND target_id = ? AND status = 'open' ORDER BY created_at",
        (target_type, str(target_id)),
    ).fetchall()
    return [
        {
            "id": int(row["id"]),
            "target_type": row["target_type"],
            "target_id": row["target_id"],
            "rule": row["rule"],
            "note": row["note"],
            "status": row["status"],
            "created_at": int(row["created_at"]),
        }
        for row in rows
    ]


def delete_user_content(user_id: int) -> None:
    """Account deletion: the user's posts, likes, comments, reports and moderation standing go too."""
    with app_data_service.connect() as connection:
        post_ids = [row["id"] for row in connection.execute("SELECT id FROM posts WHERE user_id = ?", (user_id,))]
        for post_id in post_ids:
            connection.execute("DELETE FROM post_likes WHERE post_id = ?", (post_id,))
            connection.execute("DELETE FROM post_comments WHERE post_id = ?", (post_id,))
            connection.execute("DELETE FROM post_saves WHERE post_id = ?", (post_id,))
            connection.execute("DELETE FROM moderation_checks WHERE item_type = 'post' AND item_id = ?", (post_id,))
            connection.execute("DELETE FROM moderation_queue WHERE item_type = 'post' AND item_id = ?", (post_id,))
        connection.execute("DELETE FROM posts WHERE user_id = ?", (user_id,))
        connection.execute("DELETE FROM post_saves WHERE user_id = ?", (user_id,))
        affected = {row["post_id"] for row in connection.execute("SELECT DISTINCT post_id FROM post_likes WHERE user_id = ?", (user_id,))}
        affected |= {row["post_id"] for row in connection.execute("SELECT DISTINCT post_id FROM post_comments WHERE user_id = ?", (user_id,))}
        for (comment_id,) in connection.execute("SELECT id FROM post_comments WHERE user_id = ?", (user_id,)).fetchall():
            connection.execute("DELETE FROM moderation_checks WHERE item_type = 'comment' AND item_id = ?", (str(comment_id),))
            connection.execute("DELETE FROM moderation_queue WHERE item_type = 'comment' AND item_id = ?", (str(comment_id),))
        connection.execute("DELETE FROM post_likes WHERE user_id = ?", (user_id,))
        connection.execute("DELETE FROM post_comments WHERE user_id = ?", (user_id,))
        connection.execute("DELETE FROM reports WHERE user_id = ?", (user_id,))
        moderation_service.delete_user(user_id, connection)
        feedback_service.delete_user(user_id, connection)
        for post_id in affected:
            (likes,) = connection.execute("SELECT COUNT(*) FROM post_likes WHERE post_id = ?", (post_id,)).fetchone()
            connection.execute("UPDATE posts SET like_count = ? WHERE id = ?", (likes, post_id))
            refresh_comment_count(connection, post_id)
        connection.commit()
        invalidate_trending()
