# Q-Basair Hetzner Deployment

This repository now includes a production-oriented Docker Compose layout with `nginx` as the only public entrypoint, plus a free Let's Encrypt path for HTTPS so you can avoid paying for a Hetzner Load Balancer unless you actually want one.

## Deployment shape

The intended topology is:

```text
Internet
  -> nginx (public ports 80 and 443)
  -> web (internal Docker network only)
  -> api (internal Docker network only)
  -> ./data bind mount for quran.db, research_agent.db, auth.db, and research sources
```

Important properties:

- only `nginx` publishes a host port
- `web` and `api` stay on the internal Docker network
- `api` is never published directly to the internet
- `/api/research-agent` has a stricter rate limit than the rest of the API
- the default public deployment disables Yamli with `NEXT_PUBLIC_ENABLE_YAMLI=0`
- `QBASAIR_AUTH_ENABLED=1` enables invite-only login backed by `data/auth.db`
- `QBASAIR_ENABLE_TLS=1` lets `nginx` switch to HTTPS automatically once the Let's Encrypt certificate is present

## Files added for deployment

- `docker-compose.yml`
- `Dockerfile.api`
- `apps/web/Dockerfile`
- `deploy/nginx/nginx.conf`
- `deploy/nginx/http.conf.template`
- `deploy/nginx/tls.conf.template`
- `deploy/nginx/start-nginx.sh`
- `.env.production.example`
- `scripts/bootstrap_production.sh`
- `scripts/provision_tls.sh`
- `scripts/renew_tls.sh`
- `scripts/manage_users.py`

## Recommended Hetzner baseline

For a first public deployment, keep the stack on a single Hetzner Cloud server and add Hetzner Firewall rules:

- allow `80/tcp` from anywhere
- allow `443/tcp` from anywhere once TLS is enabled
- allow `22/tcp` only from your office/home IP
- block everything else

Also enable:

- SSH keys only
- automatic host security updates
- daily backups or snapshots before releases

If you want a stronger edge posture later, place a Hetzner Load Balancer in front of the app server and attach both to a private network. In that shape, terminate TLS at the load balancer and forward to the `nginx` container on port `80`.

## First deploy

1. Clone the repository on the server.
2. Copy your local corpus files into `data/research_sources/` on the server when needed.
3. Create a production env file:

```powershell
Copy-Item .env.production.example .env.production
```

4. Edit `.env.production` and review at least:

- `QBASAIR_PUBLIC_DOMAIN`
- `QBASAIR_LETSENCRYPT_EMAIL`
- `QBASAIR_SESSION_SECRET`
- `QBASAIR_CORS_ORIGINS`
- `QBASAIR_LLM_CHAT_MODEL`
- `QBASAIR_LLM_EMBED_MODEL`
- `OLLAMA_API_KEY`

For public deployments, the safest default is to leave `OLLAMA_API_KEY` empty and rely on the frontend's bring-your-own-key flow.

5. Use the bootstrap helper:

```bash
chmod +x scripts/bootstrap_production.sh
./scripts/bootstrap_production.sh
```

The helper validates the Compose config, rebuilds `quran.db`, rebuilds `research_agent.db` when source files exist, and then starts the stack. Useful options:

```bash
./scripts/bootstrap_production.sh --skip-index
./scripts/bootstrap_production.sh --with-embeddings
./scripts/bootstrap_production.sh --no-build
./scripts/bootstrap_production.sh --provision-tls
```

6. Create the first admin or invited user:

```bash
python scripts/manage_users.py create --email you@example.com --admin
```

If you prefer the manual sequence, use:

7. Build the Quran DB if the mounted `data/` directory does not already contain `quran.db`:

```powershell
docker compose --env-file .env.production run --rm api python scripts/build_db.py
```

8. Build or rebuild the research index after updating `data/research_sources/`:

```powershell
docker compose --env-file .env.production run --rm api python scripts/build_research_index.py
```

9. Start the stack:

```powershell
docker compose --env-file .env.production up -d --build
```

10. Check health:

```powershell
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail=100 nginx
docker compose --env-file .env.production logs --tail=100 api
docker compose --env-file .env.production logs --tail=100 web
```

## HTTPS and Load Balancer options

### Option A: direct nginx + Let's Encrypt on the server

This is the lowest-cost production option and is now the default recommendation for Q-Basair.

Use this when you want HTTPS without paying for a Hetzner Load Balancer.

- point your domain's `A` or `AAAA` record at the server
- open `80/tcp` and `443/tcp` on the Hetzner Firewall
- set `QBASAIR_PUBLIC_DOMAIN`, `QBASAIR_LETSENCRYPT_EMAIL`, and `QBASAIR_ENABLE_TLS=1` in `.env.production`
- run:

```bash
chmod +x scripts/provision_tls.sh scripts/renew_tls.sh
./scripts/provision_tls.sh
```

The `nginx` container starts in HTTP mode when no certificate is present yet, serves the ACME challenge from `/var/www/certbot`, and then switches to HTTPS automatically after the certificate is issued and `nginx` is restarted.

Recommended renewal cron on the Hetzner VM:

```bash
0 4 * * * cd /srv/q-basair && ./scripts/renew_tls.sh >> /var/log/qbasair-cert-renew.log 2>&1
```

### Option B: Hetzner Load Balancer with private target networking

This is the recommended public shape for Q-Basair.

According to Hetzner's current docs, a Load Balancer can target servers via private IPv4 when both are attached to the same private Network, and HTTPS services terminate TLS at the Load Balancer before forwarding HTTP to the target. That maps cleanly to the current Compose stack because `nginx` already listens on HTTP internally.

Suggested setup:

1. Create a private Hetzner Network.
2. Attach the app server to that Network.
3. Create a Hetzner Load Balancer in the same project and attach it to the same Network.
4. Add the app server as a target via its private IPv4.
5. Configure:
   - HTTP service for initial validation, or
   - HTTPS service once your domain is ready
6. Set the health check path to `/healthz`.
7. Point DNS at the Load Balancer public IP.

Managed certificate note:

- Hetzner-managed certificates require Hetzner DNS
- if you do not use Hetzner DNS, upload your own certificate to the project and attach it to the Load Balancer

The committed `nginx` config can stay in HTTP mode in this shape, because TLS terminates at the Load Balancer.

### Sources

- [Hetzner Load Balancer overview](https://docs.hetzner.com/networking/load-balancers/overview/)
- [Hetzner Load Balancer FAQ](https://docs.hetzner.com/networking/load-balancers/faq/)
- [Hetzner Networks overview](https://docs.hetzner.com/networking/networks/overview/)
- [Hetzner Certificates overview](https://docs.hetzner.com/networking/certificates/overview/)
- [Hetzner Certificates FAQ](https://docs.hetzner.com/networking/certificates/faq)
- [Let's Encrypt getting started](https://letsencrypt.org/getting-started/?locale=en_GB)
- [Let's Encrypt documentation](https://letsencrypt.org/docs/?locale=en)

## Security decisions in this stack

### XSS and Ollama token exposure

The research UI currently stores the user's Ollama key in browser `sessionStorage`, which means any successful XSS can still steal that key.

This deployment reduces, but does not eliminate, that risk:

- Yamli is disabled by default in public deployments through `NEXT_PUBLIC_ENABLE_YAMLI=0`
- `nginx` adds a restrictive CSP, clickjacking protection, and basic browser hardening headers
- the backend does not persist `X-QBasair-Ollama-Key`

Recommended public policy:

- prefer bring-your-own Ollama keys per user
- do not ship a shared `OLLAMA_API_KEY` unless you also add authentication, quotas, and abuse controls
- keep external scripts to a minimum

### SQLite scaling

SQLite is intentionally treated as a single-node deployment detail here.

Recommended posture:

- run exactly one `api` replica
- keep `./data` on persistent storage
- back up `data/quran.db`, `data/research_agent.db`, and your corpus sources
- scale the reverse proxy first, not the backend DB layer

If traffic outgrows this shape later, revisit the storage layer before introducing multiple backend replicas.

### Direct API exposure

`docker-compose.yml` exposes only `nginx` on the host. Both `web` and `api` are attached only to the internal `app` network, and `QBASAIR_API_ORIGIN` points the web tier at `http://api:8001` inside Docker.

That means:

- the browser never needs to call the FastAPI container directly
- the FastAPI port stays off the public internet
- same-origin browser traffic continues to work through `/api/...`

## Recommended private beta authentication path

Yes, it is absolutely possible to keep the app private without implementing public signup first.

The simplest robust approach is:

- store users in a backend-managed table with hashed passwords
- disable self-signup completely
- create and revoke accounts from the server terminal with an admin CLI
- use signed `HttpOnly`, `Secure`, `SameSite` cookies for sessions

Why this is better than a public admin page for V1:

- smaller attack surface
- no extra frontend admin workflow to secure yet
- easier to operate from the Hetzner VM over SSH

Recommended future management commands:

```bash
python scripts/manage_users.py create --email user@example.com
python scripts/manage_users.py disable --email user@example.com
python scripts/manage_users.py set-password --email user@example.com
```

For Q-Basair specifically, the current implementation stores auth data in a separate `data/auth.db` file rather than mixing it into `quran.db` or `research_agent.db`.

### Password-reset email

Set these in `/srv/q-basair/.env.production` to email reset links (any SMTP provider —
e.g. a transactional service or your mail host):

```text
QBASAIR_PUBLIC_URL=https://your-domain.example
QBASAIR_SMTP_HOST=smtp.provider.example
QBASAIR_SMTP_PORT=587
QBASAIR_SMTP_USER=...
QBASAIR_SMTP_PASSWORD=...
QBASAIR_SMTP_SECURITY=starttls   # or ssl (465) / none
QBASAIR_MAIL_FROM="بصائر <no-reply@your-domain.example>"
```

Without `QBASAIR_SMTP_HOST` the token is written to the API log
(`docker compose logs api | grep "Password reset"`) for manual delivery. Configure SPF/DKIM
for the sender domain so the message isn't filtered as spam.

## Continuous deployment

Pushes and merges to `main` trigger automatic deployment via a GitHub Actions self-hosted runner registered on the Hetzner server. The workflow is defined in `.github/workflows/deploy.yml`.

### Runner setup (one-time)

Run the following on the Hetzner server as the `deploy` user. Get the exact download URL and token from **GitHub repo → Settings → Actions → Runners → New self-hosted runner → Linux x64**:

```bash
mkdir ~/actions-runner && cd ~/actions-runner
curl -o actions-runner-linux-x64.tar.gz -L https://github.com/actions/runner/releases/download/vX.X.X/actions-runner-linux-x64-X.X.X.tar.gz
tar xzf ./actions-runner-linux-x64.tar.gz
./config.sh --url https://github.com/Ghost0n/Q-Basair --token YOUR_TOKEN_FROM_GITHUB
sudo ./svc.sh install deploy
sudo ./svc.sh start
```

The runner runs as `deploy`, which is already in the `docker` group. It reads `.env.production` from `/srv/q-basair/.env.production` directly — that file is never committed.

### What each deploy does

1. `git reset --hard origin/main` — pulls the latest code
2. Optionally rebuilds `quran.db` when `[rebuild-db]` is in the commit message
3. Optionally rebuilds the research index when `[rebuild-index]` is in the commit message
4. `docker compose up -d --build --remove-orphans` — rebuilds only changed images and restarts affected containers
5. Health check against `/api/health` to confirm the stack is up

### Deploy tags

Append to the merge commit message on `main` when a rebuild is needed:

| Tag | When to use |
|---|---|
| `[rebuild-db]` | `scripts/build_db.py` or Quran source data changed |
| `[rebuild-index]` | `scripts/build_research_index.py` or `data/research_sources/` changed |

```bash
# rebuild quran.db on deploy
feat: [Q-Basair-130] - Modifie le schéma de la base [rebuild-db]

# rebuild research index on deploy
feat: [Q-Basair-131] - Ajoute nouvelles sources corpus [rebuild-index]

# rebuild both
feat: [Q-Basair-132] - Migration complète [rebuild-db] [rebuild-index]
```

Without either tag the deploy only rebuilds changed Docker layers — typically under 5 minutes.

## Operational notes

- `QBASAIR_BUILD_DB_ON_START=auto` lets the API rebuild `quran.db` when the generated DB is missing, but it does not build `research_agent.db`.
- `scripts/manage_users.py list` lets you confirm which invited accounts currently exist.
- if your corpus includes PDFs, install `pypdf` in the API image before relying on PDF ingestion.
- `NEXT_PUBLIC_ENABLE_YAMLI=0` is the recommended public default unless you have re-reviewed the external script risk.
- `/api/research-agent` is rate-limited more aggressively than general API routes because it is the most expensive endpoint.
