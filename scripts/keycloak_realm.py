"""Render the Keycloak realm «qbasair» as code (docs/keycloak.md).

The realm — roles, clients, token claims, email verification, password policy,
brute-force protection, 2FA for staff, identity providers and mail — is
generated from this file, so it is reviewed, versioned and reproducible; the
output is imported by Keycloak (``--import-realm`` in development,
keycloak-config-cli on the platform).

Settings come from the environment (or the flags):

    QBASAIR_PUBLIC_URL            https://basair.example (the web's origin)
    QBASAIR_OIDC_CLIENT_SECRET    the web client's secret (also its service account)
    QBASAIR_APP_REDIRECT_URI      the app's redirect (default qbasair://auth/callback)
    KC_SMTP_HOST / _PORT / _USER / _PASSWORD / _FROM   mail (Scaleway TEM); off when unset
    KC_GOOGLE_CLIENT_ID / _SECRET, KC_FACEBOOK_CLIENT_ID / _SECRET,
    KC_APPLE_CLIENT_ID / _TEAM_ID / _KEY_ID / _P8_KEY   a provider is added when its keys are set

    python scripts/keycloak_realm.py --output infra/keycloak/build/qbasair-realm.json [--dev]

``--dev`` adds a local admin, moderator and member (password ``Basair-dev-1``)
for development only.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "infra" / "keycloak" / "build" / "qbasair-realm.json"
REALM = "qbasair"
API_AUDIENCE = "qbasair-api"
DEV_PASSWORD = "Basair-dev-1"
DEFAULT_SCOPES = ["web-origins", "acr", "profile", "roles", "basic", "email"]
# The interface languages (apps/web/lib/i18n/locales.ts), as Keycloak names them.
LOCALES = [
    "ar", "en", "fr", "es", "de", "pt", "it", "nl", "ru", "tr", "az", "uz", "bs", "sq",
    "fa", "ur", "id", "ms", "bn", "hi", "zh-CN", "ja", "ko", "sw",
]


def _mappers(*, api_audience: bool) -> list[dict]:
    """Realm roles as a ``roles`` claim (ID and access tokens) and, for the app's
    access tokens (the API's Bearer tokens), the API's audience."""
    mappers = [
        {
            "name": "realm roles",
            "protocol": "openid-connect",
            "protocolMapper": "oidc-usermodel-realm-role-mapper",
            "config": {
                "multivalued": "true",
                "claim.name": "roles",
                "jsonType.label": "String",
                "id.token.claim": "true",
                "access.token.claim": "true",
                "userinfo.token.claim": "true",
            },
        },
    ]
    if api_audience:
        mappers.append({
            "name": "api audience",
            "protocol": "openid-connect",
            "protocolMapper": "oidc-audience-mapper",
            "config": {"included.custom.audience": API_AUDIENCE, "access.token.claim": "true", "id.token.claim": "false"},
        })
    return mappers


def _user_profile() -> dict:
    """The account form: email required; one optional display name («الاسم», firstName) and
    an optional lastName — Keycloak's default would require both names of everyone."""
    permissions = {"view": ["admin", "user"], "edit": ["admin", "user"]}
    name_rules = {"length": {"max": 120}, "person-name-prohibited-characters": {}}
    profile = {
        "attributes": [
            {"name": "username", "displayName": "${username}", "permissions": permissions, "multivalued": False,
             "validations": {"length": {"min": 3, "max": 255}, "username-prohibited-characters": {},
                             "up-username-not-idn-homograph": {}}},
            {"name": "email", "displayName": "${email}", "permissions": permissions, "multivalued": False,
             "required": {"roles": ["user"]}, "validations": {"email": {}, "length": {"max": 255}}},
            {"name": "firstName", "displayName": "${firstName}", "permissions": permissions, "multivalued": False,
             "validations": name_rules},
            {"name": "lastName", "displayName": "${lastName}", "permissions": permissions, "multivalued": False,
             "validations": name_rules},
        ],
        "groups": [{"name": "user-metadata", "displayHeader": "User metadata",
                    "displayDescription": "Attributes, which refer to user metadata"}],
    }
    return {
        "org.keycloak.userprofile.UserProfileProvider": [
            {"providerId": "declarative-user-profile", "subComponents": {},
             "config": {"kc.user.profile.config": [json.dumps(profile, ensure_ascii=False)]}}
        ]
    }


def _identity_providers(env: dict) -> list[dict]:
    providers = []
    common = {"enabled": True, "trustEmail": True, "firstBrokerLoginFlowAlias": "first broker login", "storeToken": False}
    if env.get("KC_GOOGLE_CLIENT_ID") and env.get("KC_GOOGLE_CLIENT_SECRET"):
        providers.append({**common, "alias": "google", "providerId": "google", "displayName": "Google",
                          "config": {"clientId": env["KC_GOOGLE_CLIENT_ID"], "clientSecret": env["KC_GOOGLE_CLIENT_SECRET"],
                                     "syncMode": "IMPORT", "defaultScope": "openid email profile"}})
    if env.get("KC_FACEBOOK_CLIENT_ID") and env.get("KC_FACEBOOK_CLIENT_SECRET"):
        providers.append({**common, "alias": "facebook", "providerId": "facebook", "displayName": "Meta (Facebook)",
                          "config": {"clientId": env["KC_FACEBOOK_CLIENT_ID"], "clientSecret": env["KC_FACEBOOK_CLIENT_SECRET"],
                                     "syncMode": "IMPORT", "defaultScope": "email public_profile"}})
    if all(env.get(key) for key in ("KC_APPLE_CLIENT_ID", "KC_APPLE_TEAM_ID", "KC_APPLE_KEY_ID", "KC_APPLE_P8_KEY")):
        # Needs the pinned community Apple provider extension in Keycloak's providers/ (docs/keycloak.md).
        providers.append({**common, "alias": "apple", "providerId": "apple", "displayName": "Apple",
                          "config": {"clientId": env["KC_APPLE_CLIENT_ID"], "teamId": env["KC_APPLE_TEAM_ID"],
                                     "keyId": env["KC_APPLE_KEY_ID"], "p8Content": env["KC_APPLE_P8_KEY"],
                                     "syncMode": "IMPORT", "defaultScope": "openid email name"}})
    return providers


def _smtp(env: dict) -> dict:
    if not env.get("KC_SMTP_HOST"):
        return {}
    return {
        "host": env["KC_SMTP_HOST"],
        "port": env.get("KC_SMTP_PORT", "587"),
        "from": env.get("KC_SMTP_FROM", "no-reply@localhost"),
        "fromDisplayName": "بصائر",
        "starttls": "true",
        "auth": "true" if env.get("KC_SMTP_USER") else "false",
        "user": env.get("KC_SMTP_USER", ""),
        "password": env.get("KC_SMTP_PASSWORD", ""),
    }


def _dev_users() -> list[dict]:
    def user(name: str, roles: list[str]) -> dict:
        return {
            "username": f"{name}@basair.test",
            "email": f"{name}@basair.test",
            "firstName": name,
            "enabled": True,
            "emailVerified": True,
            "credentials": [{"type": "password", "value": DEV_PASSWORD, "temporary": False}],
            "realmRoles": ["default-roles-qbasair", *roles],
        }

    return [user("admin", ["admin"]), user("moderator", ["moderator"]), user("member", [])]


def build_realm(env: dict, *, dev: bool = False) -> dict:
    public = (env.get("QBASAIR_PUBLIC_URL") or "").rstrip("/")
    secret = env.get("QBASAIR_OIDC_CLIENT_SECRET") or ""
    if not public or not secret:
        raise ValueError("QBASAIR_PUBLIC_URL and QBASAIR_OIDC_CLIENT_SECRET are required.")
    app_redirect = env.get("QBASAIR_APP_REDIRECT_URI") or "qbasair://auth/callback"
    realm = {
        "realm": REALM,
        "enabled": True,
        "displayName": "بصائر",
        "sslRequired": "none" if dev else "external",
        # Accounts: email is the username, verified before first use.
        "registrationAllowed": True,
        "registrationEmailAsUsername": True,
        "loginWithEmailAllowed": True,
        "duplicateEmailsAllowed": False,
        "verifyEmail": True,
        "resetPasswordAllowed": True,
        "rememberMe": True,
        "editUsernameAllowed": False,
        "passwordPolicy": "length(10) and maxLength(128) and notUsername and notEmail",
        # Brute force: growing waits after 5 failures, never a permanent lock.
        "bruteForceProtected": True,
        "permanentLockout": False,
        "failureFactor": 5,
        "waitIncrementSeconds": 60,
        "maxFailureWaitSeconds": 900,
        "maxDeltaTimeSeconds": 43200,
        "quickLoginCheckMilliSeconds": 1000,
        "minimumQuickLoginWaitSeconds": 60,
        # Sessions: short access tokens; the web keeps its own session (auth_service).
        "accessTokenLifespan": 300,
        "ssoSessionIdleTimeout": 7 * 86400,
        "ssoSessionMaxLifespan": 30 * 86400,
        "offlineSessionIdleTimeout": 30 * 86400,
        "internationalizationEnabled": True,
        "supportedLocales": LOCALES,
        "defaultLocale": "ar",
        "otpPolicyType": "totp",
        "otpPolicyAlgorithm": "HmacSHA1",
        "otpPolicyDigits": 6,
        "otpPolicyPeriod": 30,
        "roles": {"realm": [
            {"name": "admin", "description": "Admins: every moderation power, appoint moderators (2FA required)."},
            {"name": "moderator", "description": "Moderators: the supervision panel (2FA required)."},
        ]},
        "clients": [
            {
                # The web's backend (code flow + PKCE, docs/keycloak.md); its service
                # account deletes accounts and manages the moderator role.
                "clientId": "qbasair-web",
                "name": "Basair (web)",
                "enabled": True,
                "protocol": "openid-connect",
                "publicClient": False,
                "clientAuthenticatorType": "client-secret",
                "secret": secret,
                "standardFlowEnabled": True,
                "implicitFlowEnabled": False,
                "directAccessGrantsEnabled": False,
                "serviceAccountsEnabled": True,
                "redirectUris": [f"{public}/api/auth/oidc/callback"],
                "webOrigins": [public],
                "attributes": {"pkce.code.challenge.method": "S256", "post.logout.redirect.uris": f"{public}/*"},
                # The service account asks for kc-admin-api: Keycloak's admin API only
                # accepts tokens with its own audience.
                # Listing scopes replaces Keycloak's defaults, so the defaults are named too.
                "defaultClientScopes": DEFAULT_SCOPES,
                "optionalClientScopes": ["offline_access", "kc-admin-api"],
                "protocolMappers": _mappers(api_audience=False),
            },
            {
                # The standalone app (public client, PKCE); its access tokens are the API's Bearer tokens.
                "clientId": "qbasair-app",
                "name": "Basair (app)",
                "enabled": True,
                "protocol": "openid-connect",
                "publicClient": True,
                "standardFlowEnabled": True,
                "implicitFlowEnabled": False,
                "directAccessGrantsEnabled": False,
                "redirectUris": [app_redirect],
                "attributes": {"pkce.code.challenge.method": "S256", "post.logout.redirect.uris": app_redirect},
                "protocolMappers": _mappers(api_audience=True),
            },
        ],
        "users": [
            {
                "username": "service-account-qbasair-web",
                "enabled": True,
                "serviceAccountClientId": "qbasair-web",
                "clientRoles": {"realm-management": ["manage-users", "view-users", "view-realm"]},
            },
            *(_dev_users() if dev else []),
        ],
        "components": _user_profile(),
        "identityProviders": _identity_providers(env),
        "smtpServer": _smtp(env),
    }
    return realm


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--dev", action="store_true", help="add local admin / moderator / member accounts")
    args = parser.parse_args(argv)
    try:
        realm = build_realm(dict(os.environ), dev=args.dev)
    except ValueError as exc:
        print(exc, file=sys.stderr)
        return 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(realm, ensure_ascii=False, indent=2), encoding="utf-8")
    providers = ", ".join(provider["alias"] for provider in realm["identityProviders"]) or "none (email only)"
    print(f"realm {REALM} → {args.output} · providers: {providers} · mail: {'on' if realm['smtpServer'] else 'off'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
