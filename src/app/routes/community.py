"""Community endpoints — publish, feed, posts, likes, comments, reports, moderation.

Reading the feed and published posts is open to guests. Writing (publish, like,
comment, report) needs an account when auth is enabled; moderation needs an
admin. With auth disabled (single-user/local) the local user may do both.
"""

from fastapi import APIRouter, HTTPException, Query, Request

from src.app.core import config
from src.app.models.api import (
    CommentCreate,
    CommentItem,
    DeleteResult,
    FeedPage,
    LikeResult,
    ModerationDecision,
    ModerationQueue,
    PostDetail,
    PostSummary,
    PublishRequest,
    PublishResult,
    ReportCreate,
)
from src.app.services import app_data_service, community_service

router = APIRouter(prefix="/api", tags=["community"])


def _viewer(request: Request) -> tuple[int | None, bool, str]:
    """(user id or None for an anonymous guest, is moderator, display name)."""
    user = getattr(request.state, "auth_user", None)
    if user is not None and getattr(user, "id", None) is not None:
        name = (getattr(user, "name", None) or "").strip() or f"باحث {int(user.id)}"
        return int(user.id), bool(getattr(user, "is_admin", False)), name
    if not config.is_auth_enabled():
        return app_data_service.DEFAULT_USER_ID, True, "باحث"
    return None, False, ""


def _require_user(request: Request) -> tuple[int, bool, str]:
    user_id, is_moderator, name = _viewer(request)
    if user_id is None:
        raise HTTPException(
            status_code=401,
            detail={"code": "auth_required", "gate": "community", "message": "Authentication required."},
        )
    return user_id, is_moderator, name


def _require_moderator(request: Request) -> int:
    user_id, is_moderator, _ = _require_user(request)
    if not is_moderator:
        raise HTTPException(status_code=403, detail="Moderator access required.")
    return user_id


def _raise(exc: community_service.CommunityError):
    raise HTTPException(status_code=exc.status, detail=str(exc)) from exc


@router.post("/documents/{document_id}/publish", response_model=PublishResult, response_model_exclude_none=True)
def publish(request: Request, document_id: str, payload: PublishRequest) -> PublishResult:
    user_id, _, name = _require_user(request)
    try:
        result = community_service.publish_document(
            document_id, user_id, name, payload.visibility, payload.accept_guidelines
        )
    except community_service.CommunityError as exc:
        _raise(exc)
    return PublishResult(**result)


@router.get("/community/feed", response_model=FeedPage, response_model_exclude_none=True)
def feed(request: Request, cursor: str | None = Query(None, max_length=200), limit: int = Query(20, ge=1, le=50)) -> FeedPage:
    viewer_id, _, _ = _viewer(request)
    return FeedPage(**community_service.feed(viewer_id, cursor, limit))


@router.get("/community/mine", response_model=list[PostSummary], response_model_exclude_none=True)
def mine(request: Request) -> list[PostSummary]:
    user_id, _, _ = _require_user(request)
    return [PostSummary(**post) for post in community_service.my_posts(user_id)]


@router.get("/community/posts/{post_id}", response_model=PostDetail, response_model_exclude_none=True)
def get_post(request: Request, post_id: str) -> PostDetail:
    viewer_id, is_moderator, _ = _viewer(request)
    post = community_service.get_post(post_id, viewer_id, is_moderator)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found.")
    return PostDetail(**post)


@router.delete("/community/posts/{post_id}", response_model=DeleteResult)
def withdraw(request: Request, post_id: str) -> DeleteResult:
    user_id, _, _ = _require_user(request)
    return DeleteResult(deleted=community_service.withdraw_post(post_id, user_id))


@router.post("/community/posts/{post_id}/like", response_model=LikeResult)
def like(request: Request, post_id: str) -> LikeResult:
    user_id, _, _ = _require_user(request)
    try:
        return LikeResult(**community_service.set_like(post_id, user_id, True))
    except community_service.CommunityError as exc:
        _raise(exc)


@router.delete("/community/posts/{post_id}/like", response_model=LikeResult)
def unlike(request: Request, post_id: str) -> LikeResult:
    user_id, _, _ = _require_user(request)
    try:
        return LikeResult(**community_service.set_like(post_id, user_id, False))
    except community_service.CommunityError as exc:
        _raise(exc)


@router.get("/community/posts/{post_id}/comments", response_model=list[CommentItem])
def comments(request: Request, post_id: str) -> list[CommentItem]:
    viewer_id, _, _ = _viewer(request)
    try:
        return [CommentItem(**item) for item in community_service.list_comments(post_id, viewer_id)]
    except community_service.CommunityError as exc:
        _raise(exc)


@router.post("/community/posts/{post_id}/comments", response_model=CommentItem)
def add_comment(request: Request, post_id: str, payload: CommentCreate) -> CommentItem:
    user_id, _, name = _require_user(request)
    try:
        return CommentItem(**community_service.add_comment(post_id, user_id, name, payload.body))
    except community_service.CommunityError as exc:
        _raise(exc)


@router.delete("/community/comments/{comment_id}", response_model=DeleteResult)
def delete_comment(request: Request, comment_id: int) -> DeleteResult:
    user_id, is_moderator, _ = _require_user(request)
    return DeleteResult(deleted=community_service.delete_comment(comment_id, user_id, is_moderator))


@router.post("/community/reports", response_model=DeleteResult)
def report(request: Request, payload: ReportCreate) -> DeleteResult:
    """Report a post or comment to the moderators (returns `deleted: false` — nothing is removed)."""
    user_id, _, _ = _require_user(request)
    try:
        community_service.report(payload.target_type, payload.target_id, user_id, payload.rule, payload.note)
    except community_service.CommunityError as exc:
        _raise(exc)
    return DeleteResult(deleted=False)


@router.get("/moderation/queue", response_model=ModerationQueue, response_model_exclude_none=True)
def moderation_queue(request: Request) -> ModerationQueue:
    _require_moderator(request)
    return ModerationQueue(**community_service.moderation_queue())


@router.post("/moderation/posts/{post_id}/decision", response_model=PostDetail, response_model_exclude_none=True)
def decide(request: Request, post_id: str, payload: ModerationDecision) -> PostDetail:
    moderator_id = _require_moderator(request)
    post = community_service.decide(post_id, payload.decision, moderator_id, payload.note)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found.")
    return PostDetail(**post)


@router.post("/moderation/comments/{comment_id}/hide", response_model=DeleteResult)
def hide_comment(request: Request, comment_id: int) -> DeleteResult:
    _require_moderator(request)
    return DeleteResult(deleted=community_service.hide_comment(comment_id))


@router.post("/moderation/reports/{report_id}/resolve", response_model=DeleteResult)
def resolve_report(request: Request, report_id: int) -> DeleteResult:
    _require_moderator(request)
    return DeleteResult(deleted=community_service.resolve_report(report_id))
