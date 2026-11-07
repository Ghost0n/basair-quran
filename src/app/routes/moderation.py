"""Moderation endpoints — the supervision panel (docs/community-moderation-design.md).

Staff (moderators and admins) see the queue, decide on posts and comments,
review appeals, ban and unban, and triage the feedback centre. Admins also
appoint moderators and read everyone's action log. With auth disabled the
single local user is staff.
"""

from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request

from src.app.core import config
from src.app.models.api import (
    AppealDecision,
    AppealItem,
    AuthorStanding,
    BanRequest,
    CommentItem,
    FeedbackItem,
    FeedbackPage,
    FeedbackUpdate,
    ModerationAction,
    ModerationDecision,
    ModerationHealth,
    ModerationQueue,
    ModerationRun,
    ModerationUser,
    PostDetail,
    RoleChange,
    TeamMember,
    UnbanRequest,
)
from src.app.services import app_data_service, feedback_service, moderation_service

router = APIRouter(prefix="/api/moderation", tags=["moderation"])


def _staff(request: Request, *, admin: bool = False) -> int:
    user = getattr(request.state, "auth_user", None)
    if user is None or getattr(user, "id", None) is None:
        if not config.is_auth_enabled():
            return app_data_service.DEFAULT_USER_ID
        raise HTTPException(
            status_code=401,
            detail={"code": "auth_required", "gate": "moderation", "message": "Authentication required."},
        )
    if not (user.is_admin if admin else user.is_staff):
        raise HTTPException(status_code=403, detail="Admin access required." if admin else "Moderator access required.")
    return int(user.id)


def _fail(exc: Exception):
    raise HTTPException(status_code=getattr(exc, "status", 422), detail=str(exc)) from exc


@router.get("/queue", response_model=ModerationQueue, response_model_exclude_none=True)
def queue(request: Request) -> ModerationQueue:
    """What waits for a person, oldest first, with the agent's reasons and the author's standing."""
    return ModerationQueue(**moderation_service.queue(_staff(request)))


@router.post("/posts/{post_id}/decision", response_model=PostDetail, response_model_exclude_none=True)
def decide_post(request: Request, post_id: str, payload: ModerationDecision) -> PostDetail:
    actor_id = _staff(request)
    try:
        return PostDetail(**moderation_service.decide_post(post_id, payload.decision, actor_id, payload.note))
    except moderation_service.ModerationError as exc:
        _fail(exc)


@router.post("/comments/{comment_id}/decision", response_model=CommentItem)
def decide_comment(request: Request, comment_id: int, payload: ModerationDecision) -> CommentItem:
    actor_id = _staff(request)
    try:
        return CommentItem(**moderation_service.decide_comment(comment_id, payload.decision, actor_id, payload.note))
    except moderation_service.ModerationError as exc:
        _fail(exc)


@router.post("/appeals/{appeal_id}/decision", response_model=AppealItem, response_model_exclude_none=True)
def decide_appeal(request: Request, appeal_id: int, payload: AppealDecision) -> AppealItem:
    """Reviewed by another moderator than the one who decided."""
    actor_id = _staff(request)
    try:
        return AppealItem(**moderation_service.decide_appeal(appeal_id, payload.outcome, actor_id, payload.note))
    except moderation_service.ModerationError as exc:
        _fail(exc)


@router.get("/users", response_model=list[ModerationUser], response_model_exclude_none=True)
def users(request: Request, kind: Literal["suspicious", "banned"] = Query("suspicious")) -> list[ModerationUser]:
    _staff(request)
    return [ModerationUser(**item) for item in moderation_service.users(kind)]


@router.post("/users/{user_id}/ban", response_model=AuthorStanding, response_model_exclude_none=True)
def ban(request: Request, user_id: int, payload: BanRequest) -> AuthorStanding:
    actor_id = _staff(request)
    try:
        return AuthorStanding(**moderation_service.ban(user_id, payload.days, actor_id, payload.reason))
    except moderation_service.ModerationError as exc:
        _fail(exc)


@router.post("/users/{user_id}/unban", response_model=AuthorStanding, response_model_exclude_none=True)
def unban(request: Request, user_id: int, payload: UnbanRequest) -> AuthorStanding:
    actor_id = _staff(request)
    try:
        return AuthorStanding(**moderation_service.unban(user_id, actor_id, payload.reason))
    except moderation_service.ModerationError as exc:
        _fail(exc)


@router.get("/actions", response_model=list[ModerationAction], response_model_exclude_none=True)
def actions(request: Request, mine: bool = Query(False)) -> list[ModerationAction]:
    """The action log: a moderator reads their own, an admin everyone's."""
    actor_id = _staff(request)
    user = getattr(request.state, "auth_user", None)
    everyone = not mine and (user is None or user.is_admin)
    return [ModerationAction(**item) for item in moderation_service.actions(None if everyone else actor_id)]


@router.get("/team", response_model=list[TeamMember], response_model_exclude_none=True)
def team(request: Request) -> list[TeamMember]:
    _staff(request, admin=True)
    return [TeamMember(**item) for item in moderation_service.team()]


@router.post("/team", response_model=list[TeamMember], response_model_exclude_none=True)
def set_role(request: Request, payload: RoleChange) -> list[TeamMember]:
    """Appoint a moderator, or remove one (admins only)."""
    actor_id = _staff(request, admin=True)
    try:
        return [TeamMember(**item) for item in moderation_service.set_role(actor_id, payload.email, payload.role)]
    except moderation_service.ModerationError as exc:
        _fail(exc)


@router.get("/health", response_model=ModerationHealth, response_model_exclude_none=True)
def health(request: Request) -> ModerationHealth:
    _staff(request)
    return ModerationHealth(**moderation_service.health())


@router.post("/run", response_model=ModerationRun, response_model_exclude_none=True)
def run_now(request: Request) -> ModerationRun:
    """Run a batch now instead of waiting for the next one (admins)."""
    _staff(request, admin=True)
    return ModerationRun(**moderation_service.run_batch())


@router.get("/feedback", response_model=FeedbackPage, response_model_exclude_none=True)
def feedback(
    request: Request,
    status: Literal["new", "in_progress", "resolved", "closed"] | None = Query(None),
    kind: Literal["contact", "bug", "help", "feature", "error"] | None = Query(None),
    before: int | None = Query(None, ge=1),
) -> FeedbackPage:
    _staff(request)
    return FeedbackPage(**feedback_service.triage_list(status, kind, before))


@router.patch("/feedback/{feedback_id}", response_model=FeedbackItem, response_model_exclude_none=True)
def update_feedback(request: Request, feedback_id: int, payload: FeedbackUpdate) -> FeedbackItem:
    actor_id = _staff(request)
    try:
        return FeedbackItem(
            **feedback_service.update(
                feedback_id,
                status=payload.status,
                staff_note=payload.staff_note,
                assigned_to=payload.assigned_to,
                actor_id=actor_id,
            )
        )
    except feedback_service.FeedbackError as exc:
        _fail(exc)
