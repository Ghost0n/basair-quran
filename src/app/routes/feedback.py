"""Feedback centre — contact, bug, help, feature requests and diagnostic reports (docs/feedback-centre.md).

Open to guests (rate-limited per IP); a signed-in sender is recorded and can
see what they sent. Staff triage it under ``/api/moderation/feedback``.
"""

from fastapi import APIRouter, HTTPException, Request

from src.app.core import config
from src.app.models.api import FeedbackCreate, FeedbackItem
from src.app.services import app_data_service, feedback_service

router = APIRouter(prefix="/api", tags=["feedback"])


def _user_id(request: Request) -> int | None:
    user = getattr(request.state, "auth_user", None)
    if user is not None and getattr(user, "id", None) is not None:
        return int(user.id)
    return None if config.is_auth_enabled() else app_data_service.DEFAULT_USER_ID


@router.post("/feedback", response_model=FeedbackItem, response_model_exclude_none=True)
def submit(request: Request, payload: FeedbackCreate) -> FeedbackItem:
    try:
        item = feedback_service.submit(
            payload.kind,
            payload.message,
            user_id=_user_id(request),
            email=payload.email,
            detail=payload.detail,
            url=payload.url,
            user_agent=request.headers.get("user-agent"),
            language=payload.language,
        )
    except feedback_service.FeedbackError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
    return FeedbackItem(**item)


@router.get("/feedback/mine", response_model=list[FeedbackItem], response_model_exclude_none=True)
def mine(request: Request) -> list[FeedbackItem]:
    user_id = _user_id(request)
    if user_id is None:
        raise HTTPException(
            status_code=401, detail={"code": "auth_required", "gate": "feedback", "message": "Authentication required."}
        )
    return [FeedbackItem(**item) for item in feedback_service.mine(user_id)]
