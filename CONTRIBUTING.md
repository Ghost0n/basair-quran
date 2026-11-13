# Contributing to Q-Basair

Thank you for helping. «بصائر» is a tool for reading and researching the
Quran with evidence: every result rests on verses shown with their text and
place, and understanding stays separate from the text. Contributions are
judged by that standard first.

## Ways to help

- **Report a bug or a wrong result** — a mis-highlighted word, a wrong root, a
  count that doesn't add up. Open an issue with the search, the page or the
  verse reference (the bug template asks for what we need).
- **Translations of the interface** — 23 languages today, all reviewed by
  machine and few by native speakers. Corrections are very welcome (see
  *Translating* below).
- **Code and docs** — pick an issue labelled `good first issue` or `help
  wanted`, or open an issue to discuss a larger change before writing it.
- **Questions** — read the [guide](https://basairquran.com/guide) and the
  [FAQ](https://basairquran.com/faq) first; ask in Discussions otherwise.

## Ground rules

These are product rules, not style preferences; a pull request that breaks
one will not be merged.

- **The Quran text is never altered.** Text, morphology, roots and mushaf
  metadata come from documented sources (`NOTICE.md`) through the build
  scripts; generated databases are never edited by hand or committed.
- **The research agent is Quran-only.** Its final answer is built only from
  verses returned by the Quran search; no tafsir, book, transcript or other
  corpus enters its prompts.
- **Neutral voice.** The app and its texts describe a method; they take no side
  between schools, groups or beliefs (see the
  [community guidelines](https://basairquran.com/guidelines)).
- **No tracking, no ads**, and nothing that sends a user's data anywhere they
  did not ask for.

## Getting set up

Requirements: Python 3.12, Node 22 and pnpm 10.

```bash
# Backend
pip install -r requirements.txt -r requirements-dev.txt
python scripts/build_db.py            # builds data/quran.db from data/ (a few minutes)
python scripts/start_api.py           # http://127.0.0.1:8001

# Web
pnpm install
pnpm --filter @q-basair/web dev       # http://127.0.0.1:3000 (proxies /api to the backend)
```

`README.md` covers the rest (accounts, translations, recitations, the AI
researcher with Ollama, the standalone mobile app).

## Before you open a pull request

Run the checks that cover what you touched:

```bash
PYTHONPATH=. pytest -q                                   # backend
pnpm --filter @q-basair/web exec tsc --noEmit            # types
pnpm --filter @q-basair/web exec vitest run              # web tests
cd apps/web && node scripts/i18n.mjs catalog && node scripts/i18n.mjs check   # strings
```

and, when you change Quran search or reader behaviour, the offline engine's
parity suite (`docs/offline-engine.md`): the standalone app ports those
routes and must give the same answers.

A good pull request:

- does **one** thing, with tests next to the code it changes;
- updates the docs it makes stale (`AGENTS.md` lists which doc covers what);
- keeps the backend models (`src/app/models/api.py`), the shared types
  (`packages/shared`) and the API client (`packages/api-client`) in step;
- explains *why* in its description, with screenshots for visible changes
  (phone and desktop, right-to-left and left-to-right when it matters).

Branch and commit names follow `AGENTS.md` (`feat/Q-Basair-<n>-short-name`,
`feat: [Q-Basair-<n>] - Message`). Don't worry if you get them wrong: a
maintainer will fix them when merging. Pull requests target `develop`; `main`
is what runs in production.

## Translating

Interface strings are written in Arabic inside `t("…")` calls; each language
lives in `apps/web/lib/i18n/locales/<code>.json` as `"Arabic source":
"translation"`.

- Fix a translation by editing its value — never the Arabic key.
- Keep labels identical to the button they name (the guide and FAQ quote
  them), keep the language's own quotation marks, and flip `←` paths to `→`
  in left-to-right languages.
- Run `node scripts/i18n.mjs check` from `apps/web`.

## The Contributor License Agreement

Before your first pull request can be merged you will be asked, by a bot
comment, to sign the [CLA](CLA.md) by replying with one sentence. You keep the
copyright of your work; the CLA lets the project distribute it — including in
the iOS and Android stores, whose terms are not compatible with the AGPL alone
— and relicense the project later if that is ever needed. You only sign once.

## Conduct and security

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
Security problems are reported privately, never in a public issue — see
[SECURITY.md](SECURITY.md).
