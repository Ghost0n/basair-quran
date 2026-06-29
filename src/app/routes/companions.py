"""Companion endpoints — notebook, research sessions, and followed roots.

These persist user-generated content in the app-data store. When auth is
enabled the rows are scoped to the session user; otherwise they fall back
to the shared default user.
"""

from fastapi import APIRouter, HTTPException, Request

from src.app.models.api import (
    DeleteResult,
    FollowedRoot,
    FollowedRootCreate,
    NotebookItem,
    NotebookItemCreate,
    ResearchSessionDetail,
    ResearchSessionSave,
    ResearchSessionSummary,
    UserPreferences,
    UserPreferencesUpdate,
)
from src.app.services import app_data_service

router = APIRouter(prefix="/api", tags=["companions"])


def _resolve_user_id(request: Request) -> int:
    auth_user = getattr(request.state, "auth_user", None)
    if auth_user is not None and getattr(auth_user, "id", None) is not None:
        return int(auth_user.id)
    return app_data_service.DEFAULT_USER_ID


# --- Notebook --------------------------------------------------------------


@router.get("/notebook", response_model=list[NotebookItem])
def list_notebook(request: Request) -> list[NotebookItem]:
    items = app_data_service.list_notebook_items(_resolve_user_id(request))
    return [NotebookItem(**item) for item in items]


@router.post("/notebook", response_model=NotebookItem)
def create_notebook_item(request: Request, payload: NotebookItemCreate) -> NotebookItem:
    item = app_data_service.add_notebook_item(payload.model_dump(), _resolve_user_id(request))
    return NotebookItem(**item)


@router.delete("/notebook/{item_id}", response_model=DeleteResult)
def delete_notebook_item(request: Request, item_id: int) -> DeleteResult:
    deleted = app_data_service.delete_notebook_item(item_id, _resolve_user_id(request))
    return DeleteResult(deleted=deleted)


# --- Research sessions -----------------------------------------------------


@router.get("/sessions", response_model=list[ResearchSessionSummary])
def list_sessions(request: Request) -> list[ResearchSessionSummary]:
    sessions = app_data_service.list_sessions(_resolve_user_id(request))
    return [ResearchSessionSummary(**session) for session in sessions]


@router.get("/sessions/{session_id}", response_model=ResearchSessionDetail)
def get_session(request: Request, session_id: str) -> ResearchSessionDetail:
    session = app_data_service.get_session(session_id, _resolve_user_id(request))
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    return ResearchSessionDetail(**session)


@router.post("/sessions", response_model=ResearchSessionDetail)
def save_session(request: Request, payload: ResearchSessionSave) -> ResearchSessionDetail:
    session = app_data_service.save_session(payload.model_dump(), _resolve_user_id(request))
    return ResearchSessionDetail(**session)


@router.delete("/sessions/{session_id}", response_model=DeleteResult)
def delete_session(request: Request, session_id: str) -> DeleteResult:
    deleted = app_data_service.delete_session(session_id, _resolve_user_id(request))
    return DeleteResult(deleted=deleted)


# --- Followed roots --------------------------------------------------------


@router.get("/roots", response_model=list[FollowedRoot])
def list_roots(request: Request) -> list[FollowedRoot]:
    roots = app_data_service.list_followed_roots(_resolve_user_id(request))
    return [FollowedRoot(**root) for root in roots]


@router.post("/roots", response_model=FollowedRoot)
def follow_root(request: Request, payload: FollowedRootCreate) -> FollowedRoot:
    root = app_data_service.add_followed_root(payload.model_dump(), _resolve_user_id(request))
    return FollowedRoot(**root)


@router.delete("/roots/{root_id}", response_model=DeleteResult)
def unfollow_root(request: Request, root_id: int) -> DeleteResult:
    deleted = app_data_service.delete_followed_root(root_id, _resolve_user_id(request))
    return DeleteResult(deleted=deleted)


# --- User preferences ------------------------------------------------------


@router.get("/user/preferences", response_model=UserPreferences)
def get_preferences(request: Request) -> UserPreferences:
    preferences = app_data_service.get_preferences(_resolve_user_id(request))
    return UserPreferences(**preferences)


@router.patch("/user/preferences", response_model=UserPreferences)
def update_preferences(request: Request, payload: UserPreferencesUpdate) -> UserPreferences:
    patch = payload.model_dump(exclude_none=True)
    preferences = app_data_service.update_preferences(patch, _resolve_user_id(request))
    return UserPreferences(**preferences)
