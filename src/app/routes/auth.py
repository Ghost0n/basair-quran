from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from src.app.core import config
from src.app.models.api import AuthLoginRequest, AuthSessionResponse, AuthUserInfo
from src.app.services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _build_session_response(request: Request) -> AuthSessionResponse:
    if not config.is_auth_enabled():
        return AuthSessionResponse(enabled=False, authenticated=False, user=None)

    user_id = request.session.get("user_id")
    if not user_id:
        return AuthSessionResponse(enabled=True, authenticated=False, user=None)

    try:
        user = auth_service.get_user_by_id(int(user_id))
    except (TypeError, ValueError):
        request.session.clear()
        return AuthSessionResponse(enabled=True, authenticated=False, user=None)

    if user is None or not user.is_active:
        request.session.clear()
        return AuthSessionResponse(enabled=True, authenticated=False, user=None)

    return AuthSessionResponse(
        enabled=True,
        authenticated=True,
        user=AuthUserInfo(id=user.id, email=user.email, is_admin=user.is_admin),
    )


@router.get("/session", response_model=AuthSessionResponse)
def auth_session(request: Request) -> AuthSessionResponse:
    return _build_session_response(request)


@router.post("/login", response_model=AuthSessionResponse)
def auth_login(req: AuthLoginRequest, request: Request) -> AuthSessionResponse:
    if not config.is_auth_enabled():
        raise HTTPException(status_code=400, detail="Authentication is disabled.")

    try:
        user = auth_service.authenticate_user(req.email, req.password)
    except auth_service.AuthError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    request.session.clear()
    request.session["user_id"] = user.id
    return AuthSessionResponse(
        enabled=True,
        authenticated=True,
        user=AuthUserInfo(id=user.id, email=user.email, is_admin=user.is_admin),
    )


@router.post("/logout", response_model=AuthSessionResponse)
def auth_logout(request: Request) -> AuthSessionResponse:
    request.session.clear()
    return AuthSessionResponse(
        enabled=config.is_auth_enabled(),
        authenticated=False,
        user=None,
    )
