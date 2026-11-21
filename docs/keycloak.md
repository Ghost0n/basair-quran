# Sign-in with Keycloak

Status: implemented behind `QBASAIR_AUTH_PROVIDER=keycloak` (Q-Basair-60), and production's
sign-in from the first release (Q-Basair-123, [Production](#production)). Without it the API keeps
local accounts in `auth.db`. Verified end to end against a real Keycloak 26.8.2, in development
(`scripts/keycloak_dev.sh`) and in the production stack (PostgreSQL, nginx).

## What Keycloak owns

Credentials, email verification, password resets and policy, brute-force protection, 2FA, social
links (Apple, Google, Meta) and its own sessions. Our API keeps its accounts table (the identity is
`users.external_id` = Keycloak's `sub`), its own session cookie, and the roles **mirrored** from
Keycloak at every sign-in.

## The realm as code

`scripts/keycloak_realm.py` renders the realm `qbasair` (never edited by hand in the console):

| Part | Setting |
|---|---|
| Accounts | email as username, verified before use by a 6-digit code (see [Email code](#email-code); Keycloak's link, `verifyEmail`, is off), password reset, remember me; the account form asks one optional name (first / last name optional) |
| Passwords | at least 10 characters, not the email or username |
| Brute force | growing waits after 5 failures (up to 15 minutes), never a permanent lock |
| Roles | `admin`, `moderator` — mirrored into `users.is_admin / is_moderator` |
| 2FA | TOTP; appointing a moderator (panel → «الفريق») adds the `CONFIGURE_TOTP` required action; Keycloak then asks the code at every sign-in |
| `qbasair-web` | confidential client of our backend: code flow + PKCE (S256), redirect `PUBLIC_URL/api/auth/oidc/callback`; its service account (`manage-users`, `view-users`, `view-realm`, `view-identity-providers`, scope `kc-admin-api`) deletes accounts, manages the moderator role and the linked providers |
| `qbasair-app` | public client of the standalone app (PKCE), redirect `qbasair://auth/callback`; its access tokens carry the `qbasair-api` audience |
| Tokens | a `roles` claim (realm roles) in ID and access tokens; access tokens live 5 minutes |
| Providers | Google, Meta (Facebook), Apple — each added only when its keys are set (`KC_GOOGLE_*`, `KC_FACEBOOK_*`, `KC_APPLE_*`; Apple needs the pinned community provider extension in Keycloak's `providers/`); their first sign-in runs `qb first broker login` (see [Sign-in providers](#sign-in-providers)) |
| Required actions | Keycloak's defaults, listed (listing any replaces them), with `VERIFY_EMAIL` off and `qb-verify-email-code` after it |
| Mail | `KC_SMTP_*` (the domain's Infomaniak mail on the platform, see [Email code](#email-code)); off when unset — and then new accounts cannot verify their email. STARTTLS is required (`KC_SMTP_STARTTLS=false` only for the local catcher, see Development) |
| Theme | `qbasair` for the sign-in pages and the mails (`apps/keycloak-theme`, see [Theme](#theme)); `KC_THEME` names another, empty = Keycloak's own. `qbasair-web`'s `baseUrl` (`PUBLIC_URL/`) is the theme's «تصفّح كضيف ←» link back to the app |

The output (`infra/keycloak/build/` in development, `keycloak/import/` on the server; never
committed: it carries secrets) is imported with `--import-realm` when the realm doesn't exist yet.
An existing realm is left as it is (see [Production](#production)).

## Flows

**Web** — «دخول» on `/login` → `GET /api/auth/oidc/login?return_to=&locale=` (state, nonce and the
PKCE verifier in a short-lived signed cookie, `qbasair_oidc`) → Keycloak's page → `GET
/api/auth/oidc/callback` checks the state, exchanges the code with the verifier, checks the ID
token (signature against the realm's keys, issuer, audience, expiry, nonce), finds the account (by
`sub`; else links a local account with the same email **only if Keycloak verified it**; else
creates one), mirrors the roles. An account tied to another `sub` moves to this one only when that
identity no longer exists in Keycloak (the service account's lookup answers 404 — the account was
deleted there, or the realm rebuilt, as at every local Keycloak start); while it exists (it may have
changed its email since), the sign-in ends with `email_in_use`. Then it opens our session (cookie) and returns to
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

## Sign-in providers

**Implicit sign-in or sign-up.** «المتابعة عبر Google» (Apple, Meta) is the same button on both tabs and
asks nothing more: Keycloak's «first broker login» runs the realm's own copy, `qb first broker login`
(`scripts/keycloak_realm.py`):

1. *Review profile* — only when the provider left something out (`update.profile.on.first.login:
   missing`; Apple may hide the name).
2. *Create the account* when no account has that email (`idp-create-user-if-unique`).
3. Else **link it and sign in**: `qb-idp-auto-link` (`apps/keycloak-email-code`,
   `VerifiedOwnerAutoLink`) links the provider to the account with the same email — when the provider
   vouches for the email (`trustEmail`, or its `email_verified`) and the reader did not edit it on the
   review page. An account that **never confirmed** that email (someone registered it with a password
   and never typed the code) is not its owner's: the provider proved who owns the address, so the
   account's credentials (its password, any 2FA or passkey) are removed, its email marked verified and
   its `qb-verify-email-code` action dropped before the link — whoever registered it can no longer
   sign in with them.
4. Otherwise (the step declines), Keycloak's own *confirm the link* path still runs: by an email link or
   by the account's password (and its 2FA).

**Linked accounts in settings** — Settings → «الحسابات المرتبطة» (`apps/web/features/identity/
linked-accounts.tsx`, Keycloak mode only) lists the realm's providers and which are linked:

- «اربط» → `GET /api/auth/oidc/link/<alias>`: a code flow with `kc_action=idp_link:<alias>` (Keycloak's
  application-initiated action `idp_link`). Keycloak checks its own session (or asks to sign in),
  asks to confirm (its page `link-idp-action`, in the theme), sends the reader to the provider and back; the
  callback checks the signed-in Keycloak account is this one, keeps our session, and returns to settings
  with `?linked=` or `?link_error=`. A provider account already linked to another account stops on
  Keycloak's error page (nothing changes).
- «افصل» → `POST /api/auth/linked-accounts/<alias>/unlink`, through the service account. An account
  **without a password** (created through a provider) is asked one first (new password + again, 10+
  characters, not the email): it is set — Keycloak's policy applies — before the link is removed, so the
  account can always sign in with its email and that password.

The API contract: `docs/api-contract.md` («Linked sign-in providers»).

**Closed in Keycloak mode** — `POST /api/auth/login`, `/signup`, `/forgot-password`,
`/reset-password` answer `409 {code: "use_identity_provider"}`: passwords never pass through us.

## Theme

Keycloak's pages — sign in, sign up, forgot / update password, email verification, 2FA (TOTP set-up
and code), required actions, errors and info — wear the web's sign-in design: the theme `qbasair`,
built with [Keycloakify](https://www.keycloakify.dev) (11.16, React) in the workspace package
`apps/keycloak-theme` and loaded by Keycloak as a JAR in `providers/`.

**Reused from `apps/web`, never copied by hand:**

- *Design* — `src/login/theme.css` imports the web's `tokens.css`, `tokens-motion.css`,
  `motion.css`, `web-design.css` and the sign-in page's `auth.css` / `auth.web.css`; the page
  carries the web's `qb-web` root class and the sign-in card's classes (`qb-auth-card`,
  `qb-auth-input`, `qb-auth-cta`, …). Keycloak's own classes map onto them in `src/login/classes.ts`
  (no PatternFly). The rosette (`components/girih`) and the seal (`brand-glyph.generated`) are the
  web's components; the self-hosted fonts come from `apps/web/public/fonts`.
- *Languages* — the realm offers every web interface language (`scripts/keycloak_realm.py`
  `LOCALES`, checked against `apps/web/lib/i18n/locales.ts` by the theme's tests); each page takes
  its direction from the web's list (Arabic, Persian, Urdu right to left; Keycloakify alone would
  turn Azerbaijani right to left too) and the language picker shows the web's native names in the
  web's order.
- *Words* — where the web already says it (the wordmark, «دخول», «حساب جديد», «نسيتها؟», «تصفّح كضيف
  ←», field labels…), the theme uses the web's string in every locale:
  `src/login/i18n/web-strings.json` maps a Keycloak message key to the web's Arabic id, and
  `scripts/web-messages.mjs` writes each locale's text (the web's fallback: the locale, then
  English) into `src/login/i18n.ts` (`pnpm --filter @q-basair/keycloak-theme messages`; the build
  runs it, and a test fails when it is stale). Keycloak messages the web has no words for but
  that Keycloak leaves in English in some languages (the resend cooldown,
  `emailVerifySendCooldown`) are written per language in `src/login/i18n/own-messages.json`,
  which the same script merges (every language required). Everything else is Keycloak's own
  translation. Messages are shown with `dir="auto"`, so a Latin-only one is never reordered.
  Keycloak ships no messages for 11 web languages (az, uz, bs, sq, ur, id, ms, bn, hi, ko, sw):
  `src/login/i18n/<tag>.ts` carries a **machine draft** of the ~125 keys the pages use (the rest
  falls back to English) — **awaiting native review**, like the web's own drafts.

**One account page.** Sign-in (`login.ftl`) and sign-up (`register.ftl`) read as one page: both
open on «حسابك في بصائر القرآن», the «دخول | حساب جديد» tabs, the identity-provider buttons
(Apple, Google, Meta, in that order; each only when the realm has the provider — a provider signs
in and creates the account alike), then «أو بالبريد الإلكتروني» above the tab's email form
(`pages/AccountChoice.tsx`, `pages/Login.tsx`, `pages/Register.tsx`). A tab switches **in place**,
without a page load (`inPlace.ts`): the other tab's page is fetched in the background — Keycloak
still renders it, so its form carries Keycloak's fresh action address — and only its context is
drawn (`main.tsx`), its address recorded in the history (Back and Forward switch the same way);
anything unexpected falls back to an ordinary page load. Keycloakify's once-only script hooks
reload the page when their component mounts again, so the frame adds Keycloak's page scripts
itself (`useKeycloakScripts.ts`) and the passkey scripts mount only when the realm offers passkeys. Without providers the page is email only;
without registration, there are no tabs. Sign-up asks the email, the password, the name, then the
code. The web's `/login` sends the reader straight there (to the sign-up tab for
`/login?tab=signup`); its own card shows only when Keycloak sends the reader back with an error.

Pages Keycloakify draws itself (everything but the account page, the email code and the frame)
keep their structure and take the design through the class map; the email code has its own page
(`pages/LoginEmailCode.tsx`, see [Email code](#email-code)).

Non-Latin scripts other than Arabic (Bengali, Devanagari, Korean, Chinese…) use the system's fonts,
as on the web.

**Mails** (the email code, password reset, required actions, security notices) use the same
theme's email type: `src/email/html/template.ftl` frames each message in the web's dark
palette — the gold wordmark, one card, the link drawn as the gold button — right to left when the
mail's language is (Keycloak's `ltr` flag). The code mail is ours, words included (every
language, see [Email code](#email-code)); for Keycloak's mails only the frame is ours: the texts
are Keycloak's translations, which exist for 16 of the 24 interface languages; mails in uz, bs,
sq, ur, ms, bn, hi and sw fall back to English. Mail clients load no web fonts and little CSS, so the frame is tables
and inline styles; the plain-text part is Keycloak's.

```bash
pnpm --filter @q-basair/keycloak-theme dev        # Vite preview with mock data:
#   http://localhost:5173/?page=register.ftl&locale=fr&social   (any page id, any locale, providers on)
pnpm --filter @q-basair/keycloak-theme test       # languages, directions, web strings, drafts, class map
pnpm --filter @q-basair/keycloak-theme build:jar  # → apps/keycloak-theme/dist_keycloak/qbasair-keycloak-theme.jar
```

`build:jar` needs Java 21 and Maven (`mvn` on `PATH`). `scripts/keycloak_dev.sh` copies the JAR
into Keycloak's `providers/` when it exists and starts Keycloak with theme caching off
(`--spi-theme--cache-themes=false --spi-theme--cache-templates=false
--spi-theme--static-max-age=-1`); a rebuilt JAR needs a Keycloak restart. To open a page by hand,
the `qbasair-web` client requires PKCE: add `&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256`
to `…/realms/qbasair/protocol/openid-connect/auth?client_id=qbasair-web&response_type=code&scope=openid&redirect_uri=…`
(append `&ui_locales=en` or use the picker for another language).

## Email code

Keycloak 26 verifies an email only by a link (`VERIFY_EMAIL`), and its OTP form is TOTP. The
address is verified instead by a **6-digit code**, mailed and typed on the sign-in pages: the
required action `qb-verify-email-code`, a Keycloak extension in `apps/keycloak-email-code` (Java 21,
Maven, Keycloak's SPI pinned to the server's version), loaded from `providers/` beside the theme.

- **When** — any account whose email is not verified yet, at its next sign-in step: right after
  sign-up, after an email change, or for a provider that does not vouch for it (Apple, Google and
  Meta do: `trustEmail`). The API's contract is unchanged: it still links accounts only on
  Keycloak's `email_verified`.
- **The code** — six random digits (`SecureRandom`, leading zeros kept), kept only in the sign-in's
  authentication session as a salted SHA-256 hash, compared in constant time, good for the address
  it went to. Valid **10 minutes**; **5** wrong tries spend it and a new one is mailed; a new code
  at most **once a minute** and **5 times** per sign-in (then: back to sign-in). Latin,
  Arabic-Indic (٠١٢…) and Persian (۰۱۲…) digits all count; spaces, dashes and direction marks are
  ignored. Keycloak's events: `SEND_VERIFY_EMAIL`, `VERIFY_EMAIL`, `VERIFY_EMAIL_ERROR`
  (`invalid_code`).
- **The page** — `login-email-code.ftl` (`src/login/pages/LoginEmailCode.tsx`): the address, one
  code field (`one-time-code`, left to right), «تابع», the resend counting down the server's wait,
  and the way back to sign-in. Its words: `src/login/i18n/own-messages.json` (every language).
- **The mail** — `src/email/{html,text}/qb-email-code.ftl` in the theme's frame: the code large,
  spaced, left to right in every language. Its words: `src/email-messages.json`, written into
  `src/email/messages/` by `scripts/email-messages.mjs` (the theme's build runs it; a test fails
  when they are stale).
- **Sending** — Keycloak's own mail sender, the realm's SMTP (`KC_SMTP_*`): the domain's own
  mail at **Infomaniak** (where basairquran.com is registered and its DNS and mail live), from the
  address `noreply@basairquran.com` (an alias of the mailbox `contact@basairquran.com`, which signs in to the server), shown as «بصائر القرآن», on `mail.infomaniak.com:587` with
  STARTTLS. The domain's records already allow only Infomaniak to send for it
  (`v=spf1 include:spf.infomaniak.ch -all`, DMARC `p=reject`): another sender — a transactional
  service once volume outgrows a mailbox's sending limit — needs its own SPF and DKIM records in
  the zone first, or its mails are refused.

```text
KC_SMTP_HOST=mail.infomaniak.com
KC_SMTP_PORT=587
KC_SMTP_USER=contact@basairquran.com
KC_SMTP_PASSWORD=<the mailbox's password, or an application password>
KC_SMTP_FROM=noreply@basairquran.com
```

```bash
cd apps/keycloak-email-code && mvn -q package   # → target/qbasair-keycloak-email-code.jar (unit tests included)
```

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
pnpm --filter @q-basair/keycloak-theme build:jar   # once, and after theme changes (see Theme)
scripts/keycloak_dev.sh      # Keycloak 26.8.2 from Maven Central on http://127.0.0.1:8080, realm imported
```

The script needs Java 21 (`JAVA_HOME`) and Python (`python3`, else `python`).

Accounts: `admin@basair.test`, `moderator@basair.test`, `member@basair.test`, password
`Basair-dev-1` (Keycloak's own console: `admin` / `admin`). Start the API as the script's header
shows and the web with `NEXT_PUBLIC_AUTH_ENABLED=1`. A realm change needs a fresh import: stop
Keycloak, delete `.runtime/keycloak-<version>/data/h2`, start again.

**Mail, locally** — to sign up (email verification) or reset a password without a mail provider,
catch Keycloak's mails:

```bash
python scripts/dev_mail.py   # SMTP 127.0.0.1:1025, caught mails on http://127.0.0.1:8025 (.runtime/mail/)
KC_SMTP_HOST=127.0.0.1 KC_SMTP_PORT=1025 KC_SMTP_STARTTLS=false scripts/keycloak_dev.sh   # fresh realm import
```

Open the mail on :8025: type the sign-up's code on the page, or follow a reset link in the same browser. Use one host name for the web
throughout (`QBASAIR_PUBLIC_URL` and the address in the browser, e.g. both `localhost` or both
`127.0.0.1`): the sign-in state cookie is set on the address that starts the sign-in.

**Local secrets** — to send real mail or try a sign-in provider locally, put `KEY=value` lines
(`KC_SMTP_*`, `KC_GOOGLE_*`, `KC_FACEBOOK_*`, `KC_APPLE_*`) in `.runtime/keycloak.env`
(git-ignored); `scripts/keycloak_dev.sh` reads it literally (no shell expansion) before rendering
the realm. The Apple `.p8` key goes on one line, its line breaks written `\n`. A provider's
redirect address is `<Keycloak>/realms/qbasair/broker/<google|facebook|apple>/endpoint` (locally
`http://127.0.0.1:8080/…`; Apple accepts only the HTTPS `auth.basairquran.com`).

## Tests

`tests/test_oidc.py` runs every flow against a stand-in Keycloak with real RSA keys: the code flow
and PKCE, forged state, replay, wrong nonce, open redirects, cancellation, linking only by a
verified email, closed password routes, sign-out, the app's Bearer tokens (wrong audience,
expired, foreign key), account deletion, the moderator role with 2FA, linked providers (listing,
linking and its outcomes, unlinking with the password step), and the realm rendering (the provider
flow included). `apps/keycloak-email-code` tests `VerifiedOwnerAutoLink`'s decision.

Checked by hand against Keycloak 26.8.2 with a stand-in OpenID provider (a second realm): a new email
creates the account; a confirmed one is linked and keeps its password; an unconfirmed one is linked and
loses its password; linking from settings (confirmed or cancelled), a provider account owned by
another account (Keycloak's error page, nothing changes), and unlinking with and without a password
(a short one refused by the policy, the new one then signs in).

## Production

The server steps (DNS, settings, certificate, admin console, first administrator, backups) are in
`docs/deployment.md` → "Keycloak". What the stack does:

| Piece | Where |
|---|---|
| Image | `Dockerfile.keycloak` → `ghcr.io/ghost0n/basair-quran-keycloak:<commit>`, built and Trivy-scanned with the API and web images. Keycloak 26.8.2 with both JARs in `providers/` (`apps/keycloak-theme` built with Keycloakify, `apps/keycloak-email-code` with Maven), `kc.sh build` for PostgreSQL with health checks; runs as uid 1000, `start --optimized --import-realm` |
| Services | Compose profile `keycloak` (`COMPOSE_PROFILES=keycloak` in `.env.production`): `keycloak` and `keycloak-db` (PostgreSQL 17, volume `keycloak-db`, network `auth`). Healthy once `/health/ready` on the management port (9000) answers 200 |
| Addresses | public `https://<QBASAIR_AUTH_DOMAIN>` (`KC_HOSTNAME`, `KC_PROXY_HEADERS=xforwarded` behind nginx); the API's back channel `QBASAIR_OIDC_INTERNAL_URL=http://keycloak:8080`; the admin console on the server's loopback `127.0.0.1:8180` (`KC_HOSTNAME_ADMIN=http://localhost:8180`), reached through an SSH tunnel |
| nginx | `deploy/nginx/keycloak-{http,tls}.conf.template`, rendered by `start-nginx.sh` when `QBASAIR_AUTH_DOMAIN` is set: its own rate limits, larger proxy buffers (Keycloak's cookies), `/admin` and `/realms/master` answered 404. Keycloak is resolved at request time, so nginx starts while it is down |
| Realm | each deploy renders `keycloak/import/qbasair-realm.json` (mode 600) with the release's `scripts/keycloak_realm.py` (service `keycloak-realm`, profile `keycloak-jobs`, no network); Keycloak imports it on its first start only |
| Admin console address | once, after the first healthy start, `deploy.sh` sets the `master` realm's `frontendUrl` to `KC_HOSTNAME_ADMIN` with `kcadm.sh` (marker `.deploy/keycloak-console`): the console's checks otherwise call the public host, where `/realms/master` is closed |
| Certificate | `tls.sh issue` / `renew` add a separate certificate for the auth domain |
| Backups | `backup.sh` adds `pg_dump --format=custom` of the database (`keycloak.dump`) |
| Checks | `deploy.sh` refuses to start when the profile is on and `QBASAIR_AUTH_DOMAIN`, `QBASAIR_PUBLIC_URL`, `QBASAIR_OIDC_CLIENT_SECRET`, `KC_DB_PASSWORD` or `KC_BOOTSTRAP_ADMIN_PASSWORD` is empty; CI builds and scans the image, tests the nginx configurations with the auth domain, and validates the profiles |

**Realm changes after the first start.** `--import-realm` skips a realm that exists, so a change to
`keycloak_realm.py` or to the `KC_*` values reaches production only through the admin console
(or by deleting the realm, which deletes its accounts). Applying the file on every deploy
(keycloak-config-cli) is a follow-up.

**Not in the image yet**: Sign in with Apple (its community provider extension).

## Next (platform)

- keycloak-config-cli in the deploy, so realm changes apply on every release.
- Sign in with Apple: the pinned community provider extension in the image.
- Native review of the 11 drafted sign-in languages, and mail texts for the 8 that fall back to
  English.
- The app: native provider buttons + token exchange, the email page in a system sheet (step 5).
- After the cut-over: remove the local password routes and `auth_service`'s password code.
