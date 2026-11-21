"""Keycloak sign-in (docs/keycloak.md): the code flow with PKCE, ID token checks,
account linking and roles, the app's Bearer access tokens, sign-out, deletion,
and the realm rendered as code — against a stand-in Keycloak with real RSA keys."""

import base64
import hashlib
import io
import json
import sys
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
        # Linked accounts: the realm's providers, the user's links and credentials.
        self.providers = [{"alias": "google", "displayName": "Google", "enabled": True},
                          {"alias": "apple", "displayName": "Apple", "enabled": True},
                          {"alias": "facebook", "displayName": "Meta (Facebook)", "enabled": False}]
        self.links = {"kc-1": [{"identityProvider": "google", "userName": "amina@gmail.com"}]}
        self.credentials = {"kc-1": []}
        self.password_refused = False
        self.gone = set()  # Keycloak identities that no longer exist (admin GET users/<sub> → 404)

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
            path = url.split("/admin/realms/qbasair")[1]
            self.admin_calls.append((method, path, body))
            if path == "/identity-provider/instances":
                return self.providers
            parts = path.split("/")  # "", "users", <sub>, <what>, [alias]
            if len(parts) >= 4 and parts[1] == "users":
                subject, what = parts[2], parts[3]
                if what == "federated-identity" and method == "GET":
                    return self.links.get(subject, [])
                if what == "federated-identity" and method == "DELETE":
                    self.links[subject] = [link for link in self.links.get(subject, []) if link["identityProvider"] != parts[4]]
                    return None
                if what == "credentials":
                    return self.credentials.get(subject, [])
                if what == "reset-password":
                    if self.password_refused:
                        raise oidc_service.OidcError("Keycloak answered 400", status=502, upstream=400, reason="invalidPasswordMinLengthMessage")
                    self.credentials.setdefault(subject, []).append({"type": "password"})
                    return None
            if method == "GET" and len(parts) == 3 and parts[1] == "users" and parts[2] in self.gone:
                raise oidc_service.OidcError("Keycloak answered 404", status=502, upstream=404)
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


def test_an_account_moves_to_a_new_identity_only_when_the_old_one_is_gone(keycloak):
    client, fake = keycloak
    sign_in(client, fake)
    account = client.get("/api/auth/session").json()["user"]
    client.post("/api/auth/logout")
    # The same verified email under a new Keycloak identity, while the old one still exists:
    # it may have changed its email in Keycloak since — the account stays its own.
    fake.identity["sub"] = "kc-new"
    done, _ = sign_in(client, fake, code="code-2")
    assert done.headers["location"] == "/login?error=email_in_use"
    # The old identity is gone from Keycloak (account deleted, realm rebuilt): the account moves.
    fake.gone = {"kc-1"}
    done, _ = sign_in(client, fake, code="code-3")
    assert done.headers["location"] == "/?mode=community"
    assert client.get("/api/auth/session").json()["user"]["id"] == account["id"]
    assert auth_service.get_external_id(account["id"]) == "kc-new"
    # Never for an unverified email.
    client.post("/api/auth/logout")
    fake.identity = {**fake.identity, "sub": "kc-third", "email_verified": False}
    fake.gone = {"kc-1", "kc-new"}
    done, _ = sign_in(client, fake, code="code-4")
    assert done.headers["location"] == "/login?error=email_in_use"


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


def test_settings_lists_links_and_unlinks_with_a_password_first(keycloak):
    client, fake = keycloak
    assert client.get("/api/auth/linked-accounts").status_code == 401
    sign_in(client, fake)
    listed = client.get("/api/auth/linked-accounts").json()
    # The realm's enabled providers in the sign-in page's order, with the account's links.
    assert listed == {
        "providers": [
            {"alias": "apple", "name": "Apple", "linked": False, "username": None},
            {"alias": "google", "name": "Google", "linked": True, "username": "amina@gmail.com"},
        ],
        "has_password": False,
    }
    # No password yet: unlinking asks one, and a refused one leaves the link in place.
    asked = client.post("/api/auth/linked-accounts/google/unlink", json={})
    assert asked.status_code == 422 and asked.json()["detail"]["code"] == "password_required"
    fake.password_refused = True
    refused = client.post("/api/auth/linked-accounts/google/unlink", json={"password": "short"})
    assert refused.status_code == 422 and refused.json()["detail"]["code"] == "password_rejected"
    assert fake.links["kc-1"] and ("DELETE", "/users/kc-1/federated-identity/google") not in [(m, p) for m, p, _ in fake.admin_calls]
    fake.password_refused = False
    done = client.post("/api/auth/linked-accounts/google/unlink", json={"password": "a-long-passphrase"})
    assert done.status_code == 200 and done.json()["has_password"] is True
    assert [provider["linked"] for provider in done.json()["providers"]] == [False, False]
    reset = [body for method, path, body in fake.admin_calls if path == "/users/kc-1/reset-password"][-1]
    assert reset == {"type": "password", "value": "a-long-passphrase", "temporary": False}
    # With a password, unlinking asks nothing; an unlinked or unknown provider is a 404.
    fake.links["kc-1"] = [{"identityProvider": "apple", "userName": "x@privaterelay.appleid.com"}]
    assert client.post("/api/auth/linked-accounts/apple/unlink", json={}).status_code == 200
    assert client.post("/api/auth/linked-accounts/apple/unlink", json={}).status_code == 404
    assert client.post("/api/auth/linked-accounts/Not%20An%20Alias/unlink", json={}).status_code == 422


def test_linking_goes_through_keycloak_and_comes_back_to_settings(keycloak):
    client, fake = keycloak
    # Signed out: to sign-in first.
    out = client.get("/api/auth/oidc/link/google", params={"return_to": "/settings"}, follow_redirects=False)
    assert out.headers["location"] == "/login?next=%2Fsettings"
    sign_in(client, fake)

    def link(status=None, code="link-1", *, error=None, subject=None):
        started = client.get("/api/auth/oidc/link/google", params={"return_to": "/settings?tab=account"}, follow_redirects=False)
        query = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(started.headers["location"]).query))
        assert query["kc_action"] == "idp_link:google" and query["login_hint"] == "amina@example.com"
        fake.challenges[code] = (query["nonce"], query["code_challenge"])
        if subject:
            fake.identity = {**fake.identity, "sub": subject}
        params = {"state": query["state"], **({"code": code} if not error else {"error": error})}
        if status:
            params["kc_action_status"] = status
        back = client.get("/api/auth/oidc/callback", params=params, follow_redirects=False)
        fake.identity = {**fake.identity, "sub": "kc-1"}
        return back.headers["location"]

    me = client.get("/api/auth/session").json()["user"]
    assert link("success") == "/settings?tab=account&linked=google"
    assert link("cancelled", "link-2") == "/settings?tab=account&link_error=cancelled"
    assert link(error="access_denied") == "/settings?tab=account&link_error=cancelled"
    # Keycloak signed in as someone else meanwhile: nothing changes here.
    assert link("success", "link-3", subject="kc-9") == "/settings?tab=account&link_error=other_account"
    # «error» while the link exists anyway (already linked) reads as linked; otherwise in use.
    assert link("error", "link-4") == "/settings?tab=account&linked=google"
    fake.links["kc-1"] = []
    assert link("error", "link-5") == "/settings?tab=account&link_error=in_use"
    # Our session is the same one throughout.
    assert client.get("/api/auth/session").json()["user"] == me


def test_linked_accounts_stay_closed_with_local_accounts(tmp_path, monkeypatch):
    client, finalize = build_auth_client(tmp_path, monkeypatch)
    try:
        assert client.get("/api/auth/linked-accounts").status_code == 404
        assert client.get("/api/auth/oidc/link/google", follow_redirects=False).status_code == 404
    finally:
        finalize()


def test_the_realm_is_rendered_as_code():
    env = {"QBASAIR_PUBLIC_URL": "https://basair.example", "QBASAIR_OIDC_CLIENT_SECRET": "s3cret"}
    realm = keycloak_realm.build_realm(env)
    assert realm["realm"] == "qbasair" and realm["bruteForceProtected"]
    # Email verified by a code (apps/keycloak-email-code), not Keycloak's link; the
    # listed actions replace Keycloak's defaults, so 2FA and password set-up stay on.
    actions = {action["alias"]: action for action in realm["requiredActions"]}
    assert realm["verifyEmail"] is False and actions["VERIFY_EMAIL"]["enabled"] is False
    assert actions["qb-verify-email-code"] == {
        "alias": "qb-verify-email-code", "name": "Verify email with a code", "providerId": "qb-verify-email-code",
        "enabled": True, "defaultAction": False, "priority": 51, "config": {},
    }
    assert all(actions[alias]["enabled"] for alias in ("CONFIGURE_TOTP", "UPDATE_PASSWORD", "UPDATE_PROFILE", "update_user_locale"))
    assert len({action["priority"] for action in realm["requiredActions"]}) == len(realm["requiredActions"])
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
    social = keycloak_realm.build_realm({**env, "KC_GOOGLE_CLIENT_ID": "g", "KC_GOOGLE_CLIENT_SECRET": "gs", "KC_SMTP_HOST": "mail.infomaniak.com"})
    assert [provider["alias"] for provider in social["identityProviders"]] == ["google"]
    assert social["smtpServer"]["host"] == "mail.infomaniak.com" and social["smtpServer"]["starttls"] == "true"
    # The Apple key comes on one line (an env file), its line breaks written \n.
    apple = keycloak_realm.build_realm({**env, "KC_APPLE_CLIENT_ID": "a", "KC_APPLE_TEAM_ID": "t", "KC_APPLE_KEY_ID": "k",
                                        "KC_APPLE_P8_KEY": "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----"})
    assert apple["identityProviders"][0]["config"]["p8Content"] == "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"
    local_mail = keycloak_realm.build_realm({**env, "KC_SMTP_HOST": "127.0.0.1", "KC_SMTP_PORT": "1025", "KC_SMTP_STARTTLS": "false"})
    assert local_mail["smtpServer"]["starttls"] == "false"
    assert len(keycloak_realm.build_realm(env, dev=True)["users"]) == 4
    # The sign-in pages and mails use the app's theme (apps/keycloak-theme) and lead back to the app.
    assert realm["loginTheme"] == realm["emailTheme"] == "qbasair" and web["baseUrl"] == "https://basair.example/"
    stock = keycloak_realm.build_realm({**env, "KC_THEME": ""})
    assert "loginTheme" not in stock and "emailTheme" not in stock
    with pytest.raises(ValueError):
        keycloak_realm.build_realm({})


def test_provider_sign_in_links_or_creates_without_a_question():
    env = {"QBASAIR_PUBLIC_URL": "https://basair.example", "QBASAIR_OIDC_CLIENT_SECRET": "s3cret",
           "KC_GOOGLE_CLIENT_ID": "g", "KC_GOOGLE_CLIENT_SECRET": "gs"}
    realm = keycloak_realm.build_realm(env)
    flow_alias = keycloak_realm.FIRST_BROKER_FLOW
    assert realm["firstBrokerLoginFlow"] == flow_alias
    assert all(provider["firstBrokerLoginFlowAlias"] == flow_alias and provider["trustEmail"] for provider in realm["identityProviders"])
    flows = {flow["alias"]: flow for flow in realm["authenticationFlows"]}
    assert flows[flow_alias]["topLevel"] is True

    def steps(alias):
        return [(e.get("authenticator") or e.get("flowAlias"), e["requirement"]) for e in flows[alias]["authenticationExecutions"]]

    # Every sub-flow named exists, so Keycloak imports the flow whole.
    for flow in flows.values():
        for execution in flow["authenticationExecutions"]:
            assert not execution["authenticatorFlow"] or execution["flowAlias"] in flows
    # A new email creates the account; a known one is linked by qb-idp-auto-link before Keycloak's «confirm the link».
    assert steps("qb user creation or linking") == [
        ("idp-create-user-if-unique", "ALTERNATIVE"),
        (keycloak_realm.AUTO_LINK_AUTHENTICATOR, "ALTERNATIVE"),
        ("qb handle existing account", "ALTERNATIVE"),
    ]
    # The profile page shows only when the provider left something out.
    review = flows[flow_alias]["authenticationExecutions"][0]
    configs = {config["alias"]: config["config"] for config in realm["authenticatorConfig"]}
    assert review["authenticator"] == "idp-review-profile"
    assert configs[review["authenticatorConfig"]] == {"update.profile.on.first.login": "missing"}


def test_google_gets_its_own_prompt_never_the_webs_create():
    """«New account» asks Keycloak for prompt=create; Keycloak forwards the web's
    prompt to a provider that has none, and Google refuses «create»."""
    env = {"QBASAIR_PUBLIC_URL": "https://basair.example", "QBASAIR_OIDC_CLIENT_SECRET": "s3cret",
           "KC_GOOGLE_CLIENT_ID": "g", "KC_GOOGLE_CLIENT_SECRET": "gs"}
    google = keycloak_realm.build_realm(env)["identityProviders"][0]
    assert google["config"]["prompt"] == "select_account"


def test_sync_re_applies_the_public_address_to_an_existing_web_client():
    """The realm is imported once: an address fixed later in .env.production is
    re-applied by the deploy, the rest of the client left as Keycloak has it."""
    env = {"QBASAIR_PUBLIC_URL": "https://basair.example/"}
    stale = {
        "id": "c1", "clientId": "qbasair-web", "secret": "**********", "rootUrl": "",
        "baseUrl": "http://127.0.0.2/", "redirectUris": ["http://127.0.0.2/api/auth/oidc/callback"],
        "webOrigins": ["http://127.0.0.2"], "serviceAccountsEnabled": True,
        "attributes": {"pkce.code.challenge.method": "S256", "post.logout.redirect.uris": "http://127.0.0.2/*"},
    }
    updated = keycloak_realm.sync_web_client(stale, env)
    assert updated["redirectUris"] == ["https://basair.example/api/auth/oidc/callback"]
    assert updated["rootUrl"] == "https://basair.example" and updated["baseUrl"] == "https://basair.example/"
    assert updated["webOrigins"] == ["https://basair.example"]
    assert updated["attributes"] == {"pkce.code.challenge.method": "S256", "post.logout.redirect.uris": "https://basair.example/*"}
    # Untouched: the rest of the client, and the secret is never sent back.
    assert updated["id"] == "c1" and updated["serviceAccountsEnabled"] is True and "secret" not in updated
    assert keycloak_realm.sync_web_client(updated, env) is None
    with pytest.raises(ValueError):
        keycloak_realm.sync_web_client(stale, {})


def test_sync_sets_the_provider_prompt_and_keeps_the_masked_secret():
    live = {"alias": "google", "providerId": "google", "config": {"clientId": "g", "clientSecret": "**********", "prompt": ""}}
    updated = keycloak_realm.sync_identity_provider(live)
    assert updated["config"] == {"clientId": "g", "clientSecret": "**********", "prompt": "select_account"}
    assert keycloak_realm.sync_identity_provider(updated) is None
    # Providers without a prompt of their own are left alone.
    assert keycloak_realm.sync_identity_provider({"alias": "facebook", "config": {}}) is None


def test_the_sync_command_reads_keycloak_json_and_prints_only_a_change(monkeypatch, capsys):
    monkeypatch.setenv("QBASAIR_PUBLIC_URL", "https://basair.example")
    client = {"clientId": "qbasair-web", "redirectUris": ["http://localhost/api/auth/oidc/callback"]}
    monkeypatch.setattr(sys, "stdin", io.StringIO(json.dumps([client])))  # kcadm's search answers a list
    assert keycloak_realm.main(["--sync", "web-client"]) == 0
    assert json.loads(capsys.readouterr().out)["redirectUris"] == ["https://basair.example/api/auth/oidc/callback"]
    google = {"alias": "google", "config": {"prompt": "select_account"}}
    monkeypatch.setattr(sys, "stdin", io.StringIO(json.dumps(google)))
    assert keycloak_realm.main(["--sync", "provider"]) == 0
    assert capsys.readouterr().out == ""


def test_the_realm_script_runs_on_a_windows_console(tmp_path, monkeypatch):
    """The summary line («→», «·») must not crash a cp1252 console."""
    stdout = io.TextIOWrapper(io.BytesIO(), encoding="cp1252")
    monkeypatch.setattr(sys, "stdout", stdout)
    monkeypatch.setenv("QBASAIR_PUBLIC_URL", "https://basair.example")
    monkeypatch.setenv("QBASAIR_OIDC_CLIENT_SECRET", "s3cret")
    output = tmp_path / "realm.json"
    assert keycloak_realm.main(["--output", str(output)]) == 0
    assert json.loads(output.read_text(encoding="utf-8"))["realm"] == "qbasair"
    stdout.flush()
    assert b"theme: qbasair" in stdout.buffer.getvalue()
