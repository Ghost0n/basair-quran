# Sign-in with Keycloak

Status: implemented behind `QBASAIR_AUTH_PROVIDER=keycloak` (Q-Basair-60); the default stays
`local` (accounts in `auth.db`) until the production platform's cut-over
(`docs/production-platform-plan.md`, build order steps 3–4). Verified end to end against a real
Keycloak 26.8.2 (`scripts/keycloak_dev.sh`).

## What Keycloak owns

Credentials, email verification, password resets and policy, brute-force protection, 2FA, social
links (Apple, Google, Meta) and its own sessions. Our API keeps its accounts table (the identity is
`users.external_id` = Keycloak's `sub`), its own session cookie, and the roles **mirrored** from
Keycloak at every sign-in.

## The realm as code

`scripts/keycloak_realm.py` renders the realm `qbasair` (never edited by hand in the console):

| Part | Setting |
|---|---|
| Accounts | email as username, verified before use, password reset, remember me; the account form asks one optional name (first / last name optional) |
| Passwords | at least 10 characters, not the email or username |
| Brute force | growing waits after 5 failures (up to 15 minutes), never a permanent lock |
| Roles | `admin`, `moderator` — mirrored into `users.is_admin / is_moderator` |
| 2FA | TOTP; appointing a moderator (panel → «الفريق») adds the `CONFIGURE_TOTP` required action; Keycloak then asks the code at every sign-in |
| `qbasair-web` | confidential client of our backend: code flow + PKCE (S256), redirect `PUBLIC_URL/api/auth/oidc/callback`; its service account (`manage-users`, `view-users`, `view-realm`, scope `kc-admin-api`) deletes accounts and manages the moderator role |
| `qbasair-app` | public client of the standalone app (PKCE), redirect `qbasair://auth/callback`; its access tokens carry the `qbasair-api` audience |
| Tokens | a `roles` claim (realm roles) in ID and access tokens; access tokens live 5 minutes |
| Providers | Google, Meta (Facebook), Apple — each added only when its keys are set (`KC_GOOGLE_*`, `KC_FACEBOOK_*`, `KC_APPLE_*`; Apple needs the pinned community provider extension in Keycloak's `providers/`) |
| Mail | `KC_SMTP_*` (Scaleway TEM on the platform); off when unset |

The output (`infra/keycloak/build/`, git-ignored: it carries secrets) is imported with
`--import-realm` in development and by keycloak-config-cli on the platform.

## Flows

**Web** — «دخول» on `/login` → `GET /api/auth/oidc/login?return_to=&locale=` (state, nonce and the
PKCE verifier in a short-lived signed cookie, `qbasair_oidc`) → Keycloak's page → `GET
/api/auth/oidc/callback` checks the state, exchanges the code with the verifier, checks the ID
token (signature against the realm's keys, issuer, audience, expiry, nonce), finds the account (by
`sub`; else links a local account with the same email **only if Keycloak verified it**; else
creates one), mirrors the roles, opens our session (cookie) and returns to
`/login?from=idp&next=…`, which finishes as after any sign-in (onboarding, guest data, `next`).
Errors come back as `/login?error=cancelled|failed|email_in_use|inactive`. «حساب جديد» is the same
with `signup=1` (Keycloak's registration form).

**Sign-out** — `POST /api/auth/logout` ends our session and answers `logout_url` (Keycloak's
end-session endpoint with the ID token as hint), which the client visits so Keycloak's session ends
too, then comes back to the home page.

**App** — the standalone app sends Keycloak access tokens as `Authorization: Bearer`; the API checks
them against the realm's keys (issuer, `qbasair-api` audience, expiry) and maps them to the account
like a sign-in. (The app's own sign-in screens and native Apple / Google / Meta buttons are step 5.)

**Account deletion** deletes the Keycloak account first (if that fails, nothing is deleted), then
everything of ours.

**Closed in Keycloak mode** — `POST /api/auth/login`, `/signup`, `/forgot-password`,
`/reset-password` answer `409 {code: "use_identity_provider"}`: passwords never pass through us.

## Configuration

```text
QBASAIR_AUTH_ENABLED=1
QBASAIR_AUTH_PROVIDER=keycloak
QBASAIR_OIDC_ISSUER=https://auth.<domain>/realms/qbasair
QBASAIR_OIDC_INTERNAL_URL=http://keycloak:8080      # optional: the API's own route to Keycloak
QBASAIR_OIDC_CLIENT_ID=qbasair-web                   # default
QBASAIR_OIDC_CLIENT_SECRET=<secret>
QBASAIR_PUBLIC_URL=https://<domain>
```

## Development

```bash
scripts/keycloak_dev.sh      # Keycloak 26.8.2 from Maven Central on http://127.0.0.1:8080, realm imported
```

Accounts: `admin@basair.test`, `moderator@basair.test`, `member@basair.test`, password
`Basair-dev-1` (Keycloak's own console: `admin` / `admin`). Start the API as the script's header
shows and the web with `NEXT_PUBLIC_AUTH_ENABLED=1`. A realm change needs a fresh import: stop
Keycloak, delete `.runtime/keycloak-<version>/data/h2`, start again.

## Tests

`tests/test_oidc.py` runs every flow against a stand-in Keycloak with real RSA keys: the code flow
and PKCE, forged state, replay, wrong nonce, open redirects, cancellation, linking only by a
verified email, closed password routes, sign-out, the app's Bearer tokens (wrong audience,
expired, foreign key), account deletion, the moderator role with 2FA, and the realm rendering.

## Next (platform)

- Keycloak and its PostgreSQL database in the Compose stack, `auth.<domain>`, keycloak-config-cli
  in the deploy (steps 1–3).
- The Keycloakify theme (Arabic first, every interface language) and Scaleway TEM mail.
- The app: native provider buttons + token exchange, the email page in a system sheet (step 5).
- After the cut-over: remove the local password routes and `auth_service`'s password code.
