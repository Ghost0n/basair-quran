# Offline data packs (standalone Android app)

The standalone app ships a small core and downloads everything else on demand,
so nothing limits what it can do offline: every narration, translation and
reciter can be installed and then works without a connection, and new content
added on the server appears in the app's catalogue without an app update.

`scripts/build_offline_packs.py` splits the generated databases into packs:

| Pack | Contents | Size (current data) |
|---|---|---|
| `core.db` (in the app) | shared tables (surahs, roots, morphology variants, the list of narrations) + the Madani mushaf (Ḥafṣ, mushaf 2) with its 604-page layout + every index + `morphology_segments` (the word-analysis lines of `data/quran-morphology.txt`) | ~53 MB |
| `narration-<id>.db` | one other narration (Qālūn, Warsh, Shuʿba, al-Dūrī, al-Sūsī): its `ayahs`, `ayah_words`, `word_occurrences` (and page layout, if any) with their original ids | ~11.5 MB each |
| `translation-<slug>.db` | one translation of meanings, verbatim, with translator, source and version | 1–3 MB each |
| `interface-<code>.json` | one interface dictionary (Arabic, the source language, is an empty dictionary) | ~60 KB each |
| reciters | no file: each entry gives the reciter's public `audio_base` and file pattern; the phone downloads a surah's ayah MP3s directly | — |

The QPC page fonts of the Madani mushaf (`apps/web/public/fonts/qpc-hafs-v1`,
48 MB) ship with the app, so the default mushaf renders offline from the first
launch.

## Manifest

`manifest.json` lists the core and every pack with its `kind`, `file`, `size`,
`sha256` and a content `version`: a digest of the pack's rows, so it changes
only when the data changes (a corrected text shows "update available"). It also
lists `languages`: onboarding starts in English and asks for one language; the
choice installs that language's interface pack **and** its recommended
translation of meanings (QuranEnc's preferred translation first, then Tanzil,
never a transliteration). Arabic installs only the interface: its readers read
the Quran itself. A language that has a translation but no interface dictionary
yet is still offered — the interface stays in English.

## Installing a pack on the device

Narration packs use the same table schemas and the original row ids, so
installing one is a plain insert of its tables into the device's `core.db`
(in one transaction, after checking the SHA-256), and removing one is a delete
by `mushaf_id`. The core already holds every index, so an installed narration is
searchable immediately.

## Answering on the device

The phone answers the Quran routes itself with `packages/offline-engine`
(see `docs/offline-engine.md`), reading `core.db` and the installed packs.

## Verification

`python scripts/build_offline_packs.py --verify` proves the split loses and
changes nothing:

- core + every narration pack reassembled is identical to `data/quran.db`,
  table by table;
- search (root, exact, phrase), reader pages, the page layout, the ayah reader
  and the surah list answer byte-for-byte the same for the core narration on
  `core.db` and on the full database (every check must answer 200, or it proves
  nothing).

`tests/test_build_offline_packs.py` covers the split, checksums, versions,
reassembly, parity, the language → interface + translation mapping and the
atomic output swap.

The output (`build/offline/`) is generated and git-ignored. Build
`data/translations.db` first (`python scripts/build_translations.py`) to include
real translation packs.
