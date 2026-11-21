from __future__ import annotations

import urllib.parse

from fastapi import APIRouter, HTTPException, Path, Query, Request, Response
from fastapi.responses import RedirectResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer

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
    LinkedAccountsResponse,
    LinkedProvider,
    ResetPasswordRequest,
    UnlinkProviderRequest,
)
import logging

from src.app.services import app_data_service, auth_service, mail_service, oidc_service

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


def _provider_fields() -> dict:
    """What the client needs to sign in with Keycloak (empty with local accounts)."""
    if not config.is_keycloak_auth():
        return {"provider": "local"}
    return {
        "provider": "keycloak",
        "login_url": "/api/auth/oidc/login",
        "signup_url": "/api/auth/oidc/login?signup=1",
        "account_url": oidc_service.account_url(),
    }


@router.get("/session", response_model=AuthSessionResponse)
def auth_session(request: Request) -> AuthSessionResponse:
    if not config.is_auth_enabled():
        return AuthSessionResponse(enabled=False, authenticated=False, user=None)
    resolved = auth_service.resolve_session(_extract_token(request))
    if resolved is None:
        return AuthSessionResponse(enabled=True, authenticated=False, user=None, **_provider_fields())
    return AuthSessionResponse(enabled=True, authenticated=True, user=_user_info(resolved.user), **_provider_fields())


def _local_only() -> None:
    """Passwords live in Keycloak when it is the provider: these routes stay closed."""
    if config.is_keycloak_auth():
        raise HTTPException(
            status_code=409,
            detail={"code": "use_identity_provider", "message": "Sign in with the identity provider."},
        )


# --------------------------------------------------------------------------
# Keycloak (OpenID Connect code flow with PKCE) — docs/keycloak.md
# --------------------------------------------------------------------------

_PENDING_COOKIE = "qbasair_oidc"


def _pending_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(config.get_session_secret(), salt="oidc-pending")


@router.get("/oidc/login", include_in_schema=True)
def auth_oidc_login(
    request: Request,
    return_to: str | None = Query(None, max_length=500),
    signup: bool = Query(False),
    locale: str | None = Query(None, max_length=12),
) -> RedirectResponse:
    """Start signing in (or up, `signup=1`) on Keycloak's page; it comes back to the callback."""
    if not config.is_keycloak_auth():
        raise HTTPException(status_code=404, detail="Not found.")
    try:
        url, pending = oidc_service.begin_login(return_to, signup=signup, locale=locale)
    except oidc_service.OidcError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
    return _to_keycloak(url, pending)


def _to_keycloak(url: str, pending: dict) -> RedirectResponse:
    # Remembered until the callback in a short-lived signed cookie of its own
    # (not the session cookie, which carries the sign-in token).
    response = RedirectResponse(url, status_code=302)
    response.set_cookie(
        _PENDING_COOKIE,
        _pending_serializer().dumps(pending),
        max_age=oidc_service.PENDING_TTL,
        httponly=True,
        samesite="lax",
        secure=config.is_session_secure(),
        path="/api/auth/oidc",
    )
    return response


_PROVIDER_ALIAS = r"^[a-z0-9][a-z0-9_-]{0,39}$"


def _with_query(path: str, **params: str) -> str:
    """`path` (already a safe local path) with `params` added to its query."""
    parts = urllib.parse.urlsplit(path)
    query = urllib.parse.parse_qsl(parts.query, keep_blank_values=True)
    query = [(key, value) for key, value in query if key not in params] + list(params.items())
    return urllib.parse.urlunsplit(("", "", parts.path, urllib.parse.urlencode(query), parts.fragment))


@router.get("/oidc/link/{alias}", include_in_schema=True)
def auth_oidc_link(
    request: Request,
    alias: str = Path(..., pattern=_PROVIDER_ALIAS),
    return_to: str | None = Query(None, max_length=500),
    locale: str | None = Query(None, max_length=12),
) -> RedirectResponse:
    """Link a sign-in provider to the signed-in account (settings): Keycloak sends the
    reader to the provider, then back to the callback, which returns to `return_to`
    with `linked=<alias>` or `link_error=cancelled|in_use|other_account|failed`."""
    if not config.is_keycloak_auth():
        raise HTTPException(status_code=404, detail="Not found.")
    resolved = auth_service.resolve_session(_extract_token(request))
    if resolved is None:
        return RedirectResponse(_with_query("/login", next=oidc_service.safe_return_to(return_to)), status_code=302)
    try:
        url, pending = oidc_service.begin_login(return_to, locale=locale, link=alias, login_hint=resolved.user.email)
    except oidc_service.OidcError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
    pending["user_id"] = resolved.user.id
    return _to_keycloak(url, pending)


@router.get("/oidc/callback", include_in_schema=True)
def auth_oidc_callback(
    request: Request,
    code: str | None = Query(None, max_length=4096),
    state: str | None = Query(None, max_length=200),
    error: str | None = Query(None, max_length=200),
    kc_action_status: str | None = Query(None, max_length=40),
) -> RedirectResponse:
    """Keycloak's answer: check it, open our session (cookie) and go back where the reader was."""
    if not config.is_keycloak_auth():
        raise HTTPException(status_code=404, detail="Not found.")
    try:
        pending = _pending_serializer().loads(
            request.cookies.get(_PENDING_COOKIE, ""), max_age=oidc_service.PENDING_TTL
        )
    except BadSignature:
        pending = None
    return_to = oidc_service.safe_return_to((pending or {}).get("return_to"))

    def finish(response: RedirectResponse) -> RedirectResponse:
        response.delete_cookie(_PENDING_COOKIE, path="/api/auth/oidc")
        return response

    if pending and pending.get("link"):
        return finish(_finish_link(request, pending, return_to, code, state, error, kc_action_status))

    # The reader backed out on Keycloak's page (access_denied); anything else is a failure.
    failed = finish(RedirectResponse(f"/login?error={'cancelled' if error == 'access_denied' else 'failed'}", status_code=302))
    if error or not code:
        return failed
    try:
        identity = oidc_service.complete_login(code, state or "", pending)
        user = auth_service.upsert_external_user(
            identity.subject,
            email=identity.email,
            email_verified=identity.email_verified,
            name=identity.name,
            roles=identity.roles,
            # An account tied to a Keycloak identity that no longer exists moves to this one.
            subject_is_gone=oidc_service.admin_user_is_gone,
        )
    except oidc_service.OidcError as exc:
        logger.warning("oidc callback refused: %s", exc)
        return failed
    except auth_service.EmailAlreadyExistsError:
        return finish(RedirectResponse("/login?error=email_in_use", status_code=302))
    if not user.is_active:
        return finish(RedirectResponse("/login?error=inactive", status_code=302))
    label, platform = auth_service.describe_user_agent(request.headers.get("user-agent"))
    raw_token, _ = auth_service.create_session(user.id, device_label=label, platform=platform, idp_id_token=identity.id_token)
    response = finish(RedirectResponse(return_to, status_code=302))
    _set_session_cookie(response, raw_token)
    return response


def _finish_link(
    request: Request,
    pending: dict,
    return_to: str,
    code: str | None,
    state: str | None,
    error: str | None,
    action_status: str | None,
) -> RedirectResponse:
    """Keycloak's answer to «link this provider»: our session stays as it was."""
    alias = str(pending["link"])

    def back(**params: str) -> RedirectResponse:
        return RedirectResponse(_with_query(return_to, **params), status_code=302)

    resolved = auth_service.resolve_session(_extract_token(request))
    if resolved is None or resolved.user.id != pending.get("user_id"):
        return RedirectResponse(_with_query("/login", next=return_to), status_code=302)
    if error:
        return back(link_error="cancelled" if error == "access_denied" else "failed")
    if not code:
        return back(link_error="failed")
    try:
        identity = oidc_service.complete_login(code, state or "", pending)
    except oidc_service.OidcError as exc:
        logger.warning("oidc link refused: %s", exc)
        return back(link_error="failed")
    # Keycloak linked the account it is signed in to: it must be this one.
    if identity.subject != auth_service.get_external_id(resolved.user.id):
        return back(link_error="other_account")
    if action_status == "success":
        return back(linked=alias)
    if action_status == "cancelled":
        return back(link_error="cancelled")
    # «error»: most often the provider's account is already linked to another account.
    try:
        linked = oidc_service.admin_linked_accounts(identity.subject)
        if any(provider["alias"] == alias and provider["linked"] for provider in linked.providers):
            return back(linked=alias)
    except oidc_service.OidcError:
        pass
    return back(link_error="in_use" if action_status == "error" else "failed")


def _keycloak_subject(request: Request) -> str:
    """The signed-in account's Keycloak `sub` (Keycloak mode only)."""
    if not config.is_keycloak_auth():
        raise HTTPException(status_code=404, detail="Not found.")
    resolved = _require_user(request)
    subject = auth_service.get_external_id(resolved.user.id)
    if not subject:
        raise HTTPException(status_code=409, detail="This account is not a Keycloak account.")
    return subject


def _linked_response(linked: oidc_service.LinkedAccounts) -> LinkedAccountsResponse:
    return LinkedAccountsResponse(
        providers=[LinkedProvider(**provider) for provider in linked.providers], has_password=linked.has_password
    )


@router.get("/linked-accounts", response_model=LinkedAccountsResponse)
def auth_linked_accounts(request: Request) -> LinkedAccountsResponse:
    """The realm's sign-in providers (Apple, Google, Meta) and which are linked."""
    subject = _keycloak_subject(request)
    try:
        return _linked_response(oidc_service.admin_linked_accounts(subject))
    except oidc_service.OidcError as exc:
        logger.warning("linked accounts unavailable: %s", exc)
        raise HTTPException(status_code=503, detail="تعذّر الوصول إلى الحسابات المرتبطة الآن.") from exc


@router.post("/linked-accounts/{alias}/unlink", response_model=LinkedAccountsResponse)
def auth_unlink_provider(
    request: Request,
    req: UnlinkProviderRequest,
    alias: str = Path(..., pattern=_PROVIDER_ALIAS),
) -> LinkedAccountsResponse:
    """Unlink a provider. Without a password the account must set one here first
    (`password`), so it can still sign in: 422 `password_required` when missing,
    422 `password_rejected` when Keycloak's policy refuses it (nothing is unlinked)."""
    subject = _keycloak_subject(request)
    try:
        oidc_service.admin_unlink(subject, alias, req.password)
        return _linked_response(oidc_service.admin_linked_accounts(subject))
    except oidc_service.OidcError as exc:
        if exc.reason == "password_required":
            raise HTTPException(status_code=422, detail={"code": "password_required", "message": str(exc)}) from exc
        if exc.upstream == 400:
            raise HTTPException(
                status_code=422,
                detail={"code": "password_rejected", "message": "Keycloak's password policy refused it.", "reason": exc.reason},
            ) from exc
        if exc.status == 404:
            raise HTTPException(status_code=404, detail="This provider is not linked.") from exc
        logger.warning("unlink failed: %s", exc)
        raise HTTPException(status_code=503, detail="تعذّر فصل الحساب الآن. حاول بعد قليل.") from exc


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
    _local_only()

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
    _local_only()

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
    """End this device's session; with Keycloak, also answer `logout_url` (its end-session page)."""
    token = _extract_token(request)
    logout_url = None
    if config.is_keycloak_auth():
        try:
            logout_url = oidc_service.logout_url(auth_service.session_id_token(token))
        except oidc_service.OidcError:
            logout_url = None
    auth_service.revoke_session_by_token(token)
    _clear_session_cookie(response)
    fields = _provider_fields() if config.is_auth_enabled() else {}
    return AuthSessionResponse(
        enabled=config.is_auth_enabled(), authenticated=False, user=None, logout_url=logout_url, **fields
    )


@router.post("/forgot-password", response_model=AuthOkResponse)
def auth_forgot_password(req: ForgotPasswordRequest) -> AuthOkResponse:
    """Request a password-reset token. Always returns ok (no account
    enumeration). The token is emailed when SMTP is configured, otherwise
    logged for manual delivery (see services/mail_service.py). It is never
    returned to the client."""
    if not config.is_auth_enabled():
        raise HTTPException(status_code=400, detail="Authentication is disabled.")
    _local_only()
    raw_token = auth_service.create_password_reset(req.email)
    if raw_token is not None:
        mail_service.send_password_reset(req.email.strip(), raw_token)
    return AuthOkResponse(ok=True)


@router.post("/reset-password", response_model=AuthOkResponse)
def auth_reset_password(req: ResetPasswordRequest) -> AuthOkResponse:
    """Consume a reset token and set a new password. Invalidates all sessions."""
    if not config.is_auth_enabled():
        raise HTTPException(status_code=400, detail="Authentication is disabled.")
    _local_only()
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
    if config.is_keycloak_auth():
        # The Keycloak account goes first: if it can't be deleted, nothing is.
        subject = auth_service.get_external_id(resolved.user.id)
        if subject:
            try:
                oidc_service.admin_delete_user(subject)
            except oidc_service.OidcError as exc:
                raise HTTPException(status_code=503, detail="تعذّر حذف الحساب الآن. حاول بعد قليل.") from exc
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
