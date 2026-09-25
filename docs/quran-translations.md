# Quran translations of meanings (ترجمة المعاني)

Q-Basair can show translations of the Quran's meanings under each ayah in the «آية آية» reader.
A translation is a translator's understanding of the meanings. It is **not** the Quran: the Arabic
mushaf text stays the reference everywhere, translations are labelled with their translator and
source, and the research agent never reads them (strict mode stays Quran-only).

## Sources (trust order)

| Source | What | Why | Terms (summary) |
|---|---|---|---|
| [QuranEnc — The Noble Quran Encyclopedia](https://quranenc.com) | Primary. Reviewed translations in ~70 languages, with versions and footnotes, published with the King Fahd Glorious Quran Printing Complex and partner centres (Rowwad, etc.). | Institutional review, versioned, and a public API. | Free use with attribution; texts must not be modified; keep them updated. |
| [Tanzil](https://tanzil.net/trans/) | Secondary. Used only for languages QuranEnc does not cover, plus the Latin transliteration. | A long-standing, verified Quran text project that curates published translations. | Non-commercial use, verbatim, with attribution; other uses need the translator's or publisher's permission. |

`scripts/translation_sources.json` is the curated manifest: the preferred QuranEnc translation(s)
per language, the Tanzil fallbacks with translator names, the `recommended` language preset (about
60 languages) and each source's terms.

## Building

```bash
python scripts/build_translations.py                       # recommended preset, one per language
python scripts/build_translations.py --languages en,fr,ur --per-language 2
python scripts/build_translations.py --all                 # every QuranEnc language, plus Tanzil gaps
python scripts/build_translations.py --offline-dir DIR     # air-gapped: pre-downloaded files
```

- QuranEnc's catalogue (`/api/v1/translations/list`) is read live. For each wanted language the
  manifest's preferred keys come first, then the rest of that language's catalogue. If a translation
  fails validation, the next candidate is tried.
- Tanzil (`?transID=<id>&type=txt-2`) fills in the languages QuranEnc did not provide.
- **Validation:** a translation is installed only when it has exactly the 6,236 Ḥafṣ references,
  with no extras, and at least 98% of ayahs have text. Anything else is skipped with a warning.
- The output is `data/translations.db` (a generated artifact, git-ignored). It is written to a temp
  file and swapped in atomically; if nothing could be installed, the previous database is kept.
  The API reopens the file on its own after a swap.
- Downloads are cached in `data/translation_cache/`, so an interrupted build resumes.
- **Offline layout:** `quranenc/list.json`, `quranenc/<key>/<sura>.json`, `tanzil/<id>.txt`.

**Deploy:** the workflow builds translations in the background when the commit message carries
`[rebuild-translations]`, or when `data/translations.db` does not exist yet. The host needs
outbound HTTPS to `quranenc.com` and `tanzil.net`.

## Storage

- `translations(key, language, kind, name, translator, description, source, source_url, terms,
  version, direction, ayah_count, fetched_at)`. The key is `quranenc:<key>` or `tanzil:<id>`; `kind`
  is `translation` or `transliteration`.
- `translation_ayahs(key, surah, ayah, text, footnotes)`, stored verbatim.

## API

- `GET /api/translations` returns the installed translations with provenance
  (`TranslationInfo[]`), or `[]` when none are built.
- `GET /api/translations/ayahs?keys=k1,k2&refs=2:1-7,3:5` returns
  `{translations: TranslationMeta[], ayahs: [{surah, ayah, texts: [{key, text, footnotes?}]}]}`.
  - Keys are limited to 3 (unknown ones are ignored); refs to 400 ayahs (`422` beyond, or for a
    malformed ref).
  - Order follows the request.
- `UserPreferences.translations`: up to 3 keys, shown in that order.

## UI

- **Settings → «ترجمة المعاني»:** pick a language, then add or remove translations (at most three).
  Each shows its translator, source link and version, and a note says what a translation of
  meanings is.
- **Reader «آية آية»:** under each verse, each chosen translation appears in its own direction and
  script font (Noto faces loaded on demand by `lib/script-fonts.ts`), with a link to its source.
  QuranEnc footnotes sit behind «حواشٍ». Transliteration is set in italics.
- Translations use Ḥafṣ numbering, which matches the v1 Madani Ḥafṣ edition.
