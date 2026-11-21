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
    KC_SMTP_HOST / _PORT / _USER / _PASSWORD / _FROM   mail (Infomaniak, mail.infomaniak.com:587); off when unset
    KC_SMTP_STARTTLS              default true (required); false only for scripts/dev_mail.py
    KC_GOOGLE_CLIENT_ID / _SECRET, KC_FACEBOOK_CLIENT_ID / _SECRET,
    KC_APPLE_CLIENT_ID / _TEAM_ID / _KEY_ID / _P8_KEY   a provider is added when its keys are set
                                  (the .p8 key on one line, its line breaks written 
)
    KC_THEME                      the sign-in pages' and mails' theme (default qbasair,
                                  apps/keycloak-theme; its JAR goes in Keycloak's providers/);
                                  empty = Keycloak's own

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
# The sign-in pages' and mails' theme (apps/keycloak-theme, Keycloakify): the web's design, every interface language.
THEME = "qbasair"
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
    common = {"enabled": True, "trustEmail": True, "firstBrokerLoginFlowAlias": FIRST_BROKER_FLOW, "storeToken": False}
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
                                     "keyId": env["KC_APPLE_KEY_ID"], "p8Content": env["KC_APPLE_P8_KEY"].replace("\\n", "\n"),
                                     "syncMode": "IMPORT", "defaultScope": "openid email name"}})
    return providers


def _smtp(env: dict) -> dict:
    if not env.get("KC_SMTP_HOST"):
        return {}
    return {
        "host": env["KC_SMTP_HOST"],
        "port": env.get("KC_SMTP_PORT", "587"),
        "from": env.get("KC_SMTP_FROM", "no-reply@localhost"),
        "fromDisplayName": "بصائر القرآن",
        # Keycloak requires STARTTLS when it is on; only a local catcher (scripts/dev_mail.py) turns it off.
        "starttls": "false" if env.get("KC_SMTP_STARTTLS", "true").strip().lower() in {"0", "false", "no"} else "true",
        "auth": "true" if env.get("KC_SMTP_USER") else "false",
        "user": env.get("KC_SMTP_USER", ""),
        "password": env.get("KC_SMTP_PASSWORD", ""),
    }


# Keycloak's default required actions (26.8), as a fresh realm gets them: listing
# any replaces the defaults, so all are named. Keycloak's email link is off; the
# email code takes its place, right after it (docs/keycloak.md «Email code»).
EMAIL_CODE_ACTION = "qb-verify-email-code"
_DEFAULT_REQUIRED_ACTIONS = [
    ("TERMS_AND_CONDITIONS", "Terms and Conditions", False, 20),
    ("UPDATE_PROFILE", "Update Profile", True, 40),
    ("VERIFY_EMAIL", "Verify Email", False, 50),
    (EMAIL_CODE_ACTION, "Verify email with a code", True, 51),
    ("CONFIGURE_TOTP", "Configure OTP", True, 54),
    ("UPDATE_PASSWORD", "Update Password", True, 57),
    ("delete_account", "Delete Account", False, 60),
    ("UPDATE_EMAIL", "Update Email", False, 70),
    ("webauthn-register", "Webauthn Register", True, 80),
    ("webauthn-register-passwordless", "Webauthn Register Passwordless", True, 90),
    ("VERIFY_PROFILE", "Verify Profile", True, 100),
    ("delete_credential", "Delete Credential", True, 110),
    ("idp_link", "Linking Identity Provider", True, 120),
    ("CONFIGURE_RECOVERY_AUTHN_CODES", "Recovery Authentication Codes", True, 130),
    ("update_user_locale", "Update User Locale", True, 1000),
]


def _required_actions() -> list[dict]:
    return [
        {"alias": alias, "name": name, "providerId": alias, "enabled": enabled,
         "defaultAction": False, "priority": priority, "config": {}}
        for alias, name, enabled, priority in _DEFAULT_REQUIRED_ACTIONS
    ]


# Signing in with a provider (Google, Apple, Meta) is implicit: a new email creates
# the account, a known one links to it and signs in (docs/keycloak.md «Sign-in
# providers»). Keycloak's own «first broker login», with one step added between
# «create if unique» and «confirm the link»: qb-idp-auto-link
# (apps/keycloak-email-code, VerifiedOwnerAutoLink). When it declines (the email
# was edited, or the provider does not vouch for it), Keycloak's confirm-the-link
# path (by email or by password) still runs.
FIRST_BROKER_FLOW = "qb first broker login"
AUTO_LINK_AUTHENTICATOR = "qb-idp-auto-link"
_REVIEW_PROFILE_CONFIG = "qb review profile"


def _authentication_flows() -> list[dict]:
    def step(authenticator: str, requirement: str, config: str | None = None) -> dict:
        found = {"authenticator": authenticator, "requirement": requirement, "authenticatorFlow": False}
        return {**found, "authenticatorConfig": config} if config else found

    def subflow(alias: str, requirement: str) -> dict:
        return {"flowAlias": alias, "requirement": requirement, "authenticatorFlow": True}

    def flow(alias: str, description: str, executions: list[dict], *, top: bool = False) -> dict:
        return {
            "alias": alias, "description": description, "providerId": "basic-flow",
            "topLevel": top, "builtIn": False,
            "authenticationExecutions": [
                {**execution, "priority": 10 * (index + 1), "userSetupAllowed": False}
                for index, execution in enumerate(executions)
            ],
        }

    return [
        flow(FIRST_BROKER_FLOW, "A provider's first sign-in: create the account, or link the one with that email.", [
            step("idp-review-profile", "REQUIRED", _REVIEW_PROFILE_CONFIG),
            subflow("qb user creation or linking", "REQUIRED"),
        ], top=True),
        flow("qb user creation or linking", "Create the account, or link the existing one.", [
            step("idp-create-user-if-unique", "ALTERNATIVE"),
            step(AUTO_LINK_AUTHENTICATOR, "ALTERNATIVE"),
            subflow("qb handle existing account", "ALTERNATIVE"),
        ]),
        flow("qb handle existing account", "Confirm the link, then prove the account is yours.", [
            step("idp-confirm-link", "REQUIRED"),
            subflow("qb account verification options", "REQUIRED"),
        ]),
        flow("qb account verification options", "By email, or by the account's password.", [
            step("idp-email-verification", "ALTERNATIVE"),
            subflow("qb verify existing account by re-authentication", "ALTERNATIVE"),
        ]),
        flow("qb verify existing account by re-authentication", "The account's password, then its 2FA if set.", [
            step("idp-username-password-form", "REQUIRED"),
            subflow("qb first broker login conditional 2fa", "CONDITIONAL"),
        ]),
        flow("qb first broker login conditional 2fa", "The account's one-time code, when it has one.", [
            step("conditional-user-configured", "REQUIRED"),
            step("auth-otp-form", "ALTERNATIVE"),
        ]),
    ]


def _authenticator_config() -> list[dict]:
    # The review page shows only when the provider left something out (Apple may hide the name).
    return [{"alias": _REVIEW_PROFILE_CONFIG, "config": {"update.profile.on.first.login": "missing"}}]


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
    theme = env.get("KC_THEME", THEME).strip()
    realm = {
        "realm": REALM,
        "enabled": True,
        "displayName": "بصائر القرآن",
        "sslRequired": "none" if dev else "external",
        # Accounts: email is the username, verified before first use — by a 6-digit
        # code (the qb-verify-email-code required action, apps/keycloak-email-code),
        # so Keycloak's own link is off.
        "registrationAllowed": True,
        "registrationEmailAsUsername": True,
        "loginWithEmailAllowed": True,
        "duplicateEmailsAllowed": False,
        "verifyEmail": False,
        "requiredActions": _required_actions(),
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
        # Sign-in pages and mails in the app's design (docs/keycloak.md «Theme»).
        **({"loginTheme": theme, "emailTheme": theme} if theme else {}),
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
                # The sign-in pages' way back to the app (and Keycloak's «back to application»).
                "baseUrl": f"{public}/",
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
                # view-identity-providers: settings lists the realm's providers to link.
                "clientRoles": {"realm-management": ["manage-users", "view-users", "view-realm", "view-identity-providers"]},
            },
            *(_dev_users() if dev else []),
        ],
        "components": _user_profile(),
        "identityProviders": _identity_providers(env),
        "authenticationFlows": _authentication_flows(),
        "firstBrokerLoginFlow": FIRST_BROKER_FLOW,
        "authenticatorConfig": _authenticator_config(),
        "smtpServer": _smtp(env),
    }
    return realm


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--dev", action="store_true", help="add local admin / moderator / member accounts")
    args = parser.parse_args(argv)
    # The summary line carries «→» and «·»: a Windows console (cp1252) cannot encode them.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")
    try:
        realm = build_realm(dict(os.environ), dev=args.dev)
    except ValueError as exc:
        print(exc, file=sys.stderr)
        return 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(realm, ensure_ascii=False, indent=2), encoding="utf-8")
    providers = ", ".join(provider["alias"] for provider in realm["identityProviders"]) or "none (email only)"
    theme = realm.get("loginTheme", "keycloak (stock)")
    print(f"realm {REALM} → {args.output} · providers: {providers} · mail: {'on' if realm['smtpServer'] else 'off'} · theme: {theme}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
