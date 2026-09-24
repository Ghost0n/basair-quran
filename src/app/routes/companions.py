"""Companion endpoints — notebook, research sessions, and followed roots.

These persist user-generated content in the app-data store. When auth is
enabled the rows are scoped to the session user; otherwise they fall back
to the shared default user.
"""

from fastapi import APIRouter, HTTPException, Request

from src.app.models.api import (
    DeleteResult,
    DocumentAudit,
    ResearchDocument,
    ResearchDocumentSave,
    ResearchDocumentSummary,
    FollowedRoot,
    FollowedRootCreate,
    NotebookItem,
    NotebookItemCreate,
    NotebookItemThemes,
    ResearchSessionDetail,
    ResearchSessionSave,
    ResearchSessionSummary,
    ThemeBoardSave,
    ThemeCreate,
    ThemeDetail,
    ThemeSummary,
    ThemeUpdate,
    UserPreferences,
    UserPreferencesUpdate,
)
from src.app.services import app_data_service, research_document_service

router = APIRouter(prefix="/api", tags=["companions"])


def _resolve_user_id(request: Request) -> int:
    auth_user = getattr(request.state, "auth_user", None)
    if auth_user is not None and getattr(auth_user, "id", None) is not None:
        return int(auth_user.id)
    return app_data_service.DEFAULT_USER_ID


def _resolve_guest_id(request: Request) -> str | None:
    """The per-device guest token used to scope a later guest→account merge.

    Only meaningful for guest writes; ignored for authenticated users.
    """
    return request.headers.get("X-QBasair-Guest-Id")


# --- Notebook --------------------------------------------------------------


@router.get("/notebook", response_model=list[NotebookItem])
def list_notebook(request: Request) -> list[NotebookItem]:
    items = app_data_service.list_notebook_items(_resolve_user_id(request))
    return [NotebookItem(**item) for item in items]


@router.post("/notebook", response_model=NotebookItem)
def create_notebook_item(request: Request, payload: NotebookItemCreate) -> NotebookItem:
    item = app_data_service.add_notebook_item(
        payload.model_dump(), _resolve_user_id(request), _resolve_guest_id(request)
    )
    return NotebookItem(**item)


@router.delete("/notebook/{item_id}", response_model=DeleteResult)
def delete_notebook_item(request: Request, item_id: int) -> DeleteResult:
    deleted = app_data_service.delete_notebook_item(item_id, _resolve_user_id(request))
    return DeleteResult(deleted=deleted)


@router.put("/notebook/{item_id}/themes", response_model=NotebookItem)
def set_notebook_item_themes(request: Request, item_id: int, payload: NotebookItemThemes) -> NotebookItem:
    item = app_data_service.set_notebook_item_themes(item_id, payload.theme_ids, _resolve_user_id(request))
    if item is None:
        raise HTTPException(status_code=404, detail="Notebook item not found.")
    return NotebookItem(**item)


# --- Themes (مواضيع) --------------------------------------------------------


@router.get("/themes", response_model=list[ThemeSummary])
def list_themes(request: Request) -> list[ThemeSummary]:
    return [ThemeSummary(**theme) for theme in app_data_service.list_themes(_resolve_user_id(request))]


@router.post("/themes", response_model=ThemeSummary)
def create_theme(request: Request, payload: ThemeCreate) -> ThemeSummary:
    try:
        theme = app_data_service.create_theme(
            payload.model_dump(), _resolve_user_id(request), _resolve_guest_id(request)
        )
    except app_data_service.ThemeLimitError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return ThemeSummary(**theme)


@router.get("/themes/{theme_id}", response_model=ThemeDetail)
def get_theme(request: Request, theme_id: int) -> ThemeDetail:
    theme = app_data_service.get_theme(theme_id, _resolve_user_id(request))
    if theme is None:
        raise HTTPException(status_code=404, detail="Theme not found.")
    return ThemeDetail(**theme)


@router.patch("/themes/{theme_id}", response_model=ThemeDetail)
def update_theme(request: Request, theme_id: int, payload: ThemeUpdate) -> ThemeDetail:
    theme = app_data_service.update_theme(theme_id, payload.model_dump(), _resolve_user_id(request))
    if theme is None:
        raise HTTPException(status_code=404, detail="Theme not found.")
    return ThemeDetail(**theme)


@router.put("/themes/{theme_id}/board", response_model=ThemeDetail)
def save_theme_board(request: Request, theme_id: int, payload: ThemeBoardSave) -> ThemeDetail:
    try:
        theme = app_data_service.save_theme_board(theme_id, payload.board, _resolve_user_id(request))
    except app_data_service.ThemeLimitError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    if theme is None:
        raise HTTPException(status_code=404, detail="Theme not found.")
    return ThemeDetail(**theme)


@router.delete("/themes/{theme_id}", response_model=DeleteResult)
def delete_theme(request: Request, theme_id: int) -> DeleteResult:
    return DeleteResult(deleted=app_data_service.delete_theme(theme_id, _resolve_user_id(request)))


# --- Research documents (the shareable research format) --------------------


@router.get("/documents", response_model=list[ResearchDocumentSummary])
def list_documents(request: Request) -> list[ResearchDocumentSummary]:
    documents = research_document_service.list_documents(_resolve_user_id(request))
    return [ResearchDocumentSummary(**document) for document in documents]


@router.post("/documents", response_model=ResearchDocument, response_model_exclude_none=True)
def create_document(request: Request, payload: ResearchDocumentSave) -> ResearchDocument:
    try:
        document = research_document_service.create_document(
            payload.model_dump(), _resolve_user_id(request), _resolve_guest_id(request)
        )
    except research_document_service.DocumentLimitError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    return ResearchDocument(**document)


@router.get("/documents/{document_id}", response_model=ResearchDocument, response_model_exclude_none=True)
def get_document(request: Request, document_id: str) -> ResearchDocument:
    document = research_document_service.get_document(document_id, _resolve_user_id(request))
    if document is None:
        raise HTTPException(status_code=404, detail="Research document not found.")
    return ResearchDocument(**document)


@router.put("/documents/{document_id}", response_model=ResearchDocument, response_model_exclude_none=True)
def replace_document(request: Request, document_id: str, payload: ResearchDocumentSave) -> ResearchDocument:
    try:
        document = research_document_service.replace_document(
            document_id, payload.model_dump(), _resolve_user_id(request)
        )
    except research_document_service.DocumentLimitError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    if document is None:
        raise HTTPException(status_code=404, detail="Research document not found.")
    return ResearchDocument(**document)


@router.get("/documents/{document_id}/audit", response_model=DocumentAudit)
def audit_document(request: Request, document_id: str) -> DocumentAudit:
    document = research_document_service.get_document(document_id, _resolve_user_id(request))
    if document is None:
        raise HTTPException(status_code=404, detail="Research document not found.")
    return DocumentAudit(**research_document_service.audit_document(document))


@router.delete("/documents/{document_id}", response_model=DeleteResult)
def delete_document(request: Request, document_id: str) -> DeleteResult:
    return DeleteResult(deleted=research_document_service.delete_document(document_id, _resolve_user_id(request)))


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
    session = app_data_service.save_session(
        payload.model_dump(), _resolve_user_id(request), _resolve_guest_id(request)
    )
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
    root = app_data_service.add_followed_root(
        payload.model_dump(), _resolve_user_id(request), _resolve_guest_id(request)
    )
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
    preferences = app_data_service.update_preferences(
        patch, _resolve_user_id(request), _resolve_guest_id(request)
    )
    return UserPreferences(**preferences)
