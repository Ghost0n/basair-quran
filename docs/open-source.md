# Going public: the open-source checklist

How this repository was prepared to become a public open-source project, and
the steps that remain for its owner (most are repository settings only the
owner can change).

## What the repository now carries

| File | Purpose |
|---|---|
| `LICENSE` | GNU AGPL v3.0 (`AGPL-3.0-only`, also in every `package.json`) |
| `NOTICE.md` | What is ours, and the third-party data and fonts that keep their own terms |
| `CONTRIBUTING.md` | Ground rules, setup, checks, translation workflow, the CLA |
| `CLA.md` + `.github/workflows/cla.yml` | Contributor License Agreement, signed once by a PR comment (CLA Assistant Lite, pinned to a commit; signatures on the unprotected branch `cla-signatures`) |
| `CODE_OF_CONDUCT.md` | Contributor Covenant 2.1; reports through the app's contact form |
| `SECURITY.md` | Private vulnerability reporting through GitHub |
| `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md` | Bug / idea / translation forms; links to the guide, the FAQ and private security reports |
| `.github/dependabot.yml` | Weekly grouped updates (npm, pip, Actions, Docker) against `develop` |
| `.github/CODEOWNERS` | Every change reviewed by the maintainer |

The app links to its source (`lib/site.ts` → `SOURCE_URL`): in the public
pages' footer and in Settings → «الدعم والملاحظات». The AGPL (§13) asks a
network service to offer its source to its users — keep that link working if
the repository moves.

## Audit before publishing (done)

- **Secrets:** the whole history was searched for keys, tokens, private keys
  and filled-in `.env` values — none. Production secrets live only in the
  server's `.env.production` and the GitHub `production` environment.
- **Private corpus:** `data/research_sources/` was never committed (only its
  `.gitkeep`).
- **Workflows:** pull requests from forks run CI without secrets
  (`pull_request`); release and deploy run only on `main` behind the
  `production` environment. The only `pull_request_target` workflow is the CLA
  check, which never checks out or runs the pull request's code.
- **Personal details in files:** removed (local paths in `AGENTS.md`).

## Remaining before the switch to public

1. **Confirm the data terms** marked "to be confirmed" in `NOTICE.md`: the
   King Fahd Complex terms for `data/quran-narrations/*.json`, and the origin
   of `data/word_root_dictionary.json`. Publishing data without the right to
   do so is the one mistake that can't be undone by a later commit.
2. **Rewrite the history** (below): your personal email is the author of
   about 300 commits, and five old copies of the generated `quran.db` make a
   clone 127 MB.
3. **Repository settings** (Settings → …):
   - *General*: description, website `https://basairquran.com`, topics
     (`quran`, `arabic`, `nextjs`, `fastapi`, `open-source`, `research`,
     `rtl`); social preview `apps/web/public/og-image.png`; enable
     Discussions; disable Wiki if unused.
   - *Code security*: private vulnerability reporting, Dependabot alerts and
     security updates, secret scanning **with push protection**, CodeQL
     default setup.
   - *Branches*: protect `main` and `develop` — pull request required, the CI
     checks and `CLA` required, no force pushes (after the rewrite), linear
     history optional. Leave `cla-signatures` unprotected.
   - *Actions → General*: "Require approval for first-time contributors" for
     fork pull requests; workflow permissions read-only by default (each
     workflow asks for what it needs).
   - *Packages*: make the `q-basair-api` / `q-basair-web` images public on
     GHCR, or keep them private (the server logs in to pull them).
4. **Labels** used by the templates and CONTRIBUTING: `bug`, `enhancement`,
   `i18n`, `good first issue`, `help wanted`.
5. **Settings → General → Danger zone → Change visibility → Public.**

## Rewriting the history

Only `main` and `develop` are published. The other branches (feature,
fix and prototype branches, some never merged) and the `iphone-test-*` tags
(internal TestFlight builds) stay in the private archive; public releases
start with their own tags (`v1.0.0` at launch). The CLA bot creates the
`cla-signatures` branch itself at the first outside pull request.

A one-off, done from a fresh mirror clone, never in a working checkout:

```bash
pip install git-filter-repo
git clone --mirror https://github.com/Ghost0n/Q-Basair.git qb-mirror
git -C qb-mirror bundle create ../q-basair-archive.bundle --all   # full backup, kept private
cd qb-mirror

# 0. Keep only main and develop: drop every other branch, every tag and the
#    pull-request refs from this copy (the private repository keeps them all).
git for-each-ref --format='%(refname)' \
  | grep -vE '^refs/heads/(main|develop)$' \
  | xargs -r -n1 git update-ref -d

# 1. Drop every old copy of the generated database (it is rebuilt from data/)
#    and an archive committed by mistake.
git filter-repo --invert-paths --path data/quran.db --path license_expression-30.4.4.tar.gz

# 2. Replace the personal author/committer email by the GitHub noreply address.
#    The mailmap file lives outside the repository; one line:
#    <ID+user@users.noreply.github.com> <old personal address>
git filter-repo --mailmap ../mailmap.txt

git count-objects -vH          # expect a fraction of the 127 MB
git log --all --format='%ae' | sort -u   # only the noreply and bot addresses left
```

Then publish (see the two options below):

```bash
# New public repository (recommended): an empty repository created on GitHub.
git push https://github.com/<owner>/<new-repo>.git main develop

# Or this repository, rewritten in place: replace both branches, then delete
# every other branch and tag on GitHub (they live on in the archive bundle).
git push --force origin main develop
```

Afterwards every commit has a new SHA: re-clone everywhere (the server's
`/srv/q-basair` only receives files from the release workflow, so it needs
nothing), and close or rebase any open pull request.

**What a rewrite cannot reach:** GitHub keeps each pull request's original
commits under read-only `refs/pull/*` references. In *this* repository, PRs
#1–#84 would still expose the old email and the old database copies once it
is public. Two ways to close that gap:

- **Publish the rewritten history in a new public repository** (recommended):
  push the mirror to a new empty repository, set it up as above, point
  `SOURCE_URL`, the GHCR image names and the release secrets at it, and keep
  this one private as the archive of its pull requests.
- **Keep this repository** and ask GitHub Support to purge the cached pull
  request references after the rewrite (their "removing sensitive data"
  procedure) before changing the visibility.
