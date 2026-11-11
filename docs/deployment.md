# Deployment (Contabo VPS)

Q-Basair runs in production on **one Contabo VPS** with Docker Compose, at
**https://basairquran.com**. GitHub builds and scans the images and deploys them
over SSH; the server only pulls images and runs them. This guide goes from a
fresh server to a running, backed-up site, then covers daily operations.

Contents:
[Overview](#overview) ·
[What you need](#what-you-need) ·
[1. Prepare the server](#1-prepare-the-server) ·
[2. DNS](#2-dns) ·
[3. GitHub settings](#3-github-settings) ·
[4. Production settings](#4-production-settings) ·
[5. First deploy](#5-first-deploy) ·
[6. HTTPS](#6-https) ·
[Releasing](#releasing) ·
[Deploy tags (data jobs)](#deploy-tags-data-jobs) ·
[Preparing the recitations](#preparing-the-recitations-one-recording-per-surah) ·
[Rollback](#rollback) ·
[Backups](#backups) ·
[Code quality and security scans](#code-quality-and-security-scans) ·
[Cloudflare](#cloudflare) ·
[Operations](#operations) ·
[Troubleshooting](#troubleshooting)

## Overview

```text
 pull request ──► CI (.github/workflows/ci.yml)
                  tests · web + app builds · offline-engine parity · nginx/compose checks
                  Trivy (dependencies, secrets, Dockerfiles) · Sonar (when configured)

 merge to main ──► Release (.github/workflows/release.yml)
                  build api + web images ─► Trivy image scan ─► push to GHCR
                  ─► rsync deploy files ─► ssh: deploy/server/deploy.sh --tag <commit>

 Contabo VPS  /srv/q-basair  (user `deploy`)
   nginx :80/:443 ──► web (Next.js) ──► api (FastAPI) ◄── worker (moderation batches)
     │                                    │
     └─ static: data/recitations          └─ data/: quran.db, translations.db, auth.db,
                                              app_data.db, research_agent.db, cache.db,
                                              offline/, recitations/
```

| Piece | Where |
|---|---|
| Stack | `docker-compose.yml` — `nginx` (the only public entrypoint), `web`, `api`, `worker`, and `certbot` (on demand) |
| Images | `ghcr.io/ghost0n/q-basair-api:<commit>` and `…-web:<commit>` (also `:latest`) |
| nginx | `deploy/nginx/` — HTTP and HTTPS site templates, rate limits, the API cache, security headers |
| Server scripts | `deploy/server/setup.sh` (once), `deploy.sh` (each release, rollback), `tls.sh` (certificate), `backup.sh` (nightly) |
| Settings | `/srv/q-basair/.env.production` on the server (template: `.env.production.example`) |
| Generated data | `/srv/q-basair/data/` — never in git, rebuilt by the deploy's data jobs |

The server keeps **no git checkout**. Each release copies the files the stack
and its data jobs read (the compose file, `deploy/`, `scripts/`, the Quran
source data in `data/`, the interface dictionaries) and pulls the images built
for that commit. Nothing is built on the server.

## What you need

- **A Contabo Cloud VPS** with Ubuntu 24.04. Cloud VPS 20 (6 vCPU, 12 GB RAM,
  200 GB NVMe) is comfortable; Cloud VPS 10 (4 vCPU, 8 GB, 150 GB NVMe) works
  without all recitations prepared. Disk: ~5 GB for the stack and its data,
  plus the prepared recitations (~8 GB for the configured reciters, ~70 GB for
  all of them).
- **The domain** `basairquran.com`, with access to its DNS.
- **GitHub**: admin on the repository (environments, secrets, variables).
- Optional: **Cloudflare** in front ([Cloudflare](#cloudflare)), and
  **SonarQube Cloud** or a **SonarQube** server ([scans](#code-quality-and-security-scans)).

## 1. Prepare the server

Order the VPS with **Ubuntu 24.04** and your SSH key. Then, on your computer:

1. Create the key the release workflow logs in with (no passphrase; it is only
   for deploys):

   ```bash
   ssh-keygen -t ed25519 -N "" -C "github-deploy@basairquran" -f ./basair-deploy
   ```

2. Run the preparation script on the server as root, with that key's public
   half and your own key:

   ```bash
   scp deploy/server/setup.sh root@<server-ip>:
   ssh root@<server-ip> bash setup.sh \
     --ssh-key "$(cat basair-deploy.pub)" \
     --admin-key "$(cat ~/.ssh/id_ed25519.pub)"
   ```

   It updates the system (with automatic security updates and fail2ban),
   installs Docker and the Compose plugin, creates the **`deploy`** user (in the
   `docker` group, key login only), creates `/srv/q-basair`, turns off password
   and root SSH logins, opens only 22/80/443 (ufw), adds a 4 GB swap file, caps
   logs, and installs the cron jobs (certificate renewal 03:17, backup 02:42).
   It is safe to run again. **From now on log in as `deploy`**: root login is off.

3. Record the server's host key for GitHub (it pins it; a changed key stops the
   deploy instead of trusting a stranger):

   ```bash
   ssh-keyscan -t ed25519,rsa <server-ip> > known_hosts.txt
   ```

## 2. DNS

Point the domain at the server:

| Record | Name | Value |
|---|---|---|
| A | `basairquran.com` | the VPS IPv4 |
| AAAA | `basairquran.com` | the VPS IPv6 (Contabo gives one) |
| CNAME (optional) | `www` | `basairquran.com` (then set `QBASAIR_TLS_WWW=1`) |

With Cloudflare, create the same records there ([Cloudflare](#cloudflare)).
Check: `dig +short basairquran.com` returns the server's address.

## 3. GitHub settings

**Settings → Environments → New environment `production`** (add yourself as a
required reviewer if every release should wait for a click). Its secrets:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | the server's IP (or a DNS name that is not proxied by a CDN) |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_PORT` | `22` (or your SSH port) |
| `DEPLOY_SSH_KEY` | the private key `basair-deploy` (whole file) |
| `DEPLOY_KNOWN_HOSTS` | the content of `known_hosts.txt` |

**Settings → Secrets and variables → Actions → Variables** (repository):

| Variable | Value | Used by |
|---|---|---|
| `QBASAIR_PUBLIC_DOMAIN` | `basairquran.com` | release (site URL baked into the web, outside check) |
| `QBASAIR_IMAGE_PREFIX` | `ghcr.io/ghost0n/q-basair` (default) | release |
| `NEXT_PUBLIC_AUTH_ENABLED` | `1` (default) | web image build |
| `NEXT_PUBLIC_ENABLE_YAMLI` | `0` (default) | web image build |
| `QBASAIR_REMOTE_ORIGIN` | `https://basairquran.com` | the iPhone/Android builds (`mobile.yml`): the server the app talks to |
| `QBASAIR_SITE_URL` | `https://basairquran.com` | the app builds |
| `SONAR_*` | see [scans](#code-quality-and-security-scans) | CI |

The images go to GitHub Container Registry as private packages of this
repository; the deploy logs the server in with the run's own short-lived
token, so no registry password is stored on the server.

## 4. Production settings

As `deploy` on the server:

```bash
cd /srv/q-basair
# The template arrives with the first deploy; to prepare it before, copy it from your checkout:
#   scp .env.production.example deploy@<server-ip>:/srv/q-basair/
cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production
```

Fill in at least the values marked `CHANGE`:

- `QBASAIR_SESSION_SECRET` — `openssl rand -hex 48` (the stack refuses to start without it);
- `CERTBOT_EMAIL` — for Let's Encrypt's expiry notices;
- the SMTP settings, for password-reset emails (optional);
- `OLLAMA_API_KEY` — the server's own model for Basair's default AI and community moderation (optional).

The file is the only place for production secrets. It is never committed and
is included in the nightly backup.

## 5. First deploy

On GitHub: **Actions → Release → Run workflow** on `main`, with the data jobs
the first start needs:

- `jobs`: `rebuild-db,rebuild-index` (the Quran database with the Madani page
  layout, and the research index). Add `prepare-recitations` to start
  preparing the recitations as well ([below](#preparing-the-recitations-one-recording-per-surah)).

The run builds and scans both images, pushes them, copies the deploy files to
`/srv/q-basair` and runs `deploy/server/deploy.sh`. It starts the stack, builds
the databases, waits for `/api/ready` to report the commit, then starts in the
background what takes long: `translations.db` and the app's offline packs
(QuranEnc / Tanzil, tens of minutes) and the shared recitation-duration cache.

Until the certificate exists nginx serves plain HTTP, so the run's last step
("Check from outside") may only warn. Next step: HTTPS.

## 6. HTTPS

As `deploy`, once DNS points at the server and the stack is up:

```bash
cd /srv/q-basair
./deploy/server/tls.sh issue
```

certbot answers Let's Encrypt's HTTP-01 challenge through nginx on port 80,
writes the certificate to `/srv/q-basair/letsencrypt/`, and nginx restarts on
its HTTPS configuration (HTTP then redirects; HSTS is on). The daily cron runs
`tls.sh renew`, which renews within 30 days of expiry and reloads nginx. Check:
`curl -I https://basairquran.com` and `tail /var/log/qbasair-tls.log`.

Create the first administrator account:

```bash
docker compose --env-file .env.production exec api python scripts/manage_users.py create --email you@example.org
```

## Releasing

Merging to `main` releases: CI must be green on the pull request, then the
Release workflow builds, scans, pushes and deploys that commit. A release:

1. builds `api` and `web` on GitHub's runners (the web with the production
   `NEXT_PUBLIC_*` values, which are baked in at build time);
2. scans each image with **Trivy** — a CRITICAL or HIGH vulnerability with a
   fix available stops the release before anything is pushed;
3. pushes `…-api:<commit>`, `…-web:<commit>` and `:latest` to GHCR;
4. copies the deploy files to the server (never deleting anything there);
5. runs `deploy.sh --tag <commit> --jobs <tags>`: pulls, restarts on the new
   images, runs the blocking data jobs, waits up to 5 minutes for
   `/api/ready` to report `{"db": true, "commit": "<commit>"}` — **if it
   doesn't, the previous release is started again and the run fails**;
6. starts the long data jobs in the background, removes the images of older
   releases (keeping the previous one for rollback), and checks the site from
   outside.

Without deploy tags a release takes a few minutes and only swaps the images.

## Deploy tags (data jobs)

Put a tag in the **merge commit message** on `main` (or in the `jobs` input
of a manual run) when generated data must be rebuilt:

| Tag | When | What runs |
|---|---|---|
| `[rebuild-db]` | `scripts/build_db.py`, `build_mushaf_layout.py`, `build_morphology.py` or Quran source data changed | `quran.db` + the Madani layout tables, API restarted, API cache emptied; then the offline packs (background) |
| `[rebuild-index]` | `scripts/build_research_index.py` or `data/research_sources/` changed | the research index, API restarted |
| `[rebuild-translations]` | `scripts/build_translations.py` or `translation_sources.json` changed | `translations.db`, then the offline packs (background, resumable) |
| `[prefill-recitation]` | the reciter catalogue changed | the shared verse-duration cache, `data/cache.db` (background, resumable) |
| `[prepare-recitations]` | `scripts/build_recitations.py` or `recitation_sources.json` changed, or to prepare more reciters | one recording per surah (background, resumable — below) |

Missing data is built without a tag: `translations.db`, the offline packs and
`cache.db` are started in the background whenever they don't exist.

```text
release: [develop-12] - Publie develop [rebuild-db] [prepare-recitations]
```

## Preparing the recitations (one recording per surah)

Reciting sounds seamless — no pause between verses — when a surah plays from
**one recording** with its verse timings (`docs/recitation-audio.md`). The
server prepares those recordings once, into `data/recitations/` (never
committed), and nginx serves them as static files with year-long caching.
Until a surah is prepared, the player takes the same recording straight from
Quran.com or mp3quran.net for the reciters they carry
(`apps/web/features/recitation/direct-source.ts`), so preparing is about
serving the audio from our own server (and CDN), at a steady 64 kbps, for
every reciter — including those only everyayah.com has.

**What it needs**

- A release on the server (the `/api/recitations` routes, the nginx location
  and the `data/recitations` mount are part of the stack).
- Disk: about 0.5–0.6 GB per reciter for all 114 surahs — ~8 GB for the
  configured reciters, ~70 GB for every mp3quran timed read. Check `df -h /srv` first.
- Outbound HTTPS to `api.qurancdn.com`, `download.quranicaudio.com`,
  `www.mp3quran.net`, `cdn.mp3quran.net` (and its `serverN.` hosts) and
  `everyayah.com`.
- `ffmpeg`: in the API image already.

**Which reciters** — `QBASAIR_PREPARE_RECITERS` in `.env.production`:

| Value | Prepares |
|---|---|
| `configured` (default) | the reciters listed in `scripts/recitation_sources.json` |
| `all` | those, plus every other timed mp3quran read (118 reciters, every riwāyah) |
| `alafasy,husary` | only these ids |

**Running it**

1. Release with `[prepare-recitations]` in the merge commit message, or run the
   Release workflow by hand with `jobs` = `prepare-recitations`. The deploy
   starts `scripts/build_recitations.py` in a detached container and finishes
   without waiting for it.
2. Follow it on the server:

   ```bash
   cd /srv/q-basair
   docker ps --filter "label=com.docker.compose.service=api"      # the preparation is a second api container
   docker logs -f <container-id>                                   # surah by surah, a summary every 25
   ls data/recitations/                                            # one folder per reciter, catalog.json
   du -sh data/recitations
   ```

3. Check it from outside once a reciter has surahs:

   ```bash
   curl -s https://basairquran.com/api/reciters | jq '.[] | {id, prepared: (.surahs | length)}'
   curl -sI https://basairquran.com/api/recitations/audio/alafasy/001.mp3 | head -5
   ```

It is **resumable**: surahs already prepared are kept and skipped, so a stopped
run (a reboot, a full disk) continues with the next release that carries the
tag — or by hand, without a release:

```bash
cd /srv/q-basair
docker compose --env-file .env.production run -d --rm api \
  python scripts/build_recitations.py --reciters configured        # or all, or a list of ids
docker compose --env-file .env.production run --rm api \
  python scripts/build_recitations.py --reciters alafasy --surahs 1,112-114   # a quick check
```

New surahs are picked up without restarting anything: the script rewrites
`catalog.json` every 25 surahs and at the end, the API re-reads it when it
changes, and the app asks `/api/reciters` again. To start over for one
reciter, delete its folder in `data/recitations/` and run it again.

## Rollback

The previous release's images stay on the server. Any of:

- **On the server** (fastest, no GitHub needed):

  ```bash
  cd /srv/q-basair
  ./deploy/server/deploy.sh --rollback        # the release before the current one
  ./deploy/server/deploy.sh --tag <commit>    # any release whose images are on the server or in GHCR
  cat .deploy/history                         # what was deployed, when
  ```

- **From GitHub**: Actions → Release → Run workflow, `image_tag` = the commit to
  go back to (its images are in GHCR; nothing is rebuilt).
- **Fix forward**: revert the bad merge on `main`; the revert releases as usual.

A rollback doesn't undo data jobs: if a release rebuilt `quran.db` with a new
schema, roll back with `jobs` = `rebuild-db` so the old code gets its database.
User data (`auth.db`, `app_data.db`) is never rebuilt — for it, see backups.

## Backups

`deploy/server/backup.sh` runs nightly at 02:42 (cron from `setup.sh`):
consistent SQLite copies of `auth.db` and `app_data.db` (accounts and
everything readers saved), `research_agent.db`, and `.env.production`, in
`/srv/q-basair/backups/<timestamp>.tar.gz`, kept 14 days
(`QBASAIR_BACKUP_RETENTION_DAYS`). Everything else in `data/` is regenerated
by the deploy.

**Off the server** (recommended — the server's disk is a single point of
failure): install `rclone` for the `deploy` user, configure a remote (e.g.
Cloudflare R2 or Backblaze B2: `rclone config`), and set
`QBASAIR_BACKUP_RCLONE_REMOTE=<remote>:<bucket>` in `.env.production`; each
archive is then copied there too. Contabo's own snapshot feature is a useful
extra for the whole disk.

**Restore**:

```bash
cd /srv/q-basair
docker compose --env-file .env.production stop api worker
tar -xzf backups/<timestamp>.tar.gz -C /tmp
cp /tmp/<timestamp>/auth.db /tmp/<timestamp>/app_data.db data/
docker compose --env-file .env.production start api worker
```

Check `tail /var/log/qbasair-backup.log` now and then; try a restore on a copy
once in a while.

## Code quality and security scans

**Trivy** (no account needed) runs in two places:

- CI's **Security scan** job scans the repository on every pull request: known
  vulnerabilities in `pnpm-lock.yaml` and `requirements*.txt`, secrets
  committed by mistake, and misconfigurations in the Dockerfiles. It fails on a
  CRITICAL or HIGH finding that has a fix; the full report (every severity) is
  kept as the run's `trivy-report` artifact.
- The **Release** workflow scans each built image (OS packages and libraries)
  with the same rule before pushing it.

A finding that can't be fixed yet and is accepted goes in `.trivyignore`, one
ID per line, with the reason and when to look again. Fix rather than ignore:
most findings go away by upgrading the dependency or the base image.

**Sonar** (code quality, bugs, code smells, security hotspots, backend
coverage) runs in CI's **Code quality (Sonar)** job once `SONAR_TOKEN` is set;
until then it is skipped (green). Either service works:

- **SonarQube Cloud** (sonarcloud.io, nothing to host; the free plan covers
  private projects up to 50,000 lines): import the repository, turn off
  "Automatic Analysis" (CI analyses), then set the secret `SONAR_TOKEN` and the
  variables `SONAR_ORGANIZATION` and `SONAR_PROJECT_KEY` (as shown by Sonar).
- **Self-hosted SonarQube** (Community Build; it needs 2–4 GB of RAM for its
  search engine — run it on another machine than production, or on a larger
  VPS): create the project and a token, then set the secret `SONAR_TOKEN` and
  the variables `SONAR_HOST_URL` (e.g. `https://sonar.example.org`) and
  `SONAR_PROJECT_KEY`.

What is analysed: `sonar-project.properties`. Set the variable
`SONAR_QUALITY_GATE_WAIT=true` to make CI fail when the quality gate fails.

## Cloudflare

Optional and recommended (`docs/production-platform-plan.md`): DNS, CDN, DDoS
protection and TLS at the edge, and caching of the cacheable API responses
(`docs/caching.md`).

1. Add `basairquran.com` to Cloudflare and use its name servers at the registrar.
2. Create the A/AAAA records of [DNS](#2-dns), **proxied** (orange cloud).
3. SSL/TLS mode **Full (strict)** — the origin keeps its Let's Encrypt
   certificate. HTTP-01 renewal works through Cloudflare.
4. In `.env.production`: `QBASAIR_CDN_TRUSTED_RANGES` = Cloudflare's IPv4 and
   IPv6 ranges (cloudflare.com/ips), comma-separated, and
   `QBASAIR_CDN_REAL_IP_HEADER=CF-Connecting-IP`, so rate limits and logs see
   the visitor, not Cloudflare. Then restart nginx:
   `docker compose --env-file .env.production up -d nginx`.
5. A cache rule for `/api/*` that respects the origin's `Cache-Control`
   (`docs/caching.md` → "Putting a CDN in front").
6. `DEPLOY_HOST` must stay the server's IP (SSH doesn't go through Cloudflare's proxy).

Ports 80/443 can then be limited to Cloudflare's ranges. Docker publishes
them through its own firewall chain, before ufw: restrict them in the
`DOCKER-USER` chain (or Contabo's firewall in the customer panel), not ufw.

## Operations

```bash
cd /srv/q-basair
alias dc='docker compose --env-file .env.production'

dc ps                                  # services and health
dc logs -f --tail=200 api              # also: web, worker, nginx
dc exec api python scripts/manage_users.py list
dc restart web                         # one service
cat .deploy/current .deploy/history    # what is deployed
df -h /srv && du -sh data/*            # disk
```

- **System updates** install automatically (unattended-upgrades); reboot when
  `/var/run/reboot-required` exists — the stack restarts on its own
  (`restart: unless-stopped`).
- **Settings changes**: edit `.env.production`, then `dc up -d` (the release
  tag is kept in the file by each deploy, so this restarts the same release).
- **Resources**: the `QBASAIR_*_MEM_LIMIT` / `*_CPUS` values in
  `.env.production` cap each service; `docker stats` shows the real use.
- **Monitoring**: point an uptime check (e.g. UptimeRobot, Better Stack) at
  `https://basairquran.com/api/ready`; it answers 503 when the database is not
  readable.

## Troubleshooting

| Symptom | Look at |
|---|---|
| Release fails at "Deploy" with "did not become ready" | the run's log (the last `/api/ready` answer), then on the server `dc logs api`. The previous release was put back. |
| Release fails at the image scan | the Trivy table in the run: upgrade the package (or base image); accept only with a reason in `.trivyignore` |
| `Permission denied (publickey)` in the run | `DEPLOY_SSH_KEY` matches the key given to `setup.sh --ssh-key`; `DEPLOY_USER` is `deploy` |
| `Host key verification failed` | the server was reinstalled: refresh `DEPLOY_KNOWN_HOSTS` (`ssh-keyscan`) |
| `denied` when pulling from ghcr.io | the packages `q-basair-api` / `q-basair-web` must stay linked to this repository (Packages → package settings → "Manage Actions access") |
| The site shows a 502 | `dc ps` — a service still starting (the API builds `quran.db` on first start) or unhealthy (`dc logs`) |
| A certificate warning | `ls letsencrypt/live/basairquran.com/`; `./deploy/server/tls.sh issue`; with Cloudflare, SSL mode Full (strict) |
| `tls.sh issue` fails | DNS not pointing here yet (`dig +short basairquran.com`), or port 80 blocked |
| The disk fills up | `du -sh data/* backups docker` — recitations (`data/recitations`), old backups, `docker system df` |
