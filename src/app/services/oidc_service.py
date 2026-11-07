"""Keycloak sign-in over OpenID Connect (docs/keycloak.md).

With ``QBASAIR_AUTH_PROVIDER=keycloak`` the accounts' credentials, social
links, email verification, password resets, brute-force protection and 2FA
live in Keycloak; this API only:

- runs the **code flow with PKCE** for the web (``begin_login`` →
  Keycloak's page → ``complete_login``), checks the ID token against the
  realm's keys, and opens one of our own sessions (``auth_service``);
- accepts the standalone app's **Keycloak access tokens** as Bearer tokens
  (``verify_access_token``: signature, issuer, ``qbasair-api`` audience, expiry);
- ends the Keycloak session with ours (``logout_url``);
- calls Keycloak's admin API with its service account to delete an account,
  and grant or remove the ``moderator`` role (which also requires 2FA).

Network calls go through ``_http_json`` (urllib) so tests can stand in for
Keycloak; the API reaches Keycloak at ``QBASAIR_OIDC_INTERNAL_URL`` when set
(the Compose network) while browsers use the issuer's public address.
"""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

import jwt

from src.app.core import config

API_AUDIENCE = "qbasair-api"
STAFF_ROLES = ("admin", "moderator")
_TIMEOUT = 10
_DISCOVERY_TTL = 3600


class OidcError(Exception):
    """A sign-in step failed; ``status`` is the HTTP status to answer with."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class Identity:
    subject: str
    email: str | None
    email_verified: bool
    name: str | None
    roles: set[str] = field(default_factory=set)
    id_token: str | None = None


# ----------------------------------------------------------------------
# Transport
# ----------------------------------------------------------------------


def _http_json(method: str, url: str, *, form: dict | None = None, body: dict | list | None = None, token: str | None = None) -> dict | list | None:
    """One JSON request to Keycloak (form-encoded or JSON body). Raises OidcError."""
    headers = {"Accept": "application/json"}
    data = None
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=_TIMEOUT) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        raise OidcError(f"Keycloak answered {exc.code} for {urllib.parse.urlsplit(url).path}", status=502) from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise OidcError("Keycloak is unreachable.", status=503) from exc
    return json.loads(raw) if raw else None


def _backchannel(url: str) -> str:
    """The issuer's public URL rewritten to the internal one (API → Keycloak)."""
    internal = config.get_oidc_internal_url()
    issuer = config.get_oidc_issuer()
    if not internal or not issuer:
        return url
    public = urllib.parse.urlsplit(issuer)
    origin = f"{public.scheme}://{public.netloc}"
    return internal + url[len(origin):] if url.startswith(origin) else url


_cache_lock = threading.Lock()
_discovery: tuple[float, dict] | None = None
_jwks_clients: dict[str, jwt.PyJWKClient] = {}


def reset_caches() -> None:
    global _discovery
    with _cache_lock:
        _discovery = None
        _jwks_clients.clear()


def discovery() -> dict:
    """The realm's OpenID configuration (cached for an hour)."""
    global _discovery
    issuer = config.get_oidc_issuer()
    if not issuer:
        raise OidcError("QBASAIR_OIDC_ISSUER is not set.", status=503)
    with _cache_lock:
        if _discovery and time.time() - _discovery[0] < _DISCOVERY_TTL:
            return _discovery[1]
    document = _http_json("GET", _backchannel(f"{issuer}/.well-known/openid-configuration"))
    if not isinstance(document, dict) or document.get("issuer") != issuer:
        raise OidcError("Keycloak's issuer does not match QBASAIR_OIDC_ISSUER.", status=502)
    with _cache_lock:
        _discovery = (time.time(), document)
    return document


def _signing_key(token: str):
    jwks_uri = _backchannel(discovery()["jwks_uri"])
    with _cache_lock:
        client = _jwks_clients.get(jwks_uri)
        if client is None:
            client = _jwks_clients[jwks_uri] = _JwksClient(jwks_uri)
    try:
        return client.get_signing_key_from_jwt(token).key
    except jwt.PyJWTError as exc:
        raise OidcError("The token's signing key is unknown.", status=401) from exc


class _JwksClient(jwt.PyJWKClient):
    """PyJWKClient fetching through ``_http_json`` (so the proxy, timeouts and tests apply)."""

    def fetch_data(self):  # noqa: D401 — PyJWKClient hook
        data = _http_json("GET", self.uri)
        if self.jwk_set_cache is not None:
            self.jwk_set_cache.put(data)
        return data


def _decode(token: str, *, audience: str | list[str]) -> dict:
    try:
        return jwt.decode(
            token,
            _signing_key(token),
            algorithms=["RS256", "PS256", "ES256"],
            audience=audience,
            issuer=config.get_oidc_issuer(),
            leeway=30,
            options={"require": ["exp", "iat", "iss", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise OidcError(f"Invalid token: {exc}", status=401) from exc


def _roles(claims: dict) -> set[str]:
    """Realm roles: the ``roles`` claim the realm maps into tokens, else ``realm_access.roles``."""
    roles = claims.get("roles")
    if not isinstance(roles, list):
        roles = (claims.get("realm_access") or {}).get("roles") or []
    return {str(role) for role in roles}


def _identity(claims: dict, id_token: str | None = None) -> Identity:
    return Identity(
        subject=str(claims["sub"]),
        email=claims.get("email"),
        email_verified=bool(claims.get("email_verified")),
        name=claims.get("name") or claims.get("preferred_username"),
        roles=_roles(claims),
        id_token=id_token,
    )


# ----------------------------------------------------------------------
# The web's code flow (PKCE)
# ----------------------------------------------------------------------


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def redirect_uri() -> str:
    public = config.get_public_url()
    if not public:
        raise OidcError("QBASAIR_PUBLIC_URL is not set.", status=503)
    return f"{public}/api/auth/oidc/callback"


def safe_return_to(value: str | None) -> str:
    """Only a path of this site (no open redirect)."""
    if not value or not value.startswith("/") or value.startswith("//") or "\\" in value:
        return "/"
    return value[:500]


def begin_login(return_to: str | None, *, signup: bool = False, locale: str | None = None) -> tuple[str, dict]:
    """The Keycloak URL to send the browser to, and what to remember until it comes back."""
    pending = {
        "state": secrets.token_urlsafe(24),
        "nonce": secrets.token_urlsafe(24),
        "verifier": secrets.token_urlsafe(48),
        "return_to": safe_return_to(return_to),
        "at": int(time.time()),
    }
    params = {
        "client_id": config.get_oidc_client_id(),
        "response_type": "code",
        "scope": "openid email profile",
        "redirect_uri": redirect_uri(),
        "state": pending["state"],
        "nonce": pending["nonce"],
        "code_challenge": _b64url(hashlib.sha256(pending["verifier"].encode()).digest()),
        "code_challenge_method": "S256",
    }
    if signup:
        params["prompt"] = "create"
    if locale:
        params["ui_locales"] = locale
    return f"{discovery()['authorization_endpoint']}?{urllib.parse.urlencode(params)}", pending


PENDING_TTL = 600


def complete_login(code: str, state: str, pending: dict | None) -> Identity:
    """Exchange the code (with the PKCE verifier) and check the ID token."""
    if not pending or not state or not secrets.compare_digest(str(pending.get("state", "")), state):
        raise OidcError("The sign-in expired or was tampered with; start again.", status=400)
    if int(time.time()) - int(pending.get("at", 0)) > PENDING_TTL:
        raise OidcError("The sign-in took too long; start again.", status=400)
    tokens = _http_json(
        "POST",
        _backchannel(discovery()["token_endpoint"]),
        form={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri(),
            "client_id": config.get_oidc_client_id(),
            "client_secret": config.get_oidc_client_secret(),
            "code_verifier": pending["verifier"],
        },
    )
    if not isinstance(tokens, dict) or not tokens.get("id_token"):
        raise OidcError("Keycloak returned no ID token.", status=502)
    claims = _decode(tokens["id_token"], audience=config.get_oidc_client_id())
    if not secrets.compare_digest(str(claims.get("nonce", "")), str(pending["nonce"])):
        raise OidcError("The sign-in's nonce does not match.", status=400)
    identity = _identity(claims, tokens["id_token"])
    # Roles come in the access token when the realm doesn't map them into the ID token.
    if not identity.roles and tokens.get("access_token"):
        try:
            access = _decode(tokens["access_token"], audience=[API_AUDIENCE, config.get_oidc_client_id(), "account"])
            identity = Identity(**{**identity.__dict__, "roles": _roles(access)})
        except OidcError:
            pass
    return identity


def verify_access_token(token: str) -> Identity:
    """A Bearer token from the standalone app: a Keycloak access token for this API."""
    claims = _decode(token, audience=API_AUDIENCE)
    if claims.get("typ") not in (None, "Bearer"):
        raise OidcError("Not an access token.", status=401)
    return _identity(claims)


def looks_like_jwt(token: str | None) -> bool:
    return bool(token) and token.count(".") == 2 and token.startswith("eyJ")


def logout_url(id_token: str | None, return_to: str = "/") -> str:
    """Keycloak's end-session URL, so its session ends with ours."""
    params = {
        "client_id": config.get_oidc_client_id(),
        "post_logout_redirect_uri": f"{config.get_public_url()}{safe_return_to(return_to)}",
    }
    if id_token:
        params["id_token_hint"] = id_token
    return f"{discovery()['end_session_endpoint']}?{urllib.parse.urlencode(params)}"


def account_url() -> str:
    """Keycloak's account console: password, 2FA, linked accounts, sessions."""
    return f"{config.get_oidc_issuer()}/account"


# ----------------------------------------------------------------------
# Admin API (the web client's service account)
# ----------------------------------------------------------------------


def _admin_base() -> str:
    issuer = config.get_oidc_issuer()
    realm = issuer.rsplit("/realms/", 1)
    if len(realm) != 2:
        raise OidcError("QBASAIR_OIDC_ISSUER must end with /realms/<realm>.", status=503)
    return _backchannel(f"{realm[0]}/admin/realms/{realm[1]}")


def _admin_token() -> str:
    tokens = _http_json(
        "POST",
        _backchannel(discovery()["token_endpoint"]),
        form={
            "grant_type": "client_credentials",
            "client_id": config.get_oidc_client_id(),
            "client_secret": config.get_oidc_client_secret(),
            # Keycloak's admin API only accepts tokens carrying its own audience.
            "scope": "kc-admin-api",
        },
    )
    if not isinstance(tokens, dict) or not tokens.get("access_token"):
        raise OidcError("Keycloak refused the service account.", status=502)
    return tokens["access_token"]


def admin_delete_user(subject: str) -> None:
    """Delete the Keycloak account (account deletion removes it there too)."""
    _http_json("DELETE", f"{_admin_base()}/users/{urllib.parse.quote(subject)}", token=_admin_token())


def admin_set_role(subject: str, role: str, granted: bool) -> None:
    """Grant or remove a realm role; a staff role also requires 2FA (TOTP) at next sign-in."""
    token = _admin_token()
    base = _admin_base()
    user = urllib.parse.quote(subject)
    representation = _http_json("GET", f"{base}/roles/{urllib.parse.quote(role)}", token=token)
    _http_json("POST" if granted else "DELETE", f"{base}/users/{user}/role-mappings/realm", body=[representation], token=token)
    if granted and role in STAFF_ROLES:
        account = _http_json("GET", f"{base}/users/{user}", token=token) or {}
        actions = list(account.get("requiredActions") or [])
        if "CONFIGURE_TOTP" not in actions:
            _http_json("PUT", f"{base}/users/{user}", body={"requiredActions": [*actions, "CONFIGURE_TOTP"]}, token=token)
