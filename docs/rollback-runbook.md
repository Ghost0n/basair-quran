# Rollback runbook

How to revert a bad production deploy on the Hetzner host. Two paths — prefer the
**git rollback** (always works); use the **image rollback** for a faster revert
when the previous images are still on the host.

All commands run on the server, in `/srv/q-basair`, as the `deploy` user.

---

## A. Git rollback (primary — always works)

The deploy is `git reset --hard origin/main` → `docker compose up --build`, so a
rollback is just checking out the last-good commit and rebuilding.

```bash
cd /srv/q-basair

# 1. Find the last-good commit (the deploy also records it):
cat .last_deploy_sha        # the currently-deployed short SHA
git log --oneline -10       # pick the previous good <sha>

# 2. Pin to it (detached — do NOT push this):
git fetch origin
git reset --hard <good-sha>

# 3. Rebuild + restart. Add [rebuild-db] behavior only if the bad deploy changed
#    the schema — otherwise the mounted data/ volume is untouched.
docker compose --env-file .env.production up -d --build --remove-orphans

# 4. Verify readiness:
curl -sf https://basair-al-quran.duckdns.org/api/ready | grep '"db":true'
```

To return to the tip afterward: `git reset --hard origin/main`.

⚠️ If the bad deploy carried `[rebuild-db]`, the DB was regenerated from source and
is fine to keep. `auth.db` / `app_data.db` (user data) are **never** rebuilt — if
they were somehow lost, restore from the nightly backup (`scripts/backup_databases.sh`,
snapshots under `/srv/q-basair/backups`).

---

## B. Image rollback (fast — no rebuild)

Each deploy tags the built images `qbasair-{api,web}:<sha>` (see the deploy
workflow). If the previous image is still present you can retag + restart without
a rebuild.

```bash
cd /srv/q-basair

# 1. List available tags:
docker images | grep qbasair-

# 2. Retag the good image as what compose runs (its service image), e.g. for api:
#    (confirm the exact repo name compose uses with `docker compose images api`)
docker tag qbasair-api:<good-sha> "$(docker compose --env-file .env.production images -q api)"

# 3. Restart without rebuilding:
docker compose --env-file .env.production up -d --no-build

# 4. Verify:
curl -sf https://basair-al-quran.duckdns.org/api/ready | grep '"db":true'
```

Image rollback does not touch the git working tree — follow with a git rollback
(Path A) so the next deploy doesn't immediately re-apply the bad commit.

---

## Sanity checklist after any rollback
- `docker compose ps` — all services `healthy`.
- `GET /api/ready` returns `"db":true` and the expected commit.
- `docker compose logs --tail=50 api web` — no crash loops.
- User data intact (spot-check the notebook / a known account).
