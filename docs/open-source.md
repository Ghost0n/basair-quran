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
- **Research corpus:** the books and lectures once used by the research agent
  (`data/research_sources/`) were never committed (only a `.gitkeep`), and the
  corpus was then removed from the app entirely: the agent answers from the
  Quran alone, and nothing in the repository reads such a corpus.
- **Workflows:** pull requests from forks run CI without secrets
  (`pull_request`); release and deploy run only on `main` behind the
  `production` environment. The only `pull_request_target` workflow is the CLA
  check, which never checks out or runs the pull request's code.
- **Personal details in files:** removed (local paths in `AGENTS.md`).

## Remaining before the switch to public

1. ~~Confirm the data terms in `NOTICE.md`~~ — done: the King Fahd Complex
   terms for `data/quran-narrations/*.json` and the origin of
   `data/word_root_dictionary.json` (the Quranic Arabic Corpus) were confirmed
   by the maintainer.
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
   - *Packages*: make the `basair-quran-api` / `basair-quran-web` images public on
     GHCR, or keep them private (the server logs in to pull them).
4. **Labels** used by the templates and CONTRIBUTING: `bug`, `enhancement`,
   `i18n`, `good first issue`, `help wanted`.
5. **Settings → General → Danger zone → Change visibility → Public.**

## Rewriting the history

**Done (2026-11):** this repository, `Ghost0n/basair-quran`, holds the
rewritten `main` and `develop` (16 MB instead of 127 MB; authors shown as the
GitHub handle with its noreply address; personal names and paths replaced).
The original repository, `Ghost0n/Q-Basair`, stays private as the archive of
every branch, tag and pull request; it is no longer developed.

Moving the project here also meant (owner steps, in Settings):

- the `production` environment with its `DEPLOY_*` secrets and the
  `QBASAIR_REMOTE_ORIGIN` variable, the mobile signing secrets
  (`ANDROID_*`, `APPLE_*`, `APPSTORE_*`) and `SONAR_TOKEN`, recreated here
  (secrets cannot be copied between repositories);
- the container images are now `ghcr.io/ghost0n/basair-quran-{api,web}`: the
  first release from this repository creates them, and the server pulls them
  with the token the release workflow passes; if `/srv/q-basair/.env.production`
  sets `QBASAIR_IMAGE_PREFIX`, update it;
- the release workflow disabled in the archive repository (Actions → Release →
  Disable), so only this repository deploys.

The procedure below is what was run, kept for reference.

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

## Code assessment for copyright and conformity (November 2026)

A pass over the code itself before going public, with no change to how the
app behaves (all tests, the typecheck and a browser check of every screen
unchanged).

**Checked and clean**

- Dependencies: all 217 npm packages and every Python dependency are under
  licences compatible with AGPL-3.0 (details in the PR that added `NOTICE.md`).
- No third-party code copied into the repository: no foreign licence headers,
  no vendored or minified files; the "ported from" notes in
  `packages/offline-engine` point at the project's own Python.
- Assets are original: app icons and covers are generated from the project's
  mark (`apps/mobile/scripts/make_icons.py`), the share image by
  `scripts/make-og-image.mjs`, the page-turn cursors are hand-written SVG; no
  third-party logo (AI providers, Google, Apple) is drawn anywhere.
- No secret in the mobile projects: Android signing reads environment
  variables; no keystore, provisioning profile or Firebase file is committed.
- No analytics, advertising or tracking code; Next.js telemetry is disabled in
  the web image; error reports go only to our own server (automatic capture is
  opt-in, the «أبلِغ» button sends on the user's request).
- No request from a visitor's browser to a third party
  (`docs/privacy-fonts.md`, `apps/web/scripts/audit-third-party-requests.mjs`).

**Patched**

- Yamli (third-party Arabic typing script) removed entirely: component, search
  hook handler, build arguments, CSP entry and docs. It was already off in
  production; Latin-to-Arabic search suggestions do not depend on it.
- Stale code removed: unused imports and variables (TypeScript with
  `noUnusedLocals`/`noUnusedParameters`, ruff F401/F841), and three files
  nothing used (`auth-topbar.tsx`, `logout-button.tsx`, `fly-to-notebook.ts`)
  with the CSS only they needed.
- Test fixtures and the moderation benchmark no longer carry realistic contact
  details that could belong to real people: phone numbers, a Gmail address, a
  social handle, a street address and named institutions became obvious
  placeholders (each item keeps its label and meaning).
- `NOTICE.md` now also lists the committed files generated from the Quran text
  (landing-page verses, juz/hizb tables).

**For the owner before launch**

- **Recitation permissions:** send `docs/recitation-permission-request.md` and
  record the answers in `NOTICE.md`.
- **A privacy policy and a legal notice** (in the EU, and required by the App
  Store and Google Play): the service stores account emails, feedback
  addresses and community posts, and sends study questions and posts for
  moderation to an AI provider (the operator's Ollama account by default). The
  policy should say what is collected, why, for how long, who processes it
  (the hosting provider, the AI provider), and how a person can see or delete
  their data. The app already lets users delete their account and data.

- **The former research corpus on the server:** delete `data/research_sources/`
  and `data/research_agent.db` once (`docs/deployment.md` → *Removing the
  former research corpus*).

## Research corpus removed (November 2026)

The research agent used to read a private corpus of modern books and lectures
(`data/research_sources/`, indexed into `data/research_agent.db`): excerpts
went to the AI provider to discover search terms, and the experimental
explanatory reading («قراءة تفسيرية») drew on them for its answers. Those
works are under copyright, so the corpus was removed from the app entirely
rather than published or kept behind a licence question:

- the agent reads nothing but the Quran: search terms come from the question
  and the Quran's own roots and words, and the answer only from the ayahs
  Quran search returns (each read with its neighbouring ayahs); its prompts
  forbid tafsir, hadith, scholars' opinions, rulings and outside knowledge;
- the explanatory reading is gone from the backend and the interface; answers
  saved with it still display, with their disclaimer;
- the index builder (`scripts/build_research_index.py`), its configuration
  (`QBASAIR_RESEARCH_INDEX_PATH`, `QBASAIR_RESEARCH_SOURCES_PATH`), the
  `[rebuild-index]` deploy job and the index's backup were removed.
