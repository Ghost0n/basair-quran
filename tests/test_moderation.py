"""Community moderation — trust levels, the batches, the queue, strikes, bans, appeals, team, health
(docs/community-moderation-design.md)."""

import json

import pytest
from fastapi.testclient import TestClient

from src.app.services import auth_service, community_service, moderation_service, research_agent_service
from test_auth import build_auth_client

VALID = {"verdict": "valid", "confidence": 0.95, "issues": []}


class ScriptedProvider(research_agent_service.ResearchLlmProvider):
    """Answers each check with the verdict scripted for the text it contains."""

    def __init__(self, default=VALID):
        self.default = default
        self.rules: list[tuple[str, dict]] = []
        self.calls = []

    def when(self, needle: str, answer: dict) -> None:
        self.rules.insert(0, (needle, answer))

    def complete_json(self, system, user, *, stage):
        self.calls.append((system, json.loads(user), stage))
        for needle, answer in self.rules:
            if needle in user:
                return json.dumps(answer, ensure_ascii=False)
        return json.dumps(self.default, ensure_ascii=False)


def declined(quote: str, target: str = "n", rule: str = "disrespect") -> dict:
    return {
        "verdict": "declined",
        "confidence": 0.9,
        "issues": [{"target": target, "rule": rule, "severity": "high", "quote": quote,
                    "explanation": "explanation", "suggestion": "suggestion"}],
    }


@pytest.fixture
def world(tmp_path, monkeypatch):
    """An app with accounts: an admin, a moderator and two members, each with their own client."""
    provider = ScriptedProvider()
    research_agent_service.set_llm_provider_for_tests(provider)
    community_service.invalidate_trending()
    admin, finalize = build_auth_client(tmp_path, monkeypatch)
    clients = {"admin": admin}
    admin.post("/api/auth/login", json={"email": "admin@example.com", "password": "secret123"})
    for name in ("mod", "amina", "bilal"):
        client = TestClient(admin.app)
        client.post("/api/auth/signup", json={"email": f"{name}@example.com", "password": "hidayah8", "name": name})
        clients[name] = client
    ids = {name: client.get("/api/auth/session").json()["user"]["id"] for name, client in clients.items()}
    assert admin.post("/api/moderation/team", json={"email": "mod@example.com", "role": "moderator"}).status_code == 200
    try:
        yield clients, ids, provider
    finally:
        for name, client in clients.items():
            if name != "admin":
                client.close()
        finalize()
        research_agent_service.set_llm_provider_for_tests(None)


def publish(client, title: str, body: str = "تأمل في آيات الصبر.") -> str:
    document = client.post(
        "/api/documents",
        json={"title": title, "sections": [{"id": "n", "kind": "note", "body": body}], "references": [],
              "provenance": {"mode": "strict", "created_from": "manual"}},
    ).json()
    result = client.post(f"/api/documents/{document['id']}/publish", json={"visibility": "public", "accept_guidelines": True})
    assert result.status_code == 200, result.text
    return result.json()["post_id"]


def status(client, post_id: str) -> str:
    return client.get(f"/api/community/posts/{post_id}").json()["status"]


def feed_ids(client) -> list[str]:
    return [post["id"] for post in client.get("/api/community/feed").json()["posts"]]


def queue(client) -> list[tuple[str, str, str]]:
    return [(item["item_type"], item["item_id"], item["reason"]) for item in client.get("/api/moderation/queue").json()["items"]]


def test_first_post_needs_a_moderator_then_the_author_is_verified(world):
    clients, ids, provider = world
    amina, mod = clients["amina"], clients["mod"]

    first = publish(amina, "الصبر")
    moderation_service.run_batch()
    assert status(amina, first) == "pending_review"
    assert queue(mod) == [("post", first, "first_post")]
    assert amina.get("/api/community/me/standing").json()["level"] == "unverified"

    # Members don't moderate; moderators don't decide on their own content.
    assert amina.get("/api/moderation/queue").status_code == 403
    assert mod.post(f"/api/moderation/posts/{first}/decision", json={"decision": "approve"}).json()["status"] == "published"
    assert first in feed_ids(clients["bilal"])
    assert amina.get("/api/community/me/standing").json()["level"] == "verified"

    # Verified: a valid post is published by the batch, with no person involved.
    second = publish(amina, "الشكر")
    moderation_service.run_batch()
    assert status(amina, second) == "published" and queue(mod) == []
    own = publish(mod, "بحث المشرف")
    moderation_service.run_batch()
    assert status(mod, own) == "published"  # staff publish as verified authors


def test_an_agent_decline_returns_the_author_to_unverified_and_strikes_need_a_person(world):
    clients, ids, provider = world
    amina, mod, admin = clients["amina"], clients["mod"], clients["admin"]
    amina_id = ids["amina"]
    with moderation_service.app_data_service.connect() as connection:
        moderation_service._set_trust(connection, amina_id, level="verified")
        connection.commit()

    provider.when("كلام مسيء", declined("كلام مسيء"))
    post = publish(amina, "بحث", body="فيه كلام مسيء للناس")
    moderation_service.run_batch()
    assert status(amina, post) == "pending_review"
    assert queue(mod) == [("post", post, "declined")]
    standing = amina.get("/api/community/me/standing").json()
    # The agent's decline isn't a strike, but the author is unverified again.
    assert standing["level"] == "unverified" and standing["upheld_declines"] == 0

    # The author reads the reasons, in their language, on their own post.
    reviews = amina.get(f"/api/community/posts/{post}").json()["reviews"]
    assert reviews[0]["stage"] == "agent" and reviews[0]["issues"][0]["quote"] == "كلام مسيء"

    # A moderator upholding the decline (a reason is required) gives a strike.
    decision = f"/api/moderation/posts/{post}/decision"
    assert mod.post(decision, json={"decision": "decline"}).status_code == 422
    assert mod.post(decision, json={"decision": "decline", "note": "الإرشاد ٤"}).json()["status"] == "changes_requested"
    assert amina.get("/api/community/me/standing").json()["upheld_declines"] == 1

    # Three upheld declines make the author suspicious.
    for n in range(2):
        extra = publish(amina, f"بحث {n}", body="كلام مسيء آخر")
        moderation_service.run_batch()
        mod.post(f"/api/moderation/posts/{extra}/decision", json={"decision": "decline", "note": "الإرشاد ٤"})
    suspicious = admin.get("/api/moderation/users", params={"kind": "suspicious"}).json()
    assert [(user["user_id"], user["upheld_declines"]) for user in suspicious] == [(amina_id, 3)]
    assert suspicious[0]["history"][0]["action"] == "post_decline"


def test_bans_stop_posting_and_commenting_and_only_admins_ban_permanently(world):
    clients, ids, provider = world
    amina, bilal, mod, admin = clients["amina"], clients["bilal"], clients["mod"], clients["admin"]
    target = publish(bilal, "بحث بلال")
    moderation_service.run_batch()
    mod.post(f"/api/moderation/posts/{target}/decision", json={"decision": "approve"})

    ban = f"/api/moderation/users/{ids['amina']}/ban"
    assert mod.post(ban, json={"reason": "مخالفات متكررة"}).status_code == 403  # permanent: admins only
    assert mod.post(ban, json={"days": 7, "reason": "مخالفات متكررة"}).json()["banned"] is True
    blocked = amina.post(f"/api/community/posts/{target}/comments", json={"body": "تعليق"})
    assert blocked.status_code == 403 and blocked.json()["detail"]["code"] == "banned"
    document = amina.post(
        "/api/documents", json={"title": "x", "sections": [{"id": "n", "kind": "note", "body": "x"}], "references": [], "provenance": {}}
    ).json()
    publish_blocked = amina.post(f"/api/documents/{document['id']}/publish", json={"accept_guidelines": True})
    assert publish_blocked.status_code == 403
    # Reading, liking and saving stay open.
    assert amina.post(f"/api/community/posts/{target}/like").status_code == 200
    assert [user["user_id"] for user in mod.get("/api/moderation/users", params={"kind": "banned"}).json()] == [ids["amina"]]
    # A moderator can't ban another moderator; an admin can ban permanently.
    assert mod.post(f"/api/moderation/users/{ids['admin']}/ban", json={"days": 7, "reason": "x"}).status_code == 403
    assert admin.post(ban, json={"reason": "نهائي"}).json()["banned_until"] == -1
    assert mod.post(f"/api/moderation/users/{ids['amina']}/unban", json={}).status_code == 403
    assert admin.post(f"/api/moderation/users/{ids['amina']}/unban", json={}).json()["banned"] is False
    assert amina.post(f"/api/community/posts/{target}/comments", json={"body": "تعليق"}).status_code == 200


def test_appeals_are_once_per_decision_and_reviewed_by_another_moderator(world):
    clients, ids, provider = world
    amina, mod, admin = clients["amina"], clients["mod"], clients["admin"]
    post = publish(amina, "بحث")
    moderation_service.run_batch()
    mod.post(f"/api/moderation/posts/{post}/decision", json={"decision": "decline", "note": "مرجع ناقص"})
    assert amina.get("/api/community/me/standing").json()["upheld_declines"] == 1

    appeal = amina.post("/api/community/appeals", json={"target_type": "post", "target_id": post, "message": "المرجع موجود"})
    assert appeal.status_code == 200
    item = appeal.json()
    assert item["decision"] == "post_decline" and item["decision_reason"] == "مرجع ناقص"
    again = amina.post("/api/community/appeals", json={"target_type": "post", "target_id": post, "message": "مرة أخرى"})
    assert again.status_code == 409

    appeals = mod.get("/api/moderation/queue").json()["appeals"]
    assert [entry["id"] for entry in appeals] == [item["id"]]
    decide = f"/api/moderation/appeals/{item['id']}/decision"
    assert mod.post(decide, json={"outcome": "overturn"}).status_code == 403  # not the one who decided
    overturned = admin.post(decide, json={"outcome": "overturn", "note": "صحيح"}).json()
    assert overturned["status"] == "overturned"
    assert status(amina, post) == "published"
    assert amina.get("/api/community/me/standing").json()["upheld_declines"] == 0
    assert [entry["status"] for entry in amina.get("/api/community/appeals").json()] == ["overturned"]


def test_comments_wait_for_unverified_authors_and_hide_when_declined(world):
    clients, ids, provider = world
    amina, bilal, mod = clients["amina"], clients["bilal"], clients["mod"]
    post = publish(mod, "بحث المشرف")
    moderation_service.run_batch()

    pending = amina.post(f"/api/community/posts/{post}/comments", json={"body": "تعليق جميل"}).json()
    assert pending["status"] == "pending"
    # A pending comment shows to its author only.
    assert [c["id"] for c in amina.get(f"/api/community/posts/{post}/comments").json()] == [pending["id"]]
    assert bilal.get(f"/api/community/posts/{post}/comments").json() == []
    assert bilal.get(f"/api/community/posts/{post}").json()["comment_count"] == 0

    provider.when("تعليق مسيء", declined("تعليق مسيء", target="comment"))
    rude = amina.post(f"/api/community/posts/{post}/comments", json={"body": "تعليق مسيء"}).json()
    moderation_service.run_batch()
    shown = {c["id"]: c for c in bilal.get(f"/api/community/posts/{post}/comments").json()}
    assert shown[pending["id"]]["status"] == "visible" and rude["id"] not in shown
    assert queue(mod) == [("comment", str(rude["id"]), "declined")]
    # The comment checks get the post as context and run with the comment rules.
    comment_call = next(call for call in provider.calls if call[2] == "moderation_comment")
    assert comment_call[1]["post"]["title"] == "بحث المشرف" and "off_topic" in comment_call[0]

    # A verified author's comment shows at once; a later decline hides it as «تعليق مخفي».
    with moderation_service.app_data_service.connect() as connection:
        moderation_service._set_trust(connection, ids["bilal"], level="verified")
        connection.commit()
    provider.when("رد مسيء", declined("رد مسيء", target="comment"))
    reply = bilal.post(f"/api/community/posts/{post}/comments", json={"body": "رد مسيء"}).json()
    assert reply["status"] == "visible"
    moderation_service.run_batch()
    hidden = {c["id"]: c for c in amina.get(f"/api/community/posts/{post}/comments").json()}[reply["id"]]
    assert hidden == {**hidden, "status": "hidden", "body": "", "author_name": ""}
    assert {c["id"]: c for c in bilal.get(f"/api/community/posts/{post}/comments").json()}[reply["id"]]["body"] == "رد مسيء"


def test_reports_recheck_at_once_and_three_reporters_hide_the_post(world, monkeypatch):
    clients, ids, provider = world
    amina, bilal, mod, admin = clients["amina"], clients["bilal"], clients["mod"], clients["admin"]
    post = publish(mod, "بحث")
    moderation_service.run_batch()

    assert amina.post("/api/community/reports", json={"target_type": "post", "target_id": post, "rule": "integrity"}).status_code == 200
    assert queue(admin) == [("post", post, "reported")]
    # Re-checked between batches; a valid answer leaves it up.
    assert moderation_service.run_priority()["checked"] == 1
    assert post in feed_ids(amina)

    # Three different reporters hide it until a moderator decides.
    bilal.post("/api/community/reports", json={"target_type": "post", "target_id": post, "rule": "integrity"})
    amina.post("/api/community/reports", json={"target_type": "post", "target_id": post, "rule": "integrity"})  # same person
    assert post in feed_ids(amina)
    admin.post("/api/community/reports", json={"target_type": "post", "target_id": post, "rule": "integrity"})
    assert post not in feed_ids(amina)
    assert amina.get(f"/api/community/posts/{post}").status_code == 404
    assert mod.get(f"/api/community/posts/{post}").json()["hidden"] is True  # its author still sees it

    restored = admin.post(f"/api/moderation/posts/{post}/decision", json={"decision": "restore"}).json()
    assert restored["hidden"] is False and post in feed_ids(amina)
    assert queue(admin) == []

    # A reported item the agent declines is hidden at once.
    provider.when("بحث آخر", declined("بحث آخر", target="summary"))
    other = publish(mod, "بحث آخر", body="نص عادي")
    with moderation_service.app_data_service.connect() as connection:
        connection.execute("UPDATE posts SET status = 'published', published_at = 1 WHERE id = ?", (other,))
        connection.commit()
    bilal.post("/api/community/reports", json={"target_type": "post", "target_id": other, "rule": "disrespect"})
    moderation_service.run_priority()
    assert other not in feed_ids(bilal)


def test_the_agent_answers_in_the_authors_interface_language(world):
    clients, ids, provider = world
    amina = clients["amina"]
    amina.patch("/api/user/preferences", json={"ui_language": "fr"})
    publish(amina, "La patience")
    moderation_service.run_batch()
    system, _, _ = provider.calls[-1]
    assert "in French" in system


def test_team_health_budget_and_action_log(world, monkeypatch):
    clients, ids, provider = world
    admin, mod, amina = clients["admin"], clients["mod"], clients["amina"]
    team = admin.get("/api/moderation/team").json()
    assert [(member["email"], member["role"]) for member in team] == [("admin@example.com", "admin"), ("mod@example.com", "moderator")]
    assert mod.get("/api/moderation/team").status_code == 403
    assert mod.get("/api/auth/session").json()["user"]["is_moderator"] is True

    # The daily budget stops checks; the backlog waits for the next day.
    monkeypatch.setenv("QBASAIR_MODERATION_DAILY_BUDGET", "1")
    publish(amina, "أول")
    publish(amina, "ثانٍ")
    result = admin.post("/api/moderation/run").json()
    assert result["checked"] == 1 and result["budget_reached"] is True
    health = mod.get("/api/moderation/health").json()
    assert health["backlog"]["queued_posts"] == 1 and health["today"]["checks"] == 1 and health["today"]["budget"] == 1
    assert health["last_batch"]["budget_reached"] is True

    first = queue(mod)[0][1]
    mod.post(f"/api/moderation/posts/{first}/decision", json={"decision": "approve"})
    assert [entry["action"] for entry in mod.get("/api/moderation/actions", params={"mine": True}).json()] == ["post_approve"]
    assert {entry["action"] for entry in admin.get("/api/moderation/actions").json()} >= {"post_approve", "appoint_moderator"}

    # Removing a moderator takes the panel away.
    admin.post("/api/moderation/team", json={"email": "mod@example.com", "role": "user"})
    assert mod.get("/api/moderation/queue").status_code == 403
    assert auth_service.get_user_by_email("mod@example.com").is_moderator is False
