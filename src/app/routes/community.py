"""Community endpoints — publish, feed, posts, likes, comments, reports, appeals.

Reading the feed and published posts is open to guests. Writing (publish, like,
comment, report, appeal) needs an account when auth is enabled. Moderation is
in ``routes/moderation.py``. With auth disabled (single-user/local) the local
user is also its moderator.
"""

from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request

from src.app.core import config
from src.app.models.api import (
    AppealCreate,
    AppealItem,
    AuthorStanding,
    CommentCreate,
    CommentItem,
    DeleteResult,
    FeedPage,
    LikeResult,
    PostDetail,
    PostSummary,
    PublishRequest,
    PublishResult,
    ReportCreate,
    SaveResult,
    TagCount,
)
from src.app.services import app_data_service, community_service, moderation_service

router = APIRouter(prefix="/api", tags=["community"])


def _viewer(request: Request) -> tuple[int | None, bool, str]:
    """(user id or None for an anonymous guest, is moderator, display name)."""
    user = getattr(request.state, "auth_user", None)
    if user is not None and getattr(user, "id", None) is not None:
        name = (getattr(user, "name", None) or "").strip() or f"باحث {int(user.id)}"
        return int(user.id), bool(getattr(user, "is_staff", False)), name
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


def _raise(exc: community_service.CommunityError):
    detail = {"code": exc.code, "message": str(exc), **exc.extra} if exc.code else str(exc)
    raise HTTPException(status_code=exc.status, detail=detail) from exc


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
def feed(
    request: Request,
    cursor: str | None = Query(None, max_length=200),
    limit: int = Query(20, ge=1, le=50),
    sort: Literal["latest", "top"] = Query("latest"),
    q: str | None = Query(None, max_length=120),
    surah: int | None = Query(None, ge=1, le=114),
    tag: str | None = Query(None, max_length=40),
    mode: Literal["strict", "tafssir"] | None = Query(None),
    board: bool = Query(False),
    author: int | None = Query(None, ge=0),
    saved: bool = Query(False),
) -> FeedPage:
    """Public posts. `sort=latest` (keyset cursor) or `top` (trending, offset cursor); `q` matches
    title, summary, tags and section text (diacritics-insensitive); `saved` needs a signed-in viewer."""
    viewer_id, _, _ = _viewer(request)
    if saved and viewer_id is None:
        _require_user(request)
    return FeedPage(
        **community_service.feed(
            viewer_id, cursor, limit, sort=sort, q=q, surah=surah, tag=tag, mode=mode, board=board, author=author, saved=saved
        )
    )


@router.get("/community/tags", response_model=list[TagCount])
def tags(limit: int = Query(20, ge=1, le=50)) -> list[TagCount]:
    return [TagCount(**item) for item in community_service.popular_tags(limit)]


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


@router.put("/community/posts/{post_id}/save", response_model=SaveResult)
def save(request: Request, post_id: str) -> SaveResult:
    user_id, _, _ = _require_user(request)
    try:
        return SaveResult(**community_service.set_saved(post_id, user_id, True))
    except community_service.CommunityError as exc:
        _raise(exc)


@router.delete("/community/posts/{post_id}/save", response_model=SaveResult)
def unsave(request: Request, post_id: str) -> SaveResult:
    user_id, _, _ = _require_user(request)
    try:
        return SaveResult(**community_service.set_saved(post_id, user_id, False))
    except community_service.CommunityError as exc:
        _raise(exc)


@router.get("/community/posts/{post_id}/comments", response_model=list[CommentItem])
def comments(request: Request, post_id: str) -> list[CommentItem]:
    viewer_id, is_staff, _ = _viewer(request)
    try:
        return [CommentItem(**item) for item in community_service.list_comments(post_id, viewer_id, is_staff)]
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
    """Its author deletes a comment (moderators decide through the queue)."""
    user_id, _, _ = _require_user(request)
    return DeleteResult(deleted=community_service.delete_comment(comment_id, user_id))


@router.post("/community/reports", response_model=DeleteResult)
def report(request: Request, payload: ReportCreate) -> DeleteResult:
    """Report a post or comment to the moderators (returns `deleted: false` — nothing is removed)."""
    user_id, _, _ = _require_user(request)
    try:
        community_service.report(payload.target_type, payload.target_id, user_id, payload.rule, payload.note)
    except community_service.CommunityError as exc:
        _raise(exc)
    return DeleteResult(deleted=False)


@router.get("/community/me/standing", response_model=AuthorStanding, response_model_exclude_none=True)
def my_standing(request: Request) -> AuthorStanding:
    """The signed-in author's trust level, strikes and ban (if any)."""
    user_id, _, name = _require_user(request)
    return AuthorStanding(**moderation_service.standing(user_id), name=name)


@router.post("/community/appeals", response_model=AppealItem)
def appeal(request: Request, payload: AppealCreate) -> AppealItem:
    """Contest the latest decision on one's post, comment or ban — once per decision."""
    user_id, _, _ = _require_user(request)
    try:
        return AppealItem(**moderation_service.appeal(user_id, payload.target_type, payload.target_id, payload.message))
    except moderation_service.ModerationError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc


@router.get("/community/appeals", response_model=list[AppealItem], response_model_exclude_none=True)
def my_appeals(request: Request) -> list[AppealItem]:
    user_id, _, _ = _require_user(request)
    return [AppealItem(**item) for item in moderation_service.my_appeals(user_id)]
