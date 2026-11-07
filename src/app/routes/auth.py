from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response

from src.app.core import config
from src.app.models.api import (
    AuthLoginRequest,
    AuthOkResponse,
    AuthProfileUpdate,
    AuthSessionResponse,
    AuthSignupRequest,
    AuthUserInfo,
    DeleteResult,
    DeviceInfo,
    ForgotPasswordRequest,
    GuestMergeRequest,
    GuestMergeResult,
    GuestMergeUndoRequest,
    ResetPasswordRequest,
)
import logging

from src.app.services import app_data_service, auth_service, mail_service

logger = logging.getLogger(__name__)

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
        is_moderator=user.is_moderator,
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


def _device_fields(req, request: Request) -> dict:
    """The client's own device label/platform, else one derived from the User-Agent."""
    label, platform = req.device_label, req.platform
    if not label or not platform:
        ua_label, ua_platform = auth_service.describe_user_agent(request.headers.get("user-agent"))
        label = label or ua_label
        platform = platform or ua_platform
    return {"device_label": label, "platform": platform}


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

    raw_token, _ = auth_service.create_session(user.id, **_device_fields(req, request))
    _set_session_cookie(response, raw_token)
    return AuthSessionResponse(enabled=True, authenticated=True, user=_user_info(user), token=raw_token)


def _enforce_invite(invite_code: str | None) -> None:
    """Gate signup behind an invite code when QBASAIR_INVITE_CODES is configured.

    Unset ⇒ open registration (unchanged). Set ⇒ a wrong/missing code is 403.
    """
    codes = config.get_invite_codes()
    if not codes:
        return
    if (invite_code or "").strip() not in codes:
        raise HTTPException(status_code=403, detail="رمز الدعوة غير صالح.")


@router.post("/signup", response_model=AuthSessionResponse)
def auth_signup(req: AuthSignupRequest, request: Request, response: Response) -> AuthSessionResponse:
    if not config.is_auth_enabled():
        raise HTTPException(status_code=400, detail="Authentication is disabled.")

    _enforce_invite(req.invite_code)

    try:
        user = auth_service.create_user(req.email, req.password, name=req.name)
    except auth_service.EmailAlreadyExistsError as exc:
        # Static message — never reflect whether the email exists (enumeration).
        raise HTTPException(status_code=409, detail="تعذّر إنشاء الحساب بهذه البيانات.") from exc
    except auth_service.AuthError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    raw_token, _ = auth_service.create_session(user.id, **_device_fields(req, request))
    _set_session_cookie(response, raw_token)
    return AuthSessionResponse(enabled=True, authenticated=True, user=_user_info(user), token=raw_token)


@router.post("/logout", response_model=AuthSessionResponse)
def auth_logout(request: Request, response: Response) -> AuthSessionResponse:
    auth_service.revoke_session_by_token(_extract_token(request))
    _clear_session_cookie(response)
    return AuthSessionResponse(enabled=config.is_auth_enabled(), authenticated=False, user=None)


@router.post("/forgot-password", response_model=AuthOkResponse)
def auth_forgot_password(req: ForgotPasswordRequest) -> AuthOkResponse:
    """Request a password-reset token. Always returns ok (no account
    enumeration). The token is emailed when SMTP is configured, otherwise
    logged for manual delivery (see services/mail_service.py). It is never
    returned to the client."""
    if not config.is_auth_enabled():
        raise HTTPException(status_code=400, detail="Authentication is disabled.")
    raw_token = auth_service.create_password_reset(req.email)
    if raw_token is not None:
        mail_service.send_password_reset(req.email.strip(), raw_token)
    return AuthOkResponse(ok=True)


@router.post("/reset-password", response_model=AuthOkResponse)
def auth_reset_password(req: ResetPasswordRequest) -> AuthOkResponse:
    """Consume a reset token and set a new password. Invalidates all sessions."""
    if not config.is_auth_enabled():
        raise HTTPException(status_code=400, detail="Authentication is disabled.")
    try:
        ok = auth_service.reset_password_with_token(req.token, req.password)
    except auth_service.AuthError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not ok:
        raise HTTPException(status_code=400, detail="رمز إعادة التعيين غير صالح أو منتهٍ.")
    return AuthOkResponse(ok=True)


@router.delete("/account", response_model=DeleteResult)
def auth_delete_account(request: Request, response: Response) -> DeleteResult:
    """Permanently delete the current account: all app data, then the user +
    every session (all devices), and clear the cookie. Irreversible."""
    resolved = _require_user(request)
    app_data_service.delete_user_data(resolved.user.id)
    deleted = auth_service.delete_user(resolved.user.id)
    _clear_session_cookie(response)
    return DeleteResult(deleted=deleted)


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
        guest_id=request.headers.get("X-QBasair-Guest-Id"),
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
