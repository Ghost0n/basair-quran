"""Community — publishing pipeline, AI audit agent, feed, likes, comments, reports, moderation."""

import json

import pytest

from src.app.services import audit_agent_service, community_service, research_agent_service
from test_auth import build_auth_client


class AuditProvider(research_agent_service.ResearchLlmProvider):
    """Returns a canned audit answer (or raises) instead of calling a model."""

    def __init__(self, answer=None, error=None):
        self.answer = answer
        self.error = error
        self.calls = []

    def complete_json(self, system, user, *, stage):
        self.calls.append((system, json.loads(user), stage))
        if self.error:
            raise self.error
        return json.dumps(self.answer, ensure_ascii=False)


@pytest.fixture(autouse=True)
def reset_provider():
    research_agent_service.set_llm_provider_for_tests(None)
    # The trending cache is process-wide; each test has its own database.
    community_service.invalidate_trending()
    yield
    research_agent_service.set_llm_provider_for_tests(None)


def _document(api_client, **overrides):
    body = {
        "title": "الصبر في القرآن",
        "summary": "تأملات في آيات الصبر.",
        "sections": [
            {"id": "s1", "kind": "ayahs", "ayahs": [{"mushaf_id": 1, "surah_id": 1, "ayah": 2, "text": ""}]},
            {"id": "s2", "kind": "note", "body": "الصبر مفتاح الفرج في سياق الآيات."},
        ],
        "references": [],
        "provenance": {"mode": "strict", "created_from": "manual"},
    }
    body.update(overrides)
    return api_client.post("/api/documents", json=body).json()


def _publish(api_client, document_id, **extra):
    return api_client.post(
        f"/api/documents/{document_id}/publish", json={"visibility": "public", "accept_guidelines": True, **extra}
    )


def test_passing_audit_publishes_to_the_feed(api_client):
    provider = AuditProvider({"verdict": "pass", "issues": []})
    research_agent_service.set_llm_provider_for_tests(provider)
    document = _document(api_client)

    result = _publish(api_client, document["id"]).json()
    assert result["status"] == "published"
    assert result["audit"]["publishable"] is True
    assert result["ai_audit"]["verdict"] == "pass"
    # The agent sees the verified ayah text, never corpus data.
    _, audit_input, stage = provider.calls[0]
    assert stage == "community_audit"
    assert audit_input["document"]["sections"][0]["ayahs"] == [{"ref": "1:2", "text": "shared verse 2"}]

    feed = api_client.get("/api/community/feed").json()
    assert [post["id"] for post in feed["posts"]] == [result["post_id"]]
    post = feed["posts"][0]
    assert post["excerpt"] == {"surah_id": 1, "ayah": 2, "text": "shared verse 2"}
    assert post["author_name"] == "باحث" and post["is_mine"] is True

    detail = api_client.get(f"/api/community/posts/{result['post_id']}").json()
    assert detail["document"]["title"] == "الصبر في القرآن"
    assert [review["stage"] for review in detail["reviews"]] == ["ai", "deterministic"]


def test_blocked_by_deterministic_audit_creates_no_post(api_client):
    research_agent_service.set_llm_provider_for_tests(AuditProvider({"verdict": "pass", "issues": []}))
    bad = _document(
        api_client,
        sections=[{"id": "s1", "kind": "ayahs", "ayahs": [{"mushaf_id": 1, "surah_id": 1, "ayah": 2, "text": "not the ayah"}]}],
    )
    result = _publish(api_client, bad["id"]).json()
    assert result["status"] == "blocked" and result.get("post_id") is None
    assert api_client.get("/api/community/feed").json()["posts"] == []
    assert _publish(api_client, bad["id"], accept_guidelines=False).status_code == 422


def test_unavailable_provider_fails_closed_to_moderation(api_client):
    research_agent_service.set_llm_provider_for_tests(
        AuditProvider(error=research_agent_service.ResearchProviderUnavailable("down"))
    )
    document = _document(api_client)
    result = _publish(api_client, document["id"]).json()
    assert result["status"] == "pending_review"
    assert result["ai_audit"] == {"verdict": "review", "issues": [], "fallback_reason": "provider_unavailable"}
    assert api_client.get("/api/community/feed").json()["posts"] == []

    queue = api_client.get("/api/moderation/queue").json()
    assert [post["id"] for post in queue["posts"]] == [result["post_id"]]
    decided = api_client.post(
        f"/api/moderation/posts/{result['post_id']}/decision", json={"decision": "publish", "note": "سليم"}
    ).json()
    assert decided["status"] == "published"
    assert decided["reviews"][0]["stage"] == "human"
    assert len(api_client.get("/api/community/feed").json()["posts"]) == 1


def test_audit_parsing_guards_against_hallucinated_quotes_and_derives_verdict():
    document = {
        "title": "t",
        "summary": None,
        "sections": [{"id": "s2", "kind": "note", "body": "يجب على كل مسلم أن يفعل كذا."}],
    }
    raw = json.dumps(
        {
            "verdict": "pass",
            "issues": [
                {"section_id": "s2", "rule": "ruling_as_fact", "severity": "medium", "quote": "يجب على كل مسلم",
                 "explanation_ar": "حكم بلا مرجع."},
                {"section_id": "s2", "rule": "disrespect", "severity": "high", "quote": "نص غير موجود",
                 "explanation_ar": "x"},
                {"section_id": "s9", "rule": "integrity", "severity": "high", "explanation_ar": "x"},
            ],
        },
        ensure_ascii=False,
    )
    parsed = audit_agent_service.parse_audit(raw, document)
    assert [issue["rule"] for issue in parsed["issues"]] == ["ruling_as_fact"]
    assert parsed["verdict"] == "review"  # derived from severity, stricter than the stated "pass"
    assert audit_agent_service.parse_audit('{"verdict":"reject","issues":[]}', document)["verdict"] == "reject"


def test_invalid_model_output_fails_closed():
    research_agent_service.set_llm_provider_for_tests(AuditProvider({"not": "an audit"}))
    result = audit_agent_service.run_ai_audit({"title": "t", "sections": []})
    assert result["verdict"] == "review"


def test_likes_comments_reports_and_withdraw(api_client):
    research_agent_service.set_llm_provider_for_tests(AuditProvider({"verdict": "pass", "issues": []}))
    post_id = _publish(api_client, _document(api_client)["id"]).json()["post_id"]

    assert api_client.post(f"/api/community/posts/{post_id}/like").json() == {"liked": True, "like_count": 1}
    assert api_client.post(f"/api/community/posts/{post_id}/like").json()["like_count"] == 1  # idempotent
    assert api_client.get("/api/community/feed").json()["posts"][0]["liked_by_me"] is True
    assert api_client.delete(f"/api/community/posts/{post_id}/like").json() == {"liked": False, "like_count": 0}

    comment = api_client.post(f"/api/community/posts/{post_id}/comments", json={"body": " جزاك الله خيراً "}).json()
    assert comment["body"] == "جزاك الله خيراً" and comment["is_mine"] is True
    spam = "http://a.com http://b.com http://c.com"
    assert api_client.post(f"/api/community/posts/{post_id}/comments", json={"body": spam}).status_code == 422
    assert api_client.get(f"/api/community/posts/{post_id}").json()["comment_count"] == 1

    assert api_client.post(
        "/api/community/reports", json={"target_type": "comment", "target_id": str(comment["id"]), "rule": "disrespect"}
    ).status_code == 200
    reports = api_client.get("/api/moderation/queue").json()["reports"]
    assert reports[0]["target_preview"] == "جزاك الله خيراً"
    assert api_client.post(f"/api/moderation/comments/{comment['id']}/hide").json() == {"deleted": True}
    assert api_client.get(f"/api/community/posts/{post_id}/comments").json() == []
    assert api_client.get("/api/moderation/queue").json()["reports"] == []

    assert api_client.delete(f"/api/community/posts/{post_id}").json() == {"deleted": True}
    assert api_client.get("/api/community/feed").json()["posts"] == []
    assert api_client.post(f"/api/community/posts/{post_id}/like").status_code == 404


def test_republish_updates_the_same_post_with_a_new_snapshot(api_client):
    research_agent_service.set_llm_provider_for_tests(AuditProvider({"verdict": "pass", "issues": []}))
    document = _document(api_client)
    first = _publish(api_client, document["id"]).json()["post_id"]
    body = {k: v for k, v in api_client.get(f"/api/documents/{document['id']}").json().items()
            if k not in {"id", "v", "version", "created_at", "updated_at"}}
    body["title"] = "عنوان محدَّث"
    api_client.put(f"/api/documents/{document['id']}", json=body)
    second = _publish(api_client, document["id"]).json()["post_id"]
    assert first == second
    assert api_client.get(f"/api/community/posts/{first}").json()["title"] == "عنوان محدَّث"


def test_feed_pagination(api_client):
    research_agent_service.set_llm_provider_for_tests(AuditProvider({"verdict": "pass", "issues": []}))
    ids = [_publish(api_client, _document(api_client, title=f"بحث {n}")["id"]).json()["post_id"] for n in range(3)]
    page1 = api_client.get("/api/community/feed", params={"limit": 2}).json()
    assert len(page1["posts"]) == 2 and page1["next_cursor"]
    page2 = api_client.get("/api/community/feed", params={"limit": 2, "cursor": page1["next_cursor"]}).json()
    assert page2.get("next_cursor") is None
    assert {post["id"] for post in page1["posts"] + page2["posts"]} == set(ids)


def test_auth_gating_guest_reads_members_write_admins_moderate(tmp_path, monkeypatch):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        research_agent_service.set_llm_provider_for_tests(AuditProvider({"verdict": "pass", "issues": []}))
        assert client.get("/api/community/feed").status_code == 200
        assert client.post("/api/community/posts/x/like").status_code == 401
        assert client.get("/api/moderation/queue").status_code == 401

        client.post("/api/auth/signup", json={"email": "member@example.com", "password": "hidayah8"})
        assert client.get("/api/moderation/queue").status_code == 403
        document = client.post(
            "/api/documents",
            json={"title": "بحث", "sections": [{"id": "s", "kind": "note", "body": "نص"}], "references": [],
                  "provenance": {}},
        ).json()
        post = client.post(
            f"/api/documents/{document['id']}/publish", json={"visibility": "unlisted", "accept_guidelines": True}
        ).json()
        assert post["status"] == "published"
        detail = client.get(f"/api/community/posts/{post['post_id']}").json()
        assert detail["author_name"].startswith("باحث")
        # Unlisted: reachable by link, absent from the feed.
        assert client.get("/api/community/feed").json()["posts"] == []
    finally:
        finalize()


def test_account_deletion_removes_community_content(api_client):
    research_agent_service.set_llm_provider_for_tests(AuditProvider({"verdict": "pass", "issues": []}))
    post_id = _publish(api_client, _document(api_client)["id"]).json()["post_id"]
    community_service.add_comment(post_id, 7, "زائر", "تعليق")
    community_service.set_like(post_id, 7, True)
    community_service.delete_user_content(7)
    post = api_client.get(f"/api/community/posts/{post_id}").json()
    assert post["like_count"] == 0 and post["comment_count"] == 0


def _publish_note(api_client, title, body="نص", **overrides):
    document = _document(
        api_client, title=title, sections=[{"id": "n", "kind": "note", "body": body}], **overrides
    )
    return _publish(api_client, document["id"]).json()["post_id"]


def test_feed_filters_search_surah_tag_mode_board_author(api_client):
    research_agent_service.set_llm_provider_for_tests(AuditProvider({"verdict": "pass", "issues": []}))
    patience = _publish(api_client, _document(api_client, tags=["الصبر", "#تدبر"])["id"]).json()["post_id"]
    gratitude = _publish_note(
        api_client, "الشكر والنعمة", body="تأمّلٌ في الشُّكرِ — قراءة تفسيرية تجريبية.", tags=["الشكر"], summary="عن النعمة والشكر.",
        provenance={"mode": "tafssir", "created_from": "manual"},
    )

    def ids(**params):
        return [post["id"] for post in api_client.get("/api/community/feed", params=params).json()["posts"]]

    # Search is diacritics- and hamza-insensitive and also matches section text.
    assert ids(q="الشكر") == [gratitude]
    assert ids(q="تاملات") == [patience]
    assert ids(q="نعمة") == [gratitude]
    assert ids(q="مفتاح الفرج") == [patience]
    assert ids(q="غير موجود") == []
    # Surah: only posts quoting an ayah of that surah.
    assert ids(surah=1) == [patience]
    # Tags match whole tags (the stored form drops «#»).
    assert ids(tag="تدبر") == [patience]
    assert ids(tag="#الصبر") == [patience]
    assert ids(tag="الص") == []
    assert ids(mode="tafssir") == [gratitude]
    assert ids(mode="strict") == [patience]
    assert ids(board=True) == []
    assert set(ids(author=community_service.app_data_service.DEFAULT_USER_ID)) == {patience, gratitude}
    assert ids(author=999) == []

    summary = api_client.get("/api/community/feed", params={"tag": "الصبر"}).json()["posts"][0]
    assert summary["tags"] == ["الصبر", "تدبر"]
    assert summary["surah_ids"] == [1]
    assert summary["reading_minutes"] == 1
    assert summary["author_id"] == community_service.app_data_service.DEFAULT_USER_ID

    tags = api_client.get("/api/community/tags").json()
    assert {item["tag"] for item in tags} == {"الصبر", "تدبر", "الشكر"}


def test_trending_sort_weighs_engagement_against_age(api_client):
    research_agent_service.set_llm_provider_for_tests(AuditProvider({"verdict": "pass", "issues": []}))
    older = _publish_note(api_client, "قديم")
    newer = _publish_note(api_client, "جديد")
    with community_service.app_data_service.connect() as connection:
        connection.execute("UPDATE posts SET published_at = published_at - 3600 WHERE id = ?", (older,))
        connection.commit()
    # Latest: newest first. Top with no reactions: the newer post wins too.
    latest = [post["id"] for post in api_client.get("/api/community/feed").json()["posts"]]
    assert latest == [newer, older]
    for user in (11, 12, 13):
        community_service.set_like(older, user, True)
    community_service.add_comment(older, 11, "زائر", "تعليق")
    page1 = api_client.get("/api/community/feed", params={"sort": "top", "limit": 1}).json()
    assert [post["id"] for post in page1["posts"]] == [older]
    page2 = api_client.get(
        "/api/community/feed", params={"sort": "top", "limit": 1, "cursor": page1["next_cursor"]}
    ).json()
    assert [post["id"] for post in page2["posts"]] == [newer] and page2.get("next_cursor") is None
    # A much older post needs far more engagement to stay on top.
    assert community_service.trending_score(3, 1, 3600) > community_service.trending_score(0, 0, 0)
    assert community_service.trending_score(3, 1, 30 * 86400) < community_service.trending_score(0, 0, 0)


def test_saved_posts_are_private_bookmarks(api_client):
    research_agent_service.set_llm_provider_for_tests(AuditProvider({"verdict": "pass", "issues": []}))
    kept = _publish_note(api_client, "محفوظ")
    _publish_note(api_client, "غير محفوظ")
    assert api_client.put(f"/api/community/posts/{kept}/save").json() == {"saved": True}
    assert api_client.put(f"/api/community/posts/{kept}/save").json() == {"saved": True}  # idempotent
    saved = api_client.get("/api/community/feed", params={"saved": True}).json()["posts"]
    assert [post["id"] for post in saved] == [kept] and saved[0]["saved_by_me"] is True
    assert api_client.get(f"/api/community/posts/{kept}").json()["saved_by_me"] is True
    assert api_client.delete(f"/api/community/posts/{kept}/save").json() == {"saved": False}
    assert api_client.get("/api/community/feed", params={"saved": True}).json()["posts"] == []
    assert api_client.put("/api/community/posts/nope/save").status_code == 404


def test_saved_feed_requires_an_account_when_auth_is_enabled(tmp_path, monkeypatch):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        assert client.get("/api/community/feed", params={"saved": True}).status_code == 401
        assert client.put("/api/community/posts/x/save").status_code == 401
    finally:
        finalize()


def test_existing_posts_are_backfilled_with_filter_columns(api_client):
    research_agent_service.set_llm_provider_for_tests(AuditProvider({"verdict": "pass", "issues": []}))
    post_id = _publish(api_client, _document(api_client, tags=["الصبر"])["id"]).json()["post_id"]
    with community_service.app_data_service.connect() as connection:
        connection.execute("UPDATE posts SET surahs = '', tags = '', search_text = '', indexed = 0 WHERE id = ?", (post_id,))
        connection.commit()
    community_service.ensure_tables()
    assert [post["id"] for post in api_client.get("/api/community/feed", params={"tag": "الصبر", "surah": 1}).json()["posts"]] == [post_id]


def test_trending_ranking_is_cached_and_invalidated_by_writes(api_client, monkeypatch):
    research_agent_service.set_llm_provider_for_tests(AuditProvider({"verdict": "pass", "issues": []}))
    community_service.invalidate_trending()
    older = _publish_note(api_client, "قديم")
    newer = _publish_note(api_client, "جديد")
    with community_service.app_data_service.connect() as connection:
        connection.execute("UPDATE posts SET published_at = published_at - 3600 WHERE id = ?", (older,))
        connection.commit()
    community_service.invalidate_trending()

    def top():
        return [post["id"] for post in api_client.get("/api/community/feed", params={"sort": "top"}).json()["posts"]]

    assert top() == [newer, older]
    # A direct DB change is not seen while the ranking is cached...
    with community_service.app_data_service.connect() as connection:
        connection.execute("UPDATE posts SET like_count = 50 WHERE id = ?", (older,))
        connection.commit()
    assert top() == [newer, older]
    # ...but a community write drops the cache.
    community_service.set_like(older, 99, True)
    with community_service.app_data_service.connect() as connection:
        connection.execute("UPDATE posts SET like_count = 50 WHERE id = ?", (older,))
        connection.commit()
    community_service.invalidate_trending()
    assert top() == [older, newer]
    # Expired entries are recomputed.
    monkeypatch.setattr(community_service, "TRENDING_CACHE_SECONDS", 0)
    with community_service.app_data_service.connect() as connection:
        connection.execute("UPDATE posts SET like_count = 0 WHERE id = ?", (older,))
        connection.commit()
    assert top() == [newer, older]
    # A post withdrawn after ranking drops out of the cached page.
    monkeypatch.setattr(community_service, "TRENDING_CACHE_SECONDS", 60)
    top()
    with community_service.app_data_service.connect() as connection:
        connection.execute("UPDATE posts SET status = 'withdrawn' WHERE id = ?", (newer,))
        connection.commit()
    assert top() == [older]
