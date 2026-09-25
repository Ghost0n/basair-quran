"""Offline data packs (scripts/build_offline_packs.py): the split into core +
downloadable packs must lose nothing and change nothing for the core narration."""
from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path

import pytest

from scripts import build_offline_packs as packs
from tests.conftest import create_test_db

CORE = 1
EXTRA = 2


def _add_second_narration(db: Path) -> None:
    """Copy the fixture narration (mushaf 1) as mushaf 2 with fresh ids, plus a page layout for mushaf 1."""
    connection = sqlite3.connect(db)
    connection.execute("INSERT INTO mushafs VALUES (?, 'Second narration', 'A downloadable narration')", (EXTRA,))
    offset = connection.execute("SELECT MAX(id) FROM ayahs").fetchone()[0]
    columns = [row[1] for row in connection.execute("PRAGMA table_info(ayahs)")]
    select = ", ".join(f"id + {offset}" if c == "id" else (str(EXTRA) if c == "mushaf_id" else c) for c in columns)
    connection.execute(f"INSERT INTO ayahs ({', '.join(columns)}) SELECT {select} FROM ayahs WHERE mushaf_id = ?", (CORE,))
    connection.execute(
        f"""INSERT INTO ayah_words SELECT ayah_id + {offset}, {EXTRA}, surah_id, number_in_surah, global_index,
            word_position, word_text || '-2', word_simple FROM ayah_words WHERE mushaf_id = ?""",
        (CORE,),
    )
    connection.execute(
        f"""INSERT INTO word_occurrences (root_id, ayah_id, word_position, word_text, word_simple)
            SELECT root_id, ayah_id + {offset}, word_position, word_text, word_simple FROM word_occurrences
            WHERE ayah_id IN (SELECT id FROM ayahs WHERE mushaf_id = ?)""",
        (CORE,),
    )
    connection.executescript(
        """
        CREATE TABLE mushaf_layout_meta (layout_id TEXT PRIMARY KEY, mushaf_id INTEGER NOT NULL,
            page_count INTEGER NOT NULL, source TEXT NOT NULL, source_ref TEXT);
        CREATE TABLE mushaf_layout_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, layout_id TEXT NOT NULL,
            mushaf_id INTEGER NOT NULL, page INTEGER NOT NULL, line_number INTEGER NOT NULL);
        CREATE TABLE mushaf_layout_words (id INTEGER PRIMARY KEY AUTOINCREMENT, line_id INTEGER NOT NULL,
            layout_id TEXT NOT NULL, mushaf_id INTEGER NOT NULL, surah_number INTEGER, ayah_number INTEGER,
            word_position INTEGER, position_in_line INTEGER);
        CREATE INDEX idx_layout_lines_page ON mushaf_layout_lines(layout_id, mushaf_id, page, line_number);
        INSERT INTO mushaf_layout_meta VALUES ('fixture', 1, 2, 'fixture', NULL);
        INSERT INTO mushaf_layout_lines (layout_id, mushaf_id, page, line_number) VALUES ('fixture', 1, 1, 1);
        INSERT INTO mushaf_layout_words (line_id, layout_id, mushaf_id, surah_number, ayah_number, word_position, position_in_line)
            VALUES (1, 'fixture', 1, 1, 1, 1, 1);
        """
    )
    connection.commit()
    connection.close()


def _translations_db(path: Path) -> None:
    connection = sqlite3.connect(path)
    connection.executescript(
        """
        CREATE TABLE translations (key TEXT PRIMARY KEY, language TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'translation',
            name TEXT NOT NULL, translator TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', source TEXT NOT NULL,
            source_url TEXT NOT NULL, version TEXT, direction TEXT);
        CREATE TABLE translation_ayahs (key TEXT NOT NULL, surah INTEGER NOT NULL, ayah INTEGER NOT NULL,
            text TEXT NOT NULL, footnotes TEXT, PRIMARY KEY (key, surah, ayah)) WITHOUT ROWID;
        """
    )
    rows = [
        ("quranenc:french_hameedullah", "fr", "translation", "Hamidullah", "Muhammad Hamidullah"),
        ("quranenc:french_montada", "fr", "translation", "Montada", "Montada Islamic Foundation"),
        ("tanzil:en.transliteration", "en", "transliteration", "Transliteration", "Tanzil"),
        ("tanzil:sw.barwani", "sw", "translation", "Al-Barwani", "Ali Muhsin Al-Barwani"),
    ]
    for key, language, kind, name, translator in rows:
        connection.execute(
            "INSERT INTO translations (key, language, kind, name, translator, source, source_url) VALUES (?, ?, ?, ?, ?, 'test', 'https://example.org')",
            (key, language, kind, name, translator),
        )
        connection.execute("INSERT INTO translation_ayahs VALUES (?, 1, 1, ?, NULL)", (key, f"{name} 1:1"))
    connection.commit()
    connection.close()


@pytest.fixture()
def sources(tmp_path: Path) -> dict:
    quran = tmp_path / "quran.db"
    create_test_db(quran)
    _add_second_narration(quran)
    translations = tmp_path / "translations.db"
    _translations_db(translations)
    locales = tmp_path / "locales"
    locales.mkdir()
    (locales / "fr.json").write_text('{"x": "y"}\n', encoding="utf-8")
    (locales / "en.json").write_text('{"x": "z"}\n', encoding="utf-8")
    locales_ts = tmp_path / "locales.ts"
    locales_ts.write_text(
        '{ code: "ar", native: "العربية", dir: "rtl" },\n{ code: "fr", native: "Français", dir: "ltr" },\n'
        '{ code: "en", native: "English", dir: "ltr" },\n',
        encoding="utf-8",
    )
    sources_json = tmp_path / "translation_sources.json"
    sources_json.write_text(json.dumps({"quranenc": {"preferred": {"fr": ["french_montada", "french_hameedullah"]}}}), encoding="utf-8")
    return {"quran_db": quran, "translations_db": translations, "locales_dir": locales,
            "locales_ts": locales_ts, "sources_path": sources_json}


def _build(sources: dict, output: Path) -> dict:
    return packs.build(**sources, output=output, core_mushaf=CORE, log=lambda _: None)


def _count(db: Path, sql: str, params: tuple = ()) -> int:
    with sqlite3.connect(db) as connection:
        return connection.execute(sql, params).fetchone()[0]


def test_core_holds_only_the_core_narration_and_the_shared_tables(sources, tmp_path):
    manifest = _build(sources, tmp_path / "out")
    core = tmp_path / "out" / "core.db"
    assert _count(core, "SELECT COUNT(*) FROM ayahs WHERE mushaf_id != ?", (CORE,)) == 0
    assert _count(core, "SELECT COUNT(*) FROM ayahs") == _count(sources["quran_db"], "SELECT COUNT(*) FROM ayahs WHERE mushaf_id = ?", (CORE,))
    # Shared: every narration's name (so the catalogue can list them), all roots.
    assert _count(core, "SELECT COUNT(*) FROM mushafs") == 2
    assert _count(core, "SELECT COUNT(*) FROM roots") == _count(sources["quran_db"], "SELECT COUNT(*) FROM roots")
    # The core narration's page layout ships with it; indexes are recreated.
    assert _count(core, "SELECT COUNT(*) FROM mushaf_layout_lines") == 1
    assert _count(core, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_layout_lines_page'") == 1
    assert manifest["core"]["mushaf_id"] == CORE


def test_a_narration_pack_holds_only_its_rows_with_original_ids(sources, tmp_path):
    manifest = _build(sources, tmp_path / "out")
    [pack] = [p for p in manifest["packs"] if p["kind"] == "narration"]
    assert pack["mushaf_id"] == EXTRA and pack["name"] == "Second narration"
    path = tmp_path / "out" / pack["file"]
    assert _count(path, "SELECT COUNT(*) FROM ayahs WHERE mushaf_id != ?", (EXTRA,)) == 0
    source_ids = {row[0] for row in sqlite3.connect(sources["quran_db"]).execute("SELECT id FROM ayahs WHERE mushaf_id = ?", (EXTRA,))}
    pack_ids = {row[0] for row in sqlite3.connect(path).execute("SELECT id FROM ayahs")}
    assert pack_ids == source_ids
    assert _count(path, "SELECT COUNT(*) FROM word_occurrences") == pack["rows"]["word_occurrences"] > 0


def test_manifest_sizes_and_checksums_match_the_files(sources, tmp_path):
    manifest = _build(sources, tmp_path / "out")
    for entry in [manifest["core"], *[p for p in manifest["packs"] if "file" in p]]:
        path = tmp_path / "out" / entry["file"]
        assert entry["size"] == path.stat().st_size
        assert entry["sha256"] == hashlib.sha256(path.read_bytes()).hexdigest()


def test_reassembling_core_and_all_packs_gives_back_the_source(sources, tmp_path):
    _build(sources, tmp_path / "out")
    assert packs.verify_reassembly(sources["quran_db"], tmp_path / "out") == []


def test_core_narration_answers_identically_on_core_and_full_db(sources, tmp_path):
    _build(sources, tmp_path / "out")
    requests = ["/api/search-v2?q=shared&mode=exact&mushaf={m}", "/api/quran-page?mushaf={m}&page=1", "/api/surahs?mushaf={m}"]
    assert packs.verify_parity(sources["quran_db"], tmp_path / "out", CORE, requests) == []


def test_versions_follow_the_data_not_the_build(sources, tmp_path):
    first = _build(sources, tmp_path / "a")
    second = _build(sources, tmp_path / "b")
    versions = lambda m: {p["id"]: p["version"] for p in [m["core"], *m["packs"]] if "version" in p}  # noqa: E731
    assert versions(first) == versions(second)

    with sqlite3.connect(sources["quran_db"]) as connection:
        connection.execute("UPDATE ayahs SET text_uthmani = text_uthmani || ' ' WHERE mushaf_id = ? AND number_in_surah = 1", (EXTRA,))
    third = _build(sources, tmp_path / "c")
    changed = {k for k in versions(first) if versions(first)[k] != versions(third)[k]}
    assert changed == {f"narration-{EXTRA}"}


def test_one_language_choice_maps_to_interface_and_recommended_translation(sources, tmp_path):
    manifest = _build(sources, tmp_path / "out")
    languages = {entry["code"]: entry for entry in manifest["languages"]}
    # QuranEnc's preferred French translation, not the alphabetically first one.
    assert languages["fr"]["interface"] == "interface-fr"
    assert languages["fr"]["translation"] == "translation-quranenc-french_montada"
    # Arabic: the interface only — readers read the Quran itself.
    assert languages["ar"] == {"code": "ar", "native": "العربية", "dir": "rtl", "interface": "interface-ar", "translation": None}
    # A transliteration is never installed as "the" translation.
    assert languages["en"]["translation"] is None
    # A translation-only language (no interface dictionary yet) is still offered.
    assert languages["sw"]["interface"] is None and languages["sw"]["translation"] == "translation-tanzil-sw.barwani"
    assert json.loads((tmp_path / "out" / "interface-ar.json").read_text(encoding="utf-8")) == {}


def test_reciters_are_listed_for_on_demand_audio(sources, tmp_path):
    manifest = _build(sources, tmp_path / "out")
    reciters = [p for p in manifest["packs"] if p["kind"] == "reciter"]
    assert reciters and all(r["audio_base"].startswith("https://") and "file" not in r for r in reciters)


def test_a_failed_build_leaves_the_previous_output_untouched(sources, tmp_path, monkeypatch):
    output = tmp_path / "out"
    _build(sources, output)
    before = (output / "manifest.json").read_text(encoding="utf-8")

    def boom(*args, **kwargs):
        raise RuntimeError("disk full")

    monkeypatch.setattr(packs, "build_translation", boom)
    with pytest.raises(RuntimeError):
        _build(sources, output)
    assert (output / "manifest.json").read_text(encoding="utf-8") == before
    assert not [p for p in tmp_path.iterdir() if p.name.startswith(".offline-")]
