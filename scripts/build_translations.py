"""Build data/translations.db — Quran translations of meanings from trusted sources.

Sources (scripts/translation_sources.json):

* QuranEnc (primary) — https://quranenc.com, the Noble Quran Encyclopedia's
  reviewed translations. Its catalogue is read live, so every language it
  publishes can be installed; the manifest only says which translation to
  prefer per language.
* Tanzil (secondary) — https://tanzil.net/trans/, for languages QuranEnc does
  not cover (and the Latin transliteration).

Every text is stored verbatim with its source, translator, version and terms.
A translation is installed only when it covers all 6,236 ayahs (Ḥafṣ
numbering); anything partial or malformed is skipped with a warning.

Usage:
    python scripts/build_translations.py                    # recommended preset, 1 per language
    python scripts/build_translations.py --languages en,fr,ur --per-language 2
    python scripts/build_translations.py --all              # every QuranEnc language + Tanzil gaps
    python scripts/build_translations.py --offline-dir DIR  # pre-downloaded files, no network

Downloads are cached under data/translation_cache/ so an interrupted build
resumes. The database is written to a temp file and swapped in atomically.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = Path(__file__).resolve().parent / "translation_sources.json"
DEFAULT_DB = ROOT / "data" / "translations.db"
DEFAULT_CACHE = ROOT / "data" / "translation_cache"

TOTAL_AYAHS = 6236
SURAH_COUNT = 114
# Ayah counts per surah (Ḥafṣ ʿan ʿĀṣim, Kufan count).
SURAH_AYAHS = [
    7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
    112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
    54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
    14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
    29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
    11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
]
assert len(SURAH_AYAHS) == SURAH_COUNT and sum(SURAH_AYAHS) == TOTAL_AYAHS

RTL_LANGUAGES = {"ar", "fa", "ur", "ps", "sd", "ug", "dv", "ku", "ckb", "he", "yi", "ks"}

Fetcher = Callable[[str], bytes]


class TranslationError(ValueError):
    pass


@dataclass
class Translation:
    key: str
    language: str
    name: str
    translator: str
    source: str
    source_url: str
    version: str
    direction: str
    kind: str = "translation"
    description: str = ""
    ayahs: dict[tuple[int, int], tuple[str, str | None]] = field(default_factory=dict)


def load_manifest(path: Path = MANIFEST) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def http_fetcher(cache_dir: Path | None, delay: float = 0.2, retries: int = 3) -> Fetcher:
    """GET with an on-disk cache (one file per URL) and polite retries."""

    def fetch(url: str) -> bytes:
        cached = None
        if cache_dir is not None:
            cache_dir.mkdir(parents=True, exist_ok=True)
            cached = cache_dir / urllib.parse.quote(url, safe="")[:240]
            if cached.exists() and cached.stat().st_size > 0:
                return cached.read_bytes()
        last: Exception | None = None
        for attempt in range(retries):
            try:
                request = urllib.request.Request(url, headers={"User-Agent": "Q-Basair translation builder"})
                with urllib.request.urlopen(request, timeout=60) as response:
                    body = response.read()
                if cached is not None:
                    cached.write_bytes(body)
                time.sleep(delay)
                return body
            except Exception as exc:  # noqa: BLE001 — network errors of any kind are retried
                last = exc
                time.sleep(delay * (attempt + 2) * 4)
        raise TranslationError(f"GET {url} failed: {last}")

    return fetch


def offline_fetcher(directory: Path) -> Fetcher:
    """Serve pre-downloaded files: `quranenc/list.json`, `quranenc/<key>/<sura>.json`, `tanzil/<id>.txt`."""

    def fetch(url: str) -> bytes:
        parsed = urllib.parse.urlparse(url)
        if "quranenc" in parsed.netloc:
            parts = [part for part in parsed.path.split("/") if part]
            if "list" in parts:
                return (directory / "quranenc" / "list.json").read_bytes()
            key, sura = parts[-2], parts[-1]
            return (directory / "quranenc" / key / f"{sura}.json").read_bytes()
        trans_id = urllib.parse.parse_qs(parsed.query).get("transID", [""])[0]
        return (directory / "tanzil" / f"{trans_id}.txt").read_bytes()

    return fetch


# ----------------------------------------------------------------------
# QuranEnc
# ----------------------------------------------------------------------


def quranenc_catalogue(manifest: dict, fetch: Fetcher) -> list[dict]:
    api = manifest["sources"]["quranenc"]["api"]
    payload = json.loads(fetch(f"{api}/translations/list"))
    return [entry for entry in payload.get("translations", []) if entry.get("key")]


def choose_quranenc(manifest: dict, catalogue: list[dict], languages: list[str] | None) -> list[tuple[str, list[dict]]]:
    """Candidates per wanted language, best first: the manifest's preferred keys
    (in order), then the rest of the catalogue for that language."""
    config = manifest.get("quranenc", {})
    preferred: dict[str, list[str]] = config.get("preferred", {})
    excluded = set(config.get("exclude", []))
    by_language: dict[str, list[dict]] = {}
    for entry in catalogue:
        if entry["key"] in excluded:
            continue
        by_language.setdefault(normalise_language(entry.get("language_iso_code", "")), []).append(entry)
    wanted = languages if languages is not None else sorted(by_language)
    chosen: list[tuple[str, list[dict]]] = []
    for language in wanted:
        entries = by_language.get(language, [])
        if not entries:
            continue
        rank = {key: index for index, key in enumerate(preferred.get(language, []))}
        chosen.append((language, sorted(entries, key=lambda entry: (rank.get(entry["key"], len(rank)), entry["key"]))))
    return chosen


def normalise_language(code: str) -> str:
    code = (code or "").strip().lower().replace("_", "-")
    return {"zh-cn": "zh", "zh-tw": "zh", "pt-br": "pt", "ckb": "ku", "fil": "tl"}.get(code, code.split("-")[0])


def fetch_quranenc(manifest: dict, entry: dict, fetch: Fetcher) -> Translation:
    api = manifest["sources"]["quranenc"]["api"]
    language = normalise_language(entry.get("language_iso_code", ""))
    translation = Translation(
        key=f"quranenc:{entry['key']}",
        language=language,
        name=(entry.get("title") or entry["key"]).strip(),
        translator=(entry.get("title") or "").strip(),
        source="quranenc",
        source_url=f"https://quranenc.com/en/browse/{entry['key']}",
        version=str(entry.get("version") or entry.get("last_update") or ""),
        direction=(entry.get("direction") or ("rtl" if language in RTL_LANGUAGES else "ltr")).lower(),
        description=(entry.get("description") or "").strip(),
    )
    for sura in range(1, SURAH_COUNT + 1):
        payload = json.loads(fetch(f"{api}/translation/sura/{entry['key']}/{sura}"))
        for row in payload.get("result", []):
            text = (row.get("translation") or "").strip()
            footnotes = (row.get("footnotes") or "").strip() or None
            translation.ayahs[(int(row["sura"]), int(row["aya"]))] = (text, footnotes)
    return translation


# ----------------------------------------------------------------------
# Tanzil
# ----------------------------------------------------------------------


def parse_tanzil(body: str) -> dict[tuple[int, int], tuple[str, None]]:
    """`sura|aya|text` lines; `#` lines are the licence/metadata footer.

    Lines end at "\n" only: `str.splitlines()` would also break on U+0085,
    which some Tanzil files carry inside an ayah as a mis-decoded Windows-1252
    ellipsis (byte 0x85). That one character is restored to "…" — an encoding
    repair, not an edit of the translation.
    """
    ayahs: dict[tuple[int, int], tuple[str, None]] = {}
    for line in body.replace("\x85", "\u2026").split("\n"):
        line = line.strip("﻿").rstrip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("|", 2)
        if len(parts) != 3 or not parts[0].isdigit() or not parts[1].isdigit():
            raise TranslationError(f"Unexpected Tanzil line: {line[:80]}")
        ayahs[(int(parts[0]), int(parts[1]))] = (parts[2].strip(), None)
    return ayahs


def fetch_tanzil(manifest: dict, item: dict, fetch: Fetcher) -> Translation:
    url = manifest["sources"]["tanzil"]["download"].format(id=item["id"])
    language = normalise_language(item["language"])
    translation = Translation(
        key=f"tanzil:{item['id']}",
        language=language,
        name=item.get("name") or item["id"],
        translator=item.get("translator") or "",
        source="tanzil",
        source_url=f"https://tanzil.net/trans/{item['id']}",
        version=item.get("version", ""),
        direction="rtl" if language in RTL_LANGUAGES else "ltr",
        kind=item.get("kind", "translation"),
    )
    translation.ayahs = parse_tanzil(fetch(url).decode("utf-8"))
    return translation


# ----------------------------------------------------------------------
# Validation & storage
# ----------------------------------------------------------------------


def validate(translation: Translation) -> None:
    expected = {(sura, ayah) for sura in range(1, SURAH_COUNT + 1) for ayah in range(1, SURAH_AYAHS[sura - 1] + 1)}
    present = set(translation.ayahs)
    missing = expected - present
    extra = present - expected
    if missing or extra:
        raise TranslationError(
            f"{translation.key}: {len(missing)} ayahs missing, {len(extra)} unexpected references (Ḥafṣ numbering expected)"
        )
    filled = sum(1 for text, _ in translation.ayahs.values() if text)
    if filled < TOTAL_AYAHS * 0.98:
        raise TranslationError(f"{translation.key}: only {filled} of {TOTAL_AYAHS} ayahs have text")


SCHEMA = """
CREATE TABLE translations (
    key TEXT PRIMARY KEY,
    language TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'translation',
    name TEXT NOT NULL,
    translator TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL,
    source_url TEXT NOT NULL,
    terms TEXT NOT NULL,
    version TEXT NOT NULL,
    direction TEXT NOT NULL,
    ayah_count INTEGER NOT NULL,
    fetched_at INTEGER NOT NULL
);
CREATE TABLE translation_ayahs (
    key TEXT NOT NULL,
    surah INTEGER NOT NULL,
    ayah INTEGER NOT NULL,
    text TEXT NOT NULL,
    footnotes TEXT,
    PRIMARY KEY (key, surah, ayah)
) WITHOUT ROWID;
CREATE TABLE build_info (name TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


def write_database(path: Path, translations: list[Translation], manifest: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".db.tmp")
    if temp.exists():
        temp.unlink()
    connection = sqlite3.connect(temp)
    try:
        connection.executescript(SCHEMA)
        now = int(time.time())
        for translation in translations:
            connection.execute(
                "INSERT INTO translations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    translation.key,
                    translation.language,
                    translation.kind,
                    translation.name,
                    translation.translator,
                    translation.description,
                    translation.source,
                    translation.source_url,
                    manifest["sources"][translation.source]["terms"],
                    translation.version,
                    translation.direction,
                    len(translation.ayahs),
                    now,
                ),
            )
            connection.executemany(
                "INSERT INTO translation_ayahs VALUES (?, ?, ?, ?, ?)",
                [
                    (translation.key, sura, ayah, text, footnotes)
                    for (sura, ayah), (text, footnotes) in sorted(translation.ayahs.items())
                ],
            )
        connection.execute("INSERT INTO build_info VALUES ('manifest_version', ?)", (str(manifest.get("version", 1)),))
        connection.execute("INSERT INTO build_info VALUES ('built_at', ?)", (str(int(time.time())),))
        connection.commit()
        connection.execute("VACUUM")
    finally:
        connection.close()
    os.replace(temp, path)


def build(
    *,
    fetch: Fetcher,
    output: Path,
    languages: list[str] | None,
    per_language: int = 1,
    with_transliteration: bool = True,
    manifest: dict | None = None,
    log: Callable[[str], None] = print,
) -> list[Translation]:
    """Resolve, download, validate and store. `languages=None` means every language available."""
    manifest = manifest or load_manifest()
    installed: list[Translation] = []
    covered: set[str] = set()

    try:
        catalogue = quranenc_catalogue(manifest, fetch)
    except Exception as exc:  # noqa: BLE001 — fall back to Tanzil when QuranEnc is unreachable
        log(f"! QuranEnc catalogue unavailable ({exc}); using Tanzil only")
        catalogue = []
    for language, candidates in choose_quranenc(manifest, catalogue, languages):
        count = 0
        for entry in candidates:
            if count >= per_language:
                break
            try:
                translation = fetch_quranenc(manifest, entry, fetch)
                validate(translation)
            except Exception as exc:  # noqa: BLE001 — a bad translation falls back to the next candidate
                log(f"! skipped {entry.get('key')}: {exc}")
                continue
            installed.append(translation)
            covered.add(language)
            count += 1
            log(f"+ {translation.key} ({language})")

    for item in manifest.get("tanzil", []):
        language = normalise_language(item["language"])
        is_transliteration = item.get("kind") == "transliteration"
        if is_transliteration and not with_transliteration:
            continue
        if not is_transliteration:
            if languages is not None and language not in languages:
                continue
            if language in covered:
                continue
        try:
            translation = fetch_tanzil(manifest, item, fetch)
            validate(translation)
        except Exception as exc:  # noqa: BLE001
            log(f"! skipped tanzil:{item['id']}: {exc}")
            continue
        installed.append(translation)
        if not is_transliteration:
            covered.add(language)
        log(f"+ {translation.key} ({translation.language}, Tanzil)")

    if not installed:
        raise TranslationError("No translation could be installed; the existing database was left untouched.")
    write_database(output, installed, manifest)
    missing = sorted(set(languages or []) - covered)
    log(f"Installed {len(installed)} translations in {len(covered)} languages → {output}")
    if missing:
        log(f"No trusted translation found for: {', '.join(missing)}")
    return installed


def main(argv: list[str] | None = None) -> int:
    # Translator names and the log's arrows are not in the Windows console's
    # code page: never let printing a line abort a finished build.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--languages", help="Comma-separated ISO 639-1 codes (default: the recommended preset)")
    parser.add_argument("--all", action="store_true", help="Every language QuranEnc publishes, plus Tanzil gaps")
    parser.add_argument("--per-language", type=int, default=1, help="Translations per language (default 1)")
    parser.add_argument("--no-transliteration", action="store_true")
    parser.add_argument("--output", default=os.environ.get("QBASAIR_TRANSLATIONS_DB_PATH", str(DEFAULT_DB)))
    parser.add_argument("--cache-dir", default=str(DEFAULT_CACHE))
    parser.add_argument("--offline-dir", help="Read pre-downloaded files instead of the network")
    args = parser.parse_args(argv)

    manifest = load_manifest()
    if args.all:
        languages = None
    elif args.languages:
        languages = [normalise_language(code) for code in args.languages.split(",") if code.strip()]
    else:
        languages = list(manifest["presets"]["recommended"])
    fetch = offline_fetcher(Path(args.offline_dir)) if args.offline_dir else http_fetcher(Path(args.cache_dir))
    try:
        build(
            fetch=fetch,
            output=Path(args.output),
            languages=languages,
            per_language=max(1, args.per_language),
            with_transliteration=not args.no_transliteration,
            manifest=manifest,
        )
    except TranslationError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
