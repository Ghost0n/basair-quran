from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response

from src.app.core import config
from src.app.models.api import (
    AuthLoginRequest,
    AuthProfileUpdate,
    AuthSessionResponse,
    AuthSignupRequest,
    AuthUserInfo,
    DeleteResult,
    DeviceInfo,
    GuestMergeRequest,
    GuestMergeResult,
    GuestMergeUndoRequest,
)
from src.app.services import app_data_service, auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


# --------------------------------------------------------------------------
# Token plumbing — a raw opaque token arrives as an httpOnly cookie (web) or
# an Authorization: Bearer header (native). Bearer takes precedence.
# --------------------------------------------------------------------------


def _extract_token(request: Request) -> str | None:
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        candidate = auth_header[7:].strip()
        if candidate:
            return candidate
    cookie = request.cookies.get(config.get_session_cookie_name())
    return cookie or None


def _set_session_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=config.get_session_cookie_name(),
        value=raw_token,
        max_age=auth_service.SESSION_TTL_SECONDS,
        httponly=True,
        samesite="lax",
        secure=config.is_session_secure(),
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=config.get_session_cookie_name(), path="/")


def _user_info(user: auth_service.AuthUser) -> AuthUserInfo:
    return AuthUserInfo(
        id=user.id,
        email=user.email,
        is_admin=user.is_admin,
        name=user.name,
        avatar=user.avatar,
        onboarded=user.onboarded,
    )


def _require_user(request: Request) -> auth_service.ResolvedSession:
    resolved = auth_service.resolve_session(_extract_token(request))
    if resolved is None:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return resolved


# --------------------------------------------------------------------------
# Session lifecycle
# --------------------------------------------------------------------------


@router.get("/session", response_model=AuthSessionResponse)
def auth_session(request: Request) -> AuthSessionResponse:
    if not config.is_auth_enabled():
        return AuthSessionResponse(enabled=False, authenticated=False, user=None)
    resolved = auth_service.resolve_session(_extract_token(request))
    if resolved is None:
        return AuthSessionResponse(enabled=True, authenticated=False, user=None)
    return AuthSessionResponse(enabled=True, authenticated=True, user=_user_info(resolved.user))


@router.post("/login", response_model=AuthSessionResponse)
def auth_login(req: AuthLoginRequest, request: Request, response: Response) -> AuthSessionResponse:
    if not config.is_auth_enabled():
        raise HTTPException(status_code=400, detail="Authentication is disabled.")

    try:
        user = auth_service.authenticate_user(req.email, req.password)
    except auth_service.AuthError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    raw_token, _ = auth_service.create_session(
        user.id, device_label=req.device_label, platform=req.platform
    )
    _set_session_cookie(response, raw_token)
    return AuthSessionResponse(enabled=True, authenticated=True, user=_user_info(user), token=raw_token)


@router.post("/signup", response_model=AuthSessionResponse)
def auth_signup(req: AuthSignupRequest, request: Request, response: Response) -> AuthSessionResponse:
    if not config.is_auth_enabled():
        raise HTTPException(status_code=400, detail="Authentication is disabled.")

    try:
        user = auth_service.create_user(req.email, req.password, name=req.name)
    except auth_service.AuthError as exc:
        message = str(exc)
        status = 409 if "already exists" in message else 422
        raise HTTPException(status_code=status, detail=message) from exc

    raw_token, _ = auth_service.create_session(
        user.id, device_label=req.device_label, platform=req.platform
    )
    _set_session_cookie(response, raw_token)
    return AuthSessionResponse(enabled=True, authenticated=True, user=_user_info(user), token=raw_token)


@router.post("/logout", response_model=AuthSessionResponse)
def auth_logout(request: Request, response: Response) -> AuthSessionResponse:
    auth_service.revoke_session_by_token(_extract_token(request))
    _clear_session_cookie(response)
    return AuthSessionResponse(enabled=config.is_auth_enabled(), authenticated=False, user=None)


# --------------------------------------------------------------------------
# Profile — display name, medallion avatar, onboarding flag
# --------------------------------------------------------------------------


@router.patch("/profile", response_model=AuthUserInfo)
def auth_profile(req: AuthProfileUpdate, request: Request) -> AuthUserInfo:
    resolved = _require_user(request)
    try:
        user = auth_service.update_profile(
            resolved.user.id, name=req.name, avatar=req.avatar, onboarded=req.onboarded
        )
    except auth_service.AuthError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _user_info(user)


# --------------------------------------------------------------------------
# Devices — the sessions registry, one row per live token
# --------------------------------------------------------------------------


@router.get("/devices", response_model=list[DeviceInfo])
def auth_devices(request: Request) -> list[DeviceInfo]:
    resolved = _require_user(request)
    sessions = auth_service.list_sessions(resolved.user.id)
    return [
        DeviceInfo(
            id=session.id,
            device_label=session.device_label,
            platform=session.platform,
            created_at=session.created_at,
            last_seen_at=session.last_seen_at,
            is_current=(session.id == resolved.session_id),
        )
        for session in sessions
    ]


@router.delete("/devices/{session_id}", response_model=DeleteResult)
def auth_eject_device(session_id: int, request: Request) -> DeleteResult:
    resolved = _require_user(request)
    revoked = auth_service.revoke_session(session_id, resolved.user.id)
    return DeleteResult(deleted=revoked)


# --------------------------------------------------------------------------
# Guest -> account merge (move, never delete) with non-destructive undo
# --------------------------------------------------------------------------


@router.post("/merge-guest-data", response_model=GuestMergeResult)
def auth_merge_guest_data(req: GuestMergeRequest, request: Request) -> GuestMergeResult:
    resolved = _require_user(request)
    result = app_data_service.merge_guest_data(
        resolved.user.id,
        notebook_ids=req.notebook_ids,
        session_ids=req.session_ids,
        root_ids=req.root_ids,
        include_preferences=req.include_preferences,
    )
    return GuestMergeResult(**result)


@router.post("/merge-guest-data/undo", response_model=GuestMergeResult)
def auth_undo_merge(req: GuestMergeUndoRequest, request: Request) -> GuestMergeResult:
    resolved = _require_user(request)
    result = app_data_service.undo_merge(resolved.user.id, req.undo_token)
    return GuestMergeResult(**result)
