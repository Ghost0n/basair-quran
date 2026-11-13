# Notices: what is ours, and what keeps its own terms

**Q-Basair's own code** — everything in this repository that is not listed
below — is licensed under the **GNU Affero General Public License v3.0 only**
(`LICENSE`, SPDX `AGPL-3.0-only`). If you run a modified version as a network
service, the AGPL asks you to offer its source to its users (section 13); the
app links to its source for that reason.

The Quran text and its scholarly data are **not** ours to license. They are
distributed here, or fetched at build and deploy time, **under their own
terms**, which stay with them in any copy or fork. They are aggregated with the
code, not covered by the AGPL. Before reusing any of them, read their terms at
the source.

## Bundled in this repository

| Path | What | Source | Terms (as published by the source) |
|---|---|---|---|
| `data/quran-morphology.txt` | Word-by-word morphology (segments, roots, lemmas) of the Ḥafṣ text | The Quranic Arabic Corpus (corpus.quran.com), University of Leeds | GNU GPL; attribution required; the data is distributed unchanged |
| `data/quran-narrations/*.json` | The Quran text in six riwāyāt (Ḥafṣ, Warsh, Qālūn, Shuʿba, al-Dūrī, al-Sūsī) with page, juz and line data | King Fahd Glorious Qur'an Printing Complex (KFGQPC), Madinah | KFGQPC terms of use: free distribution of the unmodified text, not for sale (confirmed by the maintainer) |
| `data/mushafs/*.json` | The same texts, normalized for `scripts/build_db.py` (verse fields, simple-script spelling, surah metadata) | Derived from `data/quran-narrations/` | As their source; the Quranic text itself is never altered |
| `data/word_root_dictionary.json` | Fallback word → root table for spellings the corpus never uses | Derived from the Quranic Arabic Corpus morphology data | As the Quranic Arabic Corpus: GNU GPL, attribution required |
| `apps/web/public/fonts/AmiriQuran-Regular.ttf`, `apps/web/public/fonts/ui/amiri-*` | Amiri and Amiri Quran | Khaled Hosny, the Amiri project | SIL Open Font License 1.1 (`apps/web/public/fonts/ui/OFL-Amiri.txt`) |
| `apps/web/public/fonts/ui/cairo-*` | Cairo | Mohamed Gaber, the Cairo project | SIL Open Font License 1.1 (`apps/web/public/fonts/ui/OFL-Cairo.txt`) |
| `apps/web/components/icon.tsx` | Interface icons, some adapted from Lucide | Lucide Contributors (portions from Feather, Cole Bemis) | ISC (`apps/web/components/LICENSE-lucide.txt`) |
| `apps/web/public/guide-media/` | Screenshots and clips of the app (the guide) | This project | AGPL-3.0, with the Quran text they show under its own terms above |

## Fetched at build or deploy time (never committed)

| Fetched by | What | Source | Terms |
|---|---|---|---|
| `scripts/fetch_mushaf_fonts.py` | QPC V1 page fonts (604 + basmala), served unmodified | KFGQPC, via `nuqayah/qpc-fonts` | KFGQPC "Freeware, Non-Commercial": free to use, copy and distribute; no sale, no modification or subsetting, no reverse engineering |
| `scripts/build_mushaf_layout.py` | Line-by-line Madani page layout | `zonetecde/mushaf-layout` (QUL / Tarteel data family) | Freely redistributable layout data |
| `scripts/build_translations.py` | Translations of the meanings (`data/translations.db`) | QuranEnc (Noble Quran Encyclopedia) first, Tanzil for gaps (`scripts/translation_sources.json`) | QuranEnc: free with attribution, unmodified. Tanzil: non-commercial, with attribution, verbatim. Each text is stored and shown with its source, translator and version |
| `scripts/build_recitations.py` | Recitation audio and verse timings (`data/recitations/`), copied to the server and served from it | Quran.com / QuranicAudio, mp3quran.net, everyayah.com (`scripts/recitation_sources.json`) | **Not yet confirmed.** The recordings belong to their reciters and publishers; written permission to re-host and stream them is being requested from each source (see below). Every prepared surah keeps its attribution, shown in the reciter list |
| `apps/web/scripts/fetch-script-fonts.mjs` | Noto fonts for non-Latin interface scripts | Google Fonts / Noto | SIL Open Font License 1.1 |

## Services the app calls while running

| Service | What for | Terms |
|---|---|---|
| Quran.com (`api.qurancdn.com`, `download.quranicaudio.com`), mp3quran.net, everyayah.com | Playing a recitation straight from its source when the server has not prepared it, and its verse timings | Each source's terms — **not yet confirmed**, as above |
| The AI provider a user connects (Anthropic, OpenAI, Google, Mistral, Groq, DeepSeek, xAI, OpenRouter) | The study assistant, with the user's own key or sign-in | That provider's terms, accepted by the user |
| Ollama (the server's default model) | The study assistant and moderation, for users without their own provider | The operator's Ollama account and the model's own licence |
| Yamli (`api.yamli.com`) | Optional Arabic typing aid; **off** in production (`NEXT_PUBLIC_ENABLE_YAMLI=0`) | Yamli's terms, if an operator turns it on |

Interface fonts are self-hosted: Google Fonts is only contacted when the build
downloads them (`apps/web/scripts/fetch-script-fonts.mjs`), never by a visitor's
browser — a rule CI enforces (`docs/privacy-fonts.md`).

### Recitations: permission status

| Source | Re-hosting on our server | Streaming from the source |
|---|---|---|
| Quran.com / QuranicAudio | to request | to request |
| mp3quran.net | to request | to request |
| everyayah.com | to request | to request |

The request sent to each source, in English and Arabic, is
`docs/recitation-permission-request.md`; record each answer (date, conditions)
in this table. Until a source answers yes, an operator should not prepare
(re-host) its recordings; `QBASAIR_PREPARE_RECITERS` limits which reciters are
prepared.

The research corpus under `data/research_sources/` is private to each
installation and is never part of the repository.

## Using Q-Basair commercially

The AGPL allows commercial use of the code. Some of the data above does not:
the KFGQPC fonts must not be sold, and Tanzil translations are for
non-commercial use. A commercial deployment has to replace those parts or
obtain permission from their publishers.

If you are a rights holder and something here does not match your terms,
please open an issue or use the private contact in `SECURITY.md`; we will fix
it promptly.
