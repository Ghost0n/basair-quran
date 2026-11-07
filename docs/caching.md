# Caching

Many readers ask for the same things: the same mushaf pages, glyph layouts,
surah lists, searches, translations and recitation timings. Anything that is the
same for everyone is computed **once** and served from a shared copy, so the
API and SQLite only see the first request. Anything that depends on who is
asking is never shared.

## The layers

| Layer | What it holds | Who shares it | Invalidation |
|---|---|---|---|
| **Browser HTTP cache** | Any response the API marks `public` | One user | `max-age` / `immutable` |
| **nginx edge cache** (`deploy/nginx`) | The same responses, one copy for every user | All users | `max-age`; purged after `[rebuild-db]` |
| **Shared server cache** (`data/cache.db`) | Derived data that is expensive to compute and identical for all (verse audio durations) | All users | Never changes (safe to delete: refills on demand) |
| **In-process indexes** (`quran_service`) | Search / suggestion / layout indexes (LRU `OrderedDict`s) | One API process | Reset when the DB is reopened |
| **In-flight GET sharing** (`packages/api-client`) | Identical GETs made at the same moment | One page | Dropped as soon as the request settles |

### Rules

1. A route that is a pure function of generated data (`quran.db`,
   `translations.db`, the reciter catalogue) gets a `Cache-Control` from
   `src/app/core/http_cache.py` (or sets its own, see below). The edge cache
   only stores responses with an explicit lifetime.
2. A route that depends on the user (preferences, notebook, themes, sessions,
   documents, roots, the community feed's "liked by me", auth) never sends
   `public` — `tests/test_http_cache.py` checks the main ones. nginx never stores
   a response that sets a cookie.
3. Data that is expensive, deterministic and the same for everyone is computed
   on the server once, stored in `data/cache.db` and served as `immutable` once
   complete — not recomputed per user or per device. A request never waits on
   a slow upstream: it returns what is known and starts one background job
   (see `recitation_cache_service`).

## Edge cache (nginx)

`proxy_cache_path … keys_zone=qbasair_api:16m max_size=1g inactive=7d` in
`deploy/nginx/nginx.conf`; used by `location /api/` in both site templates.

- **Key** `$scheme$host$request_uri` — cookies are not part of it, which is why
  rule 2 matters.
- **`proxy_cache_lock`** — concurrent misses for the same URL wait for one
  upstream fetch: a popular page opened by hundreds of readers at once reaches
  the API once.
- **`proxy_cache_use_stale updating error timeout http_5xx` +
  `proxy_cache_background_update`** — an expired entry keeps being served while
  one background refresh runs, and while the API is briefly down.
- **Bypassed for `/api/offline/*`** — the packs are already files on disk and
  tens of MB; caching them again would evict the small hot responses.
- **`X-Cache-Status`** response header: `HIT`, `MISS`, `EXPIRED`, `STALE`,
  `UPDATING` (set at server level so the security headers are kept).
- **Purge**: `deploy.yml` empties `/var/cache/nginx/qbasair` after a
  `[rebuild-db]`. Translations rebuild in the background; their responses live
  5 min / 1 h and refresh on their own.
- **CI**: the `nginx` job renders both templates and runs `nginx -t` in the
  production image, so a broken config fails the PR instead of the deploy.

## Endpoint policies

| Endpoint | Cache-Control | Why |
|---|---|---|
| `/api/quran-page`, `/api/mushaf-page-layout`, `/api/ayah-reader[-more]`, `/api/morphology`, `/api/surahs`, `/api/mushafs`, `/api/reciters`, `/api/root-distribution` | `public, max-age=3600, stale-while-revalidate=86400` | Pure functions of `quran.db` |
| `/api/search`, `/api/search-v2`, `/api/search-result-page`, `/api/suggest`, `/api/text-count` | `public, max-age=600, stale-while-revalidate=3600` | Deterministic; shorter in case ranking ships without a DB rebuild |
| `/api/translations` / `/api/translations/ayahs` | `public, max-age=300` / `3600` (route) | Pure functions of `translations.db` |
| `/api/reciters/{id}/durations/{surah}` | `public, max-age=31536000, immutable` once complete, `no-store` while filling (route) | Measured once in `data/cache.db`; never changes |
| `/api/community/tags` | `public, max-age=60, stale-while-revalidate=300` | Same for everyone |
| `/api/offline/{name}` | `public, max-age=86400` (`manifest.json`: `no-cache`) (route) | Static files; not edge-cached |
| Everything per-user or a write | none | Rule 2 |

## Audit — 2026-09

Measured on a reader load: 14 API requests, 10 already answered by the
browser cache.

Changed:

- **No shared cache existed**: every user's identical request reached FastAPI
  and SQLite. → nginx edge cache with request collapsing and stale serving.
- **Recitation timings** were measured by every player (hundreds of audio
  headers per surah, per user, per visit). → measured once on the server,
  shared, immutable (`/api/reciters/{id}/durations/{surah}`).
- **Duplicate concurrent GETs** on one page (`surahs` from the reader and the
  recitation bar; `notebook` from Home and the saved-verse store). → shared
  while in flight by the API client (each caller still gets its own copy).
- **`/api/community/tags`** was uncached though identical for everyone. → a
  one-minute shared lifetime.
- **A `[rebuild-db]`** would have left up to an hour of old responses at the
  edge. → purged by the deploy.

Checked and left as is:

- Per-user routes (preferences, notebook, themes, sessions, documents, roots,
  community feed / mine) stay uncached by design.
- `POST /api/suggest-batch` cannot be HTTP-cached; the web app does not call it.
- `/_next/static/*` and the glyph fonts are already `immutable` for a year.
- The second `user/preferences` request on a reader load is the reading
  position being saved (a write), not a duplicate read.

Follow-ups (done):

- **Recitation cache pre-fill** — `scripts/prefill_recitation_cache.py`
  measures every reciter × surah into `data/cache.db` (resumable: stored verses
  are skipped; `--status` reports coverage without network; `--reciters`,
  `--surahs` narrow it). The deploy runs it detached on the first deploy (no
  `cache.db` yet) or when the commit carries `[prefill-recitation]`. A full run
  is 8 reciters × 6,236 verses ≈ 50k range requests of 16 KB, about half an
  hour.
- **CDN readiness** — see below.

## Putting a CDN in front

The API already sends the right `Cache-Control` headers, so a CDN caches the
same responses nearer each reader without code changes. Two things must be in
place first:

1. **The visitor's real IP.** Behind a CDN every request reaches nginx from the
   CDN's addresses: the per-IP rate limits (`limit_req`, `limit_conn`) would
   throttle all readers together. Set, in `/srv/q-basair/.env.production`:

   ```text
   QBASAIR_CDN_TRUSTED_RANGES=<the CDN's published IPv4 and IPv6 ranges, comma-separated>
   QBASAIR_CDN_REAL_IP_HEADER=<its visitor-IP header, e.g. CF-Connecting-IP>
   ```

   `start-nginx.sh` then writes `conf.d/00-realip.conf` (`set_real_ip_from` per
   range, `real_ip_header`, `real_ip_recursive on`): the header is trusted only
   from those addresses. Leave both empty without a CDN (the default). The CI
   `nginx` job validates this variant too.
2. **The CDN caches JSON.** Most CDNs cache only static file extensions by
   default. Add a rule for `/api/*` that caches and **respects the origin's
   `Cache-Control`** (never "cache everything regardless": per-user routes send
   no cache header and must pass through). No cookie-based bypass is needed:
   cacheable responses are the same for every reader, signed in or not.

What only the owner can do (accounts and DNS):

- **A domain you control.** The site runs on a `duckdns.org` subdomain; DuckDNS
  does not let its DNS be delegated, which Cloudflare-style CDNs require. Use a
  domain of your own (the app only needs `QBASAIR_PUBLIC_DOMAIN` and the TLS
  certificate for it).
- **Create the CDN account and point the domain at it**, set the two variables
  above, then redeploy. Check `X-Cache-Status` (nginx) and the CDN's own
  cache header on `/api/surahs`.
- **Keep the ranges current.** CDN address ranges change occasionally; update
  `QBASAIR_CDN_TRUSTED_RANGES` when the provider publishes new ones.
