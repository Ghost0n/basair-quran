# Production platform plan

Status: **agreed design, partly implemented.** The hosting part is in place
(2026-11): one Contabo VPS, images built and scanned in GitHub Actions and
pushed to GHCR, deployed over SSH, Cloudflare-ready — `docs/deployment.md`.
Still to build: PostgreSQL, Keycloak in production, Caddy's zero-downtime
switch, Valkey, the R2 backups, and the staging server.

Goal: the whole app (web, API, the iPhone/Android app's server side) on a new,
self-managed server, with production-grade accounts (Apple, Google, Meta, email)
and a database designed for real traffic, sized small at launch and able to
grow without a redesign.

## Decisions

| Topic | Decision |
|---|---|
| Hosting | **Contabo**, self-managed: Cloud VPS 30 (8 vCPU, 24 GB, 200 GB NVMe) for production, Cloud VPS 10 for staging. ≈ $17–20/month together. |
| Edge | **Cloudflare** in front (DNS, CDN, DDoS, TLS). The origin only accepts Cloudflare's addresses. Main region Europe; users worldwide are served from Cloudflare's edge for cacheable content. |
| Deploys | **GitHub Actions**: tests → images → staging → production, health-gated, one-command rollback. |
| Runtime | **Docker Compose** on each server (zero-downtime switch behind Caddy after the new version's health check). Kept Kubernetes-ready; moves to **k3s + CloudNativePG** when we go multi-server. |
| Identity | **Keycloak** (self-hosted, version pinned). Owns credentials, social links, email verification, password reset, brute-force protection, 2FA. |
| Sign-in methods | Apple, Google, Meta (Facebook), email + password with verified email. |
| App sign-in | **Native** Apple / Google / Meta buttons (provider SDK → token exchange with Keycloak, a preview feature: pinned and covered by tests). Email/password in our themed Keycloak page in a secure system sheet. |
| Web session | Backend-for-frontend: tokens stay on the server, the browser only holds an httpOnly session cookie. |
| App session | Refresh token in the Keychain / Android Keystore. |
| Account linking | Same email as an existing account → link **after the user confirms** (signs in once with the existing method or an emailed code). |
| 2FA | Optional for users (authenticator app or passkey), **required for admins and moderators**. |
| Database | **PostgreSQL 17** on the VPS (own container): databases `app` and `keycloak`. |
| Reference data | Quran text, morphology, mushaf layout, translations, research index stay **read-only SQLite files** shipped with each release (regenerated, never user data). |
| Cache / limits | **Redis** (Valkey) on the VPS: shared cache, rate limits, quota counters. Not a source of truth. |
| Backups | Continuous WAL archiving + nightly base backups to **Cloudflare R2** (point-in-time restore over 30 days), restore tested automatically every night. |
| Email | The domain's **Infomaniak** mail (owner's pro mail service): sign-up codes and Keycloak's mails sent as `noreply@basairquran.com` (an alias of the contact mailbox) over SMTP (`mail.infomaniak.com:587`, STARTTLS); the main contact address **contact@basairquran.com** (shown on the landing page) is an Infomaniak mailbox. SPF allows Infomaniak only and DMARC is `p=reject`: a transactional service, if volume outgrows a mailbox's sending limit, needs its SPF/DKIM records added first. No self-hosted mail server. |
| Guests (web) | Data kept **on the device** (browser storage, like the app's local store) and uploaded to the account at sign-up. Nothing stored server-side for anonymous visitors. |
| Old data | **Start fresh**: no migration from the old server. |
| AI («الدراسة») | Users connect their **own provider** (sign-in button where the provider offers one, otherwise API key with a step-by-step guide). Without a provider, signed-in users get a small **demo allowance** on our Ollama key (e.g. 2 questions per rolling 5 hours). The current "paste an Ollama key" setting is removed. |
| Developer accounts | Apple Developer, Google Cloud, Meta for Developers, Google Play Console: created by the owner at the **last step**. |
| Domain | **basairquran.com**, registered at **Infomaniak**; DNS and mail there today (`ns11`/`ns12.infomaniak.ch`). Moving the DNS to Cloudflare for the edge must carry the MX, SPF, DKIM and DMARC records over unchanged. |

## Architecture

```text
            Users (web, iPhone, Android)
                       │
                 Cloudflare (DNS · CDN · WAF · TLS)
                       │  only Cloudflare IPs reach the origin
        ┌──────────────┴──────────────── Contabo VPS 30 ────────────┐
        │  Caddy (reverse proxy, origin TLS)                         │
        │    ├── web       Next.js (SSR, /api proxy)                 │
        │    ├── api       FastAPI (+ read-only SQLite Quran data)   │
        │    └── auth      Keycloak (themed login, realm as code)    │
        │  postgres 17  ── databases: app, keycloak                  │
        │  valkey       ── cache, rate limits, AI quota counters     │
        │  backup       ── WAL-G → Cloudflare R2                     │
        └────────────────────────────────────────────────────────────┘
   Outbound: Infomaniak SMTP (email) · AI providers (user's own / our demo Ollama)
```

Hostnames: `<domain>` (web), `auth.<domain>` (Keycloak), `staging.<domain>`,
`auth.staging.<domain>`.

Growth path, in order, each without a redesign: a bigger VPS → PostgreSQL on
its own server (or a managed database) → a second app server behind
Cloudflare load balancing (the app keeps no state on disk) → PgBouncer.

### Why Compose, not Kubernetes, at launch

On one server Kubernetes adds no resilience (the node is the single point of
failure either way) but adds memory (~0.5–1 GB even for k3s) and many moving
parts (ingress, certificates, volumes, a PostgreSQL operator). Compose gives
what one server needs: health-checked containers with restart policies,
zero-downtime updates (start the new container, wait for `/ready`, switch
Caddy's upstream, stop the old one; a failed check keeps the old one), pinned
image tags and one-command rollback, the same file in CI, staging and locally.

Rules that keep the move to k3s a small step: stateless app containers,
configuration only through environment variables, images in GHCR,
`/health` and `/ready` on every service, no host paths except the database
volume. Switch when we need two or more app servers or zero downtime through
a server failure: k3s, with CloudNativePG for PostgreSQL failover and its
native backups to R2.

## Database (`app`)

- `users`: `id` (UUID, Keycloak `sub`), display name, avatar, locale,
  onboarding state, roles mirror, `created_at`, `deleted_at`.
- `user_preferences` (JSONB, validated by the API models), `notebook_items`,
  `themes`, `saved_pages`, `followed_roots`, `research_sessions` +
  `research_messages`, `research_documents`.
- Community: `posts`, `comments`, `reactions`, `reports`, `moderation_actions`.
- AI: `ai_connections` (provider, model, encrypted secret, last 4 chars,
  status), `ai_usage` (one row per study question: user, provider, tokens,
  outcome).
- `audit_log`: sign-ins, links, deletions, exports, admin actions.
- Designed now for the product features below (built later, no structural
  migration then): `user_trust` (unverified / verified / suspicious /
  banned from posting, declined-check count), roles mirrored from Keycloak
  (`admin`, `moderator`), `moderation_checks` (one row per agent or human
  check of a post or comment: verdict, reasons, model, guidelines version),
  `moderation_queue` (human approvals, declined checks, suspicious users),
  `notifications` + `push_devices`, `feedback_tickets` (class, status,
  attachments, linked error report).
- Every user-owned row: `user_id` (indexed, cascade on account deletion),
  `created_at`, `updated_at`, `deleted_at` (soft delete for the app's sync,
  purged after 30 days).
- Migrations with **Alembic**, applied by the deploy before the new version
  starts; CI runs them against a real PostgreSQL.
- Access: SQLAlchemy 2 (async) + asyncpg with a bounded pool; per-request
  scoping to the signed-in user.
- Account deletion removes the user's rows and their Keycloak account;
  «تنزيل بياناتي» exports everything they own as JSON.

## Identity flows

- **Web**: «دخول» → our backend starts the OpenID Connect code flow (PKCE) →
  Keycloak page (Apple / Google / Meta / email) → back to our backend, which
  stores the tokens server-side (Redis) and sets the session cookie. The API
  checks the session; Keycloak sessions and ours end together on sign-out.
- **App**: native Apple / Google / Meta SDK → ID / access token → token
  exchange at Keycloak → our tokens (refresh token in secure storage). Email:
  the themed Keycloak page in a system sheet (ASWebAuthenticationSession /
  Custom Tabs). The API validates Keycloak access tokens (JWKS, audience,
  expiry).
- **Keycloak setup as code**: realm, clients, identity providers, flows
  (first-broker-login with confirmation, required 2FA for admin roles), email
  templates, password policy, brute-force detection, exported to the repo
  and applied by the deploy (keycloak-config-cli).
- **Theme**: Arabic first, right-to-left, the app's glass design, every
  interface language (Keycloakify).
- **Apple specifics**: Sign in with Apple through the community identity
  provider extension (pinned); private-relay emails: our sending domain
  registered with Apple.
- **Meta**: app review and business verification before public launch.

## AI connectors

- Provider registry (code + docs): OpenRouter (sign-in button), Hugging Face
  (sign-in button, to confirm), OpenAI, Anthropic, Google Gemini, Mistral,
  DeepSeek, Groq, xAI, Ollama (cloud key or own server), any OpenAI-compatible
  endpoint. Each: curated tested models (structured JSON output), a default,
  a «اختبار الاتصال» test, an illustrated guide in every interface language.
  Which providers offer a sign-in flow is re-checked against their current
  docs at implementation time.
- Secrets encrypted at rest (AES-256-GCM, master key from the server's
  environment, rotatable), write-only from the UI (last 4 characters shown).
- Routing: a connected provider is always used; without one, a signed-in
  user's question uses the demo allowance (rolling window per user, plus a
  global daily ceiling); visitors who aren't signed in get no AI.
- The research agent answers from the Quran alone whatever the provider (no corpus, no
  interpretive mode).
- Built ahead of the platform (Q-Basair-72, `docs/ai-connections.md`): the registry, keys and
  OpenRouter's sign-in on the reader's device, Settings → «الذكاء الاصطناعي»; server-side
  encrypted keys and the demo allowance wait for accounts.

## Operations

- Provisioning script in the repo (fresh Ubuntu LTS → hardened host: SSH keys
  only, firewall allowing Cloudflare only, unattended security upgrades,
  fail2ban, Docker), so a lost server is rebuilt in under an hour.
- Monitoring: external uptime checks every minute (free tier), Sentry for
  errors (already scaffolded, `docs/error-reporting.md`), container health
  checks, disk / backup-age alerts.
- Secrets: never in the repo; GitHub environment secrets for deploys, a root-
  only env file on each server.
- Legal: privacy policy, terms, account-deletion page (App Store requirement),
  data export.

## Product features (after or beside the platform)

| Feature | Depends on the platform | Place |
|---|---|---|
| Community moderation: agent batches every 15 minutes on posts and comments, human gate, trust levels, posting bans | Yes (roles, PostgreSQL, worker) | Designed: `docs/community-moderation-design.md`; built after step 4 |
| Admin and moderator account types + supervision panel (approvals, suspicious users, feedback) | Yes | After step 4 |
| Feedback center: contact, bug report, help, feature idea, error reports, classed and reviewed in the panel | Yes | After step 4, with the panel |
| Notifications for likes and comments (in-app; phone push later) | Yes; push needs the developer accounts | In-app after step 4, push at step 9 |
| Lock-screen player with logo, Dynamic Island, Android media notification | No | Before the platform |
| Offline recitation downloads per reciter (iPhone / Android only) | No (per-surah download exists in the app's settings) | Before the platform |
| Landing page (goals, features, technical highlights, privacy, community guidelines) in the app's design language | No (final URLs need the domain) | Before the platform |
| Search engine visibility: public pages for surahs, verses and posts, metadata, sitemap | Partly (domain) | Groundwork before, finished with the domain |
| Sharing a research to Instagram / Facebook: a share image, and the **post's public link** that shows a rich preview card (Open Graph) and opens the app when installed (universal / app links) | The link and app opening need the domain and app link verification | Image before, links after the domain |

There is no referral program: the shared link is simply the post's own
public address, clickable like a Facebook post.

Order agreed: moderation brainstorm → quick wins (player, downloads, landing,
SEO groundwork, share image) → platform steps 1–4 → moderation, panel,
feedback center → notifications, share links, push.
The background jobs (moderation batches every 15 minutes) run in a `worker` container
added to the Compose stack.

## Build order

1. **Foundations**: domain + Cloudflare; provisioning script; Compose stack
   (Caddy, web, api, postgres, valkey, keycloak, backup); staging server.
2. **Database**: PostgreSQL schema + Alembic; port `app_data_service`,
   `community_service`, `research_document_service` from SQLite; tests on
   PostgreSQL in CI.
3. **Keycloak**: realm as code, email via the Infomaniak mailbox, policies, 2FA, linking
   flow; theme.
4. **Auth integration**: web BFF flow, API token validation, removal of the
   old password auth (`auth_service.py`, `routes/auth.py`), deletion + export.

   Steps 3–4 are built locally behind `QBASAIR_AUTH_PROVIDER=keycloak`
   (`docs/keycloak.md`, 2026-11-07): realm as code, code flow + PKCE, Bearer
   tokens for the app, roles mirrored, moderator 2FA, account deletion. The
   Keycloakify theme is built too — sign-in pages and mails
   (`apps/keycloak-theme`, Q-Basair-61, 2026-11-08). Left for the platform:
   Keycloak in the stack (with the theme JAR), keycloak-config-cli, the Infomaniak
   mailbox, and removing the password routes after the cut-over.
5. **Clients**: sign-in screens, Capacitor native sign-in + token exchange,
   secure token storage; web guest storage on the device + upload at sign-up.
6. **AI connectors**: registry, encrypted secrets, sign-in buttons, guides,
   demo allowance, removal of the old key setting.
7. **CI/CD**: images to GHCR, staging deploy on `develop`, production on
   `main`, migrations gate, health check, rollback.
8. **Operations**: backups + nightly restore test, monitoring, runbook.
9. **Accounts & stores (last)**: Apple / Google / Meta / Play developer
   accounts, provider registrations against the real domain, Meta review,
   App Store / Play listings.

Each step lands with its tests and docs (`docs/api-contract.md`, README,
shared types) as the repository rules require.
