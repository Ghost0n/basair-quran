"""Keycloak sign-in (docs/keycloak.md): the code flow with PKCE, ID token checks,
account linking and roles, the app's Bearer access tokens, sign-out, deletion,
and the realm rendered as code — against a stand-in Keycloak with real RSA keys."""

import base64
import hashlib
import json
import time
import urllib.parse

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from scripts import keycloak_realm
from src.app.services import auth_service, oidc_service
from test_auth import build_auth_client

ISSUER = "http://kc.test/realms/qbasair"


class FakeKeycloak:
    """Answers oidc_service._http_json like Keycloak would."""

    def __init__(self):
        self.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.challenges = {}
        self.identity = {"sub": "kc-1", "email": "amina@example.com", "email_verified": True, "name": "Amina", "roles": []}
        self.admin_calls = []
        self.wrong_nonce = False

    def token(self, claims: dict, audience) -> str:
        now = int(time.time())
        body = {"iss": ISSUER, "aud": audience, "iat": now, "exp": now + 300, **claims}
        return jwt.encode(body, self.key, algorithm="RS256", headers={"kid": "k1"})

    def jwks(self) -> dict:
        public = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(self.key.public_key()))
        return {"keys": [{**public, "kid": "k1", "alg": "RS256", "use": "sig"}]}

    def __call__(self, method, url, *, form=None, body=None, token=None):
        if url.endswith("/.well-known/openid-configuration"):
            return {
                "issuer": ISSUER,
                "authorization_endpoint": f"{ISSUER}/protocol/openid-connect/auth",
                "token_endpoint": f"{ISSUER}/protocol/openid-connect/token",
                "jwks_uri": f"{ISSUER}/protocol/openid-connect/certs",
                "end_session_endpoint": f"{ISSUER}/protocol/openid-connect/logout",
            }
        if url.endswith("/certs"):
            return self.jwks()
        if url.endswith("/token") and form["grant_type"] == "authorization_code":
            nonce, challenge = self.challenges[form["code"]]
            verifier_hash = base64.urlsafe_b64encode(hashlib.sha256(form["code_verifier"].encode()).digest()).rstrip(b"=").decode()
            assert verifier_hash == challenge, "PKCE verifier does not match"
            assert form["client_secret"] == "web-secret"
            claims = {**self.identity, "nonce": "other" if self.wrong_nonce else nonce}
            return {"id_token": self.token(claims, "qbasair-web"), "access_token": self.token(self.identity, ["qbasair-api"])}
        if url.endswith("/token") and form["grant_type"] == "client_credentials":
            assert form["scope"] == "kc-admin-api"
            return {"access_token": "service-token"}
        if "/admin/realms/qbasair/" in url:
            self.admin_calls.append((method, url.split("/admin/realms/qbasair")[1], body))
            if method == "GET" and "/roles/" in url:
                return {"id": "role-id", "name": url.rsplit("/", 1)[1]}
            if method == "GET":
                return {"requiredActions": []}
            return None
        raise AssertionError(f"unexpected call {method} {url}")


@pytest.fixture
def keycloak(tmp_path, monkeypatch):
    monkeypatch.setenv("QBASAIR_AUTH_PROVIDER", "keycloak")
    monkeypatch.setenv("QBASAIR_OIDC_ISSUER", ISSUER)
    monkeypatch.setenv("QBASAIR_OIDC_CLIENT_SECRET", "web-secret")
    monkeypatch.setenv("QBASAIR_PUBLIC_URL", "http://testserver")
    fake = FakeKeycloak()
    monkeypatch.setattr(oidc_service, "_http_json", fake)
    oidc_service.reset_caches()
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        yield client, fake
    finally:
        finalize()
        oidc_service.reset_caches()


def sign_in(client, fake, return_to="/?mode=community", code="code-1"):
    """Follow the code flow as a browser would, with Keycloak answering `code`."""
    started = client.get("/api/auth/oidc/login", params={"return_to": return_to}, follow_redirects=False)
    assert started.status_code == 302
    query = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(started.headers["location"]).query))
    fake.challenges[code] = (query["nonce"], query["code_challenge"])
    return client.get(
        "/api/auth/oidc/callback", params={"code": code, "state": query["state"]}, follow_redirects=False
    ), query


def test_the_code_flow_opens_a_session_and_mirrors_roles(keycloak):
    client, fake = keycloak
    session = client.get("/api/auth/session").json()
    assert session["provider"] == "keycloak" and session["authenticated"] is False
    assert session["login_url"] == "/api/auth/oidc/login" and session["account_url"] == f"{ISSUER}/account"

    fake.identity["roles"] = ["moderator", "default-roles-qbasair"]
    done, query = sign_in(client, fake)
    assert query["code_challenge_method"] == "S256" and query["client_id"] == "qbasair-web"
    assert query["redirect_uri"] == "http://testserver/api/auth/oidc/callback"
    assert done.status_code == 302 and done.headers["location"] == "/?mode=community"
    me = client.get("/api/auth/session").json()
    assert me["authenticated"] is True
    assert me["user"]["email"] == "amina@example.com" and me["user"]["is_moderator"] is True
    assert client.get("/api/moderation/queue").status_code == 200

    # Keycloak removed the role: the next sign-in mirrors it.
    fake.identity["roles"] = []
    sign_in(client, fake, code="code-2")
    assert client.get("/api/auth/session").json()["user"]["is_moderator"] is False


def test_the_callback_refuses_tampering_and_never_redirects_away(keycloak):
    client, fake = keycloak
    started = client.get("/api/auth/oidc/login", params={"return_to": "//evil.example"}, follow_redirects=False)
    query = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(started.headers["location"]).query))
    fake.challenges["c"] = (query["nonce"], query["code_challenge"])
    # A forged state is refused.
    bad = client.get("/api/auth/oidc/callback", params={"code": "c", "state": "forged"}, follow_redirects=False)
    assert bad.headers["location"] == "/login?error=failed"
    assert client.get("/api/auth/session").json()["authenticated"] is False
    # A replayed callback (the pending cookie is gone) is refused too.
    replay = client.get("/api/auth/oidc/callback", params={"code": "c", "state": query["state"]}, follow_redirects=False)
    assert replay.headers["location"] == "/login?error=failed"
    # A wrong nonce in the ID token is refused.
    fake.wrong_nonce = True
    done, _ = sign_in(client, fake, code="c2")
    assert done.headers["location"] == "/login?error=failed"
    fake.wrong_nonce = False
    # An open redirect becomes "/".
    done, _ = sign_in(client, fake, return_to="//evil.example", code="c3")
    assert done.headers["location"] == "/"
    # Cancelled on Keycloak's page.
    cancelled = client.get("/api/auth/oidc/callback", params={"error": "access_denied"}, follow_redirects=False)
    assert cancelled.headers["location"] == "/login?error=cancelled"
    misconfigured = client.get("/api/auth/oidc/callback", params={"error": "invalid_scope"}, follow_redirects=False)
    assert misconfigured.headers["location"] == "/login?error=failed"


def test_existing_accounts_are_linked_only_by_a_verified_email(keycloak):
    client, fake = keycloak
    local = auth_service.create_user("amina@example.com", "hidayah88", name="Amina (old)")
    fake.identity["email_verified"] = False
    done, _ = sign_in(client, fake)
    assert done.headers["location"] == "/login?error=email_in_use"
    fake.identity["email_verified"] = True
    sign_in(client, fake, code="code-2")
    me = client.get("/api/auth/session").json()["user"]
    assert me["id"] == local.id and me["name"] == "Amina (old)"  # same account, its data kept
    assert auth_service.get_external_id(local.id) == "kc-1"


def test_passwords_stay_in_keycloak_and_sign_out_ends_both_sessions(keycloak):
    client, fake = keycloak
    assert client.post("/api/auth/login", json={"email": "admin@example.com", "password": "secret123"}).status_code == 409
    assert client.post("/api/auth/signup", json={"email": "x@example.com", "password": "hidayah88"}).status_code == 409
    assert client.post("/api/auth/forgot-password", json={"email": "x@example.com"}).status_code == 409
    sign_in(client, fake)
    out = client.post("/api/auth/logout").json()
    parsed = urllib.parse.urlsplit(out["logout_url"])
    params = dict(urllib.parse.parse_qsl(parsed.query))
    assert parsed.path.endswith("/protocol/openid-connect/logout")
    assert params["post_logout_redirect_uri"] == "http://testserver/" and params["id_token_hint"].startswith("eyJ")
    assert client.get("/api/auth/session").json()["authenticated"] is False


def test_the_app_signs_in_with_its_keycloak_access_token(keycloak):
    client, fake = keycloak
    from fastapi.testclient import TestClient

    app = TestClient(client.app)
    access = fake.token({**fake.identity, "typ": "Bearer"}, ["qbasair-api"])
    me = app.get("/api/auth/session", headers={"Authorization": f"Bearer {access}"}).json()
    assert me["authenticated"] is True and me["user"]["email"] == "amina@example.com"
    # Wrong audience, expired or foreign signature: not signed in.
    other = fake.token(fake.identity, ["account"])
    assert app.get("/api/auth/session", headers={"Authorization": f"Bearer {other}"}).json()["authenticated"] is False
    expired = jwt.encode(
        {"iss": ISSUER, "aud": ["qbasair-api"], "sub": "kc-1", "iat": 1, "exp": 2}, fake.key, algorithm="RS256", headers={"kid": "k1"}
    )
    assert app.get("/api/auth/session", headers={"Authorization": f"Bearer {expired}"}).json()["authenticated"] is False
    stranger = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    forged = jwt.encode(
        {"iss": ISSUER, "aud": ["qbasair-api"], "sub": "kc-9", "iat": int(time.time()), "exp": int(time.time()) + 60},
        stranger, algorithm="RS256", headers={"kid": "k1"},
    )
    assert app.get("/api/auth/session", headers={"Authorization": f"Bearer {forged}"}).json()["authenticated"] is False
    app.close()


def test_deleting_an_account_deletes_it_in_keycloak_and_roles_go_through_keycloak(keycloak):
    client, fake = keycloak
    fake.identity["roles"] = ["admin"]
    sign_in(client, fake)
    member = auth_service.upsert_external_user("kc-2", email="bilal@example.com", email_verified=True, name="Bilal", roles=set())
    assert client.post("/api/moderation/team", json={"email": "bilal@example.com", "role": "moderator"}).status_code == 200
    calls = [(method, path) for method, path, _ in fake.admin_calls]
    assert ("POST", "/users/kc-2/role-mappings/realm") in calls
    assert ("PUT", "/users/kc-2") in calls  # staff must set up 2FA
    assert fake.admin_calls[-1][2] == {"requiredActions": ["CONFIGURE_TOTP"]}
    assert auth_service.get_user_by_id(member.id).is_moderator is True

    assert client.delete("/api/auth/account").json() == {"deleted": True}
    assert ("DELETE", "/users/kc-1") in [(method, path) for method, path, _ in fake.admin_calls]


def test_the_realm_is_rendered_as_code():
    env = {"QBASAIR_PUBLIC_URL": "https://basair.example", "QBASAIR_OIDC_CLIENT_SECRET": "s3cret"}
    realm = keycloak_realm.build_realm(env)
    assert realm["realm"] == "qbasair" and realm["verifyEmail"] and realm["bruteForceProtected"]
    assert {role["name"] for role in realm["roles"]["realm"]} == {"admin", "moderator"}
    web, app = realm["clients"]
    assert web["redirectUris"] == ["https://basair.example/api/auth/oidc/callback"] and web["secret"] == "s3cret"
    assert web["attributes"]["pkce.code.challenge.method"] == "S256" and app["publicClient"] is True
    # Roles in both; the API audience only in the app's tokens; the admin API scope for the service account.
    assert {mapper["protocolMapper"] for mapper in web["protocolMappers"]} == {"oidc-usermodel-realm-role-mapper"}
    assert {mapper["protocolMapper"] for mapper in app["protocolMappers"]} == {
        "oidc-usermodel-realm-role-mapper",
        "oidc-audience-mapper",
    }
    assert "kc-admin-api" in web["optionalClientScopes"] and {"profile", "email"} <= set(web["defaultClientScopes"])
    assert realm["identityProviders"] == [] and realm["smtpServer"] == {}
    assert not any(user.get("credentials") for user in realm["users"])  # no dev accounts in production
    social = keycloak_realm.build_realm({**env, "KC_GOOGLE_CLIENT_ID": "g", "KC_GOOGLE_CLIENT_SECRET": "gs", "KC_SMTP_HOST": "smtp.tem.scw.cloud"})
    assert [provider["alias"] for provider in social["identityProviders"]] == ["google"]
    assert social["smtpServer"]["host"] == "smtp.tem.scw.cloud"
    assert len(keycloak_realm.build_realm(env, dev=True)["users"]) == 4
    with pytest.raises(ValueError):
        keycloak_realm.build_realm({})
