"""Build the offline data packs for the standalone (Android) app.

The phone ships with a small *core* and downloads everything else on demand:

* ``core.db`` — the shared tables (surahs, roots, morphology variants, the
  mushaf list) plus the default narration (Ḥafṣ, with its Madani page layout)
  and every index, so any pack installed later is searchable immediately.
* ``narration-<id>.db`` — one per other narration (Qālūn, Warsh, …): only that
  narration's rows of ``ayahs``, ``ayah_words``, ``word_occurrences`` and its
  page layout, with their original ids. Installing a pack is a plain insert
  into the device database; removing it is a delete by ``mushaf_id``.
* ``translation-<key>.db`` — one per translation of meanings (verbatim text,
  translator, source and version from ``data/translations.db``).
* ``interface-<code>.json`` — one interface dictionary per language (Arabic is
  the source language and ships as an empty dictionary).
* ``manifest.json`` — every pack with its kind, size, SHA-256 and a content
  version (a digest of its rows, so it only changes when the data does); the
  reciters (audio is fetched per surah from their public ``audio_base``); and
  the languages offered at onboarding, each mapped to its interface pack and
  its recommended translation (one choice gives both).

``--verify`` proves the split loses nothing: core + all narration packs
reassembled equal the source database table by table, and search / reader
answers for the core narration are identical on ``core.db`` and on the full
database.

Usage:
    python scripts/build_offline_packs.py [--output build/offline] [--verify]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable

ROOT = Path(__file__).resolve().parents[1]
FORMAT_VERSION = 1
CORE_MUSHAF_ID = 2  # حفص عن عاصم — the Madani mushaf with its page layout

SHARED_TABLES = ("mushafs", "surahs", "roots", "morphology_search_variants")
LAYOUT_TABLES = ("mushaf_layout_meta", "mushaf_layout_lines", "mushaf_layout_words")


# --------------------------------------------------------------------------
# Row selection per narration
# --------------------------------------------------------------------------


def _mushaf_filters(mushaf_id: int) -> dict[str, tuple[str, tuple]]:
    """WHERE clause per per-narration table, selecting one narration's rows."""
    ayah_ids = "SELECT id FROM ayahs WHERE mushaf_id = ?"
    return {
        "ayahs": ("mushaf_id = ?", (mushaf_id,)),
        "ayah_words": ("mushaf_id = ?", (mushaf_id,)),
        "word_occurrences": (f"ayah_id IN ({ayah_ids})", (mushaf_id,)),
        "mushaf_layout_meta": ("mushaf_id = ?", (mushaf_id,)),
        "mushaf_layout_lines": ("mushaf_id = ?", (mushaf_id,)),
        "mushaf_layout_words": ("mushaf_id = ?", (mushaf_id,)),
    }


def _tables(connection: sqlite3.Connection) -> list[str]:
    return [
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
    ]


def _table_sql(connection: sqlite3.Connection, table: str) -> str:
    row = connection.execute("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)).fetchone()
    return row[0]


def _index_sql(connection: sqlite3.Connection, tables: Iterable[str]) -> list[str]:
    wanted = set(tables)
    return [
        sql
        for name, table, sql in connection.execute(
            "SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name"
        )
        if table in wanted
    ]


def _columns(connection: sqlite3.Connection, table: str) -> list[str]:
    return [row[1] for row in connection.execute(f'PRAGMA table_info("{table}")')]


def _order_by(connection: sqlite3.Connection, table: str) -> str:
    """A total, stable order for a table's rows (its primary key, or all columns)."""
    keys = [row[1] for row in sorted(connection.execute(f'PRAGMA table_info("{table}")'), key=lambda r: r[5]) if row[5]]
    return ", ".join(f'"{k}"' for k in (keys or _columns(connection, table)))


def _copy_rows(source: sqlite3.Connection, target: sqlite3.Connection, table: str, where: str = "", params: tuple = ()) -> int:
    columns = _columns(source, table)
    column_list = ", ".join(f'"{c}"' for c in columns)
    query = f'SELECT {column_list} FROM "{table}"' + (f" WHERE {where}" if where else "") + f" ORDER BY {_order_by(source, table)}"
    placeholders = ", ".join("?" for _ in columns)
    count = 0
    cursor = source.execute(query, params)
    while True:
        rows = cursor.fetchmany(5000)
        if not rows:
            break
        target.executemany(f'INSERT INTO "{table}" ({column_list}) VALUES ({placeholders})', rows)
        count += len(rows)
    return count


def table_digest(connection: sqlite3.Connection, table: str, where: str = "", params: tuple = ()) -> tuple[int, str]:
    """(row count, SHA-256 of the rows in a stable order) — the content identity of a table slice."""
    columns = ", ".join(f'"{c}"' for c in _columns(connection, table))
    query = f'SELECT {columns} FROM "{table}"' + (f" WHERE {where}" if where else "") + f" ORDER BY {_order_by(connection, table)}"
    digest = hashlib.sha256()
    count = 0
    for row in connection.execute(query, params):
        digest.update(json.dumps(row, ensure_ascii=False, default=str).encode("utf-8"))
        digest.update(b"\n")
        count += 1
    return count, digest.hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _finish_db(connection: sqlite3.Connection, info: dict[str, str]) -> None:
    connection.execute("CREATE TABLE pack_info (name TEXT PRIMARY KEY, value TEXT NOT NULL)")
    connection.executemany("INSERT INTO pack_info VALUES (?, ?)", sorted(info.items()))
    connection.commit()
    connection.execute("VACUUM")
    connection.close()


# --------------------------------------------------------------------------
# Builders
# --------------------------------------------------------------------------


def build_core(source: sqlite3.Connection, path: Path, mushaf_id: int) -> dict:
    tables = [t for t in _tables(source) if t in SHARED_TABLES or t in _mushaf_filters(mushaf_id)]
    target = sqlite3.connect(path)
    for table in tables:
        target.execute(_table_sql(source, table))
    rows: dict[str, int] = {}
    digest = hashlib.sha256()
    filters = _mushaf_filters(mushaf_id)
    for table in tables:
        where, params = filters.get(table, ("", ()))
        rows[table] = _copy_rows(source, target, table, where, params)
        digest.update(f"{table}:{table_digest(source, table, where, params)[1]}".encode())
    target.commit()
    # Every index of the source, so installed narration packs are searchable too.
    for sql in _index_sql(source, tables):
        target.execute(sql)
    version = digest.hexdigest()[:16]
    _finish_db(target, {"kind": "core", "mushaf_id": str(mushaf_id), "version": version, "format": str(FORMAT_VERSION)})
    return {"rows": rows, "version": version}


def build_narration(source: sqlite3.Connection, path: Path, mushaf_id: int) -> dict:
    filters = _mushaf_filters(mushaf_id)
    tables = [t for t in _tables(source) if t in filters]
    target = sqlite3.connect(path)
    for table in tables:
        target.execute(_table_sql(source, table))
    rows: dict[str, int] = {}
    digest = hashlib.sha256()
    for table in tables:
        where, params = filters[table]
        rows[table] = _copy_rows(source, target, table, where, params)
        digest.update(f"{table}:{table_digest(source, table, where, params)[1]}".encode())
    version = digest.hexdigest()[:16]
    _finish_db(target, {"kind": "narration", "mushaf_id": str(mushaf_id), "version": version, "format": str(FORMAT_VERSION)})
    return {"rows": {k: v for k, v in rows.items() if v}, "version": version}


def build_translation(source: sqlite3.Connection, path: Path, key: str) -> dict:
    target = sqlite3.connect(path)
    for table in ("translations", "translation_ayahs"):
        target.execute(_table_sql(source, table))
    rows = {
        "translations": _copy_rows(source, target, "translations", "key = ?", (key,)),
        "translation_ayahs": _copy_rows(source, target, "translation_ayahs", "key = ?", (key,)),
    }
    digest = hashlib.sha256()
    for table in ("translations", "translation_ayahs"):
        digest.update(table_digest(source, table, "key = ?", (key,))[1].encode())
    version = digest.hexdigest()[:16]
    _finish_db(target, {"kind": "translation", "key": key, "version": version, "format": str(FORMAT_VERSION)})
    return {"rows": rows, "version": version}


def _interface_locales(locales_dir: Path, locales_ts: Path) -> dict[str, dict]:
    """code -> {native, dir} from lib/i18n/locales.ts; dictionaries from locales/<code>.json."""
    text = locales_ts.read_text(encoding="utf-8") if locales_ts.exists() else ""
    found: dict[str, dict] = {}
    for match in re.finditer(r'\{\s*code:\s*"([a-z-]+)",\s*native:\s*"([^"]+)",\s*dir:\s*"(rtl|ltr)"', text):
        code, native, direction = match.groups()
        found[code] = {"native": native, "dir": direction}
    for path in sorted(locales_dir.glob("*.json")):
        found.setdefault(path.stem, {"native": None, "dir": "ltr"})
    found.setdefault("ar", {"native": "العربية", "dir": "rtl"})
    return found


def recommended_translations(translations: list[dict], sources: dict) -> dict[str, str]:
    """language -> the translation installed with that language (QuranEnc's preferred first)."""
    by_language: dict[str, list[dict]] = {}
    for item in translations:
        if item.get("kind", "translation") != "translation":
            continue
        by_language.setdefault(item["language"], []).append(item)
    preferred = sources.get("quranenc", {}).get("preferred", {})
    chosen: dict[str, str] = {}
    for language, items in by_language.items():
        keys = [item["key"] for item in items]
        pick = next((f"quranenc:{k}" for k in preferred.get(language, []) if f"quranenc:{k}" in keys), None)
        pick = pick or next((k for k in keys if k.startswith("quranenc:")), None) or sorted(keys)[0]
        chosen[language] = pick
    return chosen


def _reciters() -> list[dict]:
    sys.path.insert(0, str(ROOT))
    try:
        from src.app.services.reciter_service import RECITERS  # noqa: WPS433
    finally:
        sys.path.pop(0)
    return [
        {
            "id": f"reciter-{r['id']}",
            "kind": "reciter",
            "reciter": r["id"],
            "name": r["name"],
            "name_english": r.get("name_english"),
            "riwayah": r.get("riwayah"),
            "style": r.get("style"),
            "audio_base": r["audio_base"],
            "file_pattern": "{surah:03d}{ayah:03d}.mp3",
        }
        for r in RECITERS
    ]


def build(
    *,
    quran_db: Path,
    translations_db: Path | None,
    locales_dir: Path,
    locales_ts: Path,
    sources_path: Path,
    output: Path,
    core_mushaf: int = CORE_MUSHAF_ID,
    log: Callable[[str], None] = print,
) -> dict:
    """Build every pack into a fresh directory, then swap it into ``output`` atomically."""
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".offline-", dir=output.parent))
    try:
        source = sqlite3.connect(f"file:{quran_db}?mode=ro", uri=True)
        mushafs = source.execute("SELECT id, name, description FROM mushafs ORDER BY id").fetchall()
        if core_mushaf not in {m[0] for m in mushafs}:
            raise SystemExit(f"core mushaf {core_mushaf} is not in {quran_db}")

        def entry(pack_id: str, kind: str, file: str, meta: dict, **extra) -> dict:
            path = staging / file
            return {"id": pack_id, "kind": kind, "file": file, "size": path.stat().st_size,
                    "sha256": _sha256_file(path), "version": meta["version"], **extra}

        core = build_core(source, staging / "core.db", core_mushaf)
        core_name = next(m for m in mushafs if m[0] == core_mushaf)
        log(f"core: mushaf {core_mushaf} ({core_name[1]}) {core['rows']}")
        manifest: dict = {
            "format": FORMAT_VERSION,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "core": entry("core", "core", "core.db", core, mushaf_id=core_mushaf, name=core_name[1]),
            "packs": [],
            "languages": [],
        }
        for mushaf_id, name, description in mushafs:
            if mushaf_id == core_mushaf:
                continue
            file = f"narration-{mushaf_id}.db"
            meta = build_narration(source, staging / file, mushaf_id)
            manifest["packs"].append(entry(f"narration-{mushaf_id}", "narration", file, meta,
                                           mushaf_id=mushaf_id, name=name, description=description, rows=meta["rows"]))
            log(f"narration {mushaf_id} ({name}): {meta['rows']}")
        source.close()

        translation_items: list[dict] = []
        if translations_db and translations_db.exists():
            tsource = sqlite3.connect(f"file:{translations_db}?mode=ro", uri=True)
            tsource.row_factory = sqlite3.Row
            translation_items = [dict(r) for r in tsource.execute("SELECT * FROM translations ORDER BY key")]
            tsource.row_factory = None
            for item in translation_items:
                slug = re.sub(r"[^a-z0-9_.-]+", "-", item["key"].lower())
                file = f"translation-{slug}.db"
                meta = build_translation(tsource, staging / file, item["key"])
                manifest["packs"].append(entry(f"translation-{slug}", "translation", file, meta,
                                               key=item["key"], language=item["language"], name=item["name"],
                                               translator=item["translator"], source=item["source"],
                                               source_url=item["source_url"], translation_kind=item.get("kind", "translation")))
            tsource.close()
            log(f"translations: {len(translation_items)}")
        else:
            log("translations: none (data/translations.db missing — run scripts/build_translations.py)")

        interface = _interface_locales(locales_dir, locales_ts)
        for code, info in sorted(interface.items()):
            file = f"interface-{code}.json"
            source_file = locales_dir / f"{code}.json"
            # Arabic is the source language: its "dictionary" is empty.
            content = source_file.read_text(encoding="utf-8") if source_file.exists() else "{}\n"
            (staging / file).write_text(content, encoding="utf-8")
            version = hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]
            manifest["packs"].append(entry(f"interface-{code}", "interface", file, {"version": version},
                                           language=code, native=info["native"], dir=info["dir"]))

        manifest["packs"].extend(_reciters())

        sources = json.loads(sources_path.read_text(encoding="utf-8")) if sources_path.exists() else {}
        recommended = recommended_translations(translation_items, sources)
        pack_by_key = {p["key"]: p["id"] for p in manifest["packs"] if p["kind"] == "translation"}
        for code in sorted(set(interface) | set(recommended)):
            info = interface.get(code, {"native": None, "dir": None})
            manifest["languages"].append({
                "code": code,
                "native": info["native"],
                "dir": info["dir"],
                "interface": f"interface-{code}" if code in interface else None,
                # Arabic readers read the Quran itself: no translation is installed with it.
                "translation": None if code == "ar" else (pack_by_key.get(recommended[code]) if code in recommended else None),
            })

        (staging / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        if output.exists():
            shutil.rmtree(output)
        staging.rename(output)
        return manifest
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise


# --------------------------------------------------------------------------
# Verification
# --------------------------------------------------------------------------


def reassemble(output: Path, target: Path) -> None:
    """core.db + every narration pack → one database (what a phone with every pack installed holds)."""
    shutil.copyfile(output / "core.db", target)
    connection = sqlite3.connect(target)
    manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
    for pack in manifest["packs"]:
        if pack["kind"] != "narration":
            continue
        connection.execute("ATTACH DATABASE ? AS pack", (str(output / pack["file"]),))
        for (table,) in connection.execute("SELECT name FROM pack.sqlite_master WHERE type = 'table' AND name != 'pack_info'").fetchall():
            connection.execute(f'INSERT INTO main."{table}" SELECT * FROM pack."{table}"')
        connection.commit()
        connection.execute("DETACH DATABASE pack")
    connection.execute("DROP TABLE pack_info")
    connection.commit()
    connection.close()


def verify_reassembly(quran_db: Path, output: Path) -> list[str]:
    problems: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        merged = Path(tmp) / "merged.db"
        reassemble(output, merged)
        src = sqlite3.connect(f"file:{quran_db}?mode=ro", uri=True)
        dst = sqlite3.connect(merged)
        for table in _tables(src):
            if table_digest(src, table) != table_digest(dst, table):
                problems.append(f"table {table} differs after reassembly")
        src.close()
        dst.close()
    return problems


PARITY_REQUESTS = [
    "/api/search-v2?q=رحم&mode=root&mushaf={m}",
    "/api/search-v2?q=الحمد&mode=exact&mushaf={m}",
    "/api/search-v2?q=صراط مستقيم&mode=exact&mushaf={m}",
    "/api/search-v2?q=كتب&mode=root&mushaf={m}",
    "/api/search-v2?q=قال&mode=exact&mushaf={m}",
    "/api/quran-page?mushaf={m}&page=1",
    "/api/quran-page?mushaf={m}&page=50",
    "/api/mushaf-page-layout?mushaf={m}&page=604",
    "/api/ayah-reader?mushaf={m}&ayah_id={ayah}",
    "/api/surahs?mushaf={m}",
]


def verify_parity(quran_db: Path, output: Path, core_mushaf: int, requests: list[str] = PARITY_REQUESTS) -> list[str]:
    """The core narration answers the same on core.db as on the full database."""
    sys.path.insert(0, str(ROOT))
    try:
        from fastapi.testclient import TestClient  # noqa: WPS433

        from src import main  # noqa: WPS433
    finally:
        sys.path.pop(0)

    with sqlite3.connect(f"file:{quran_db}?mode=ro", uri=True) as lookup:
        row = lookup.execute(
            "SELECT id FROM ayahs WHERE mushaf_id = ? ORDER BY surah_id DESC, number_in_surah DESC LIMIT 1", (core_mushaf,)
        ).fetchone()
    last_ayah = row[0] if row else 1

    def answers(db: Path) -> list[tuple[int, str]]:
        original = main.get_db_path()
        main.close_db_connection()
        main.set_db_path(str(db))
        try:
            with TestClient(main.app) as client:
                out = []
                for template in requests:
                    response = client.get(template.format(m=core_mushaf, ayah=last_ayah))
                    out.append((response.status_code, response.text))
                return out
        finally:
            main.close_db_connection()
            main.set_db_path(original)

    problems = []
    full, core = answers(quran_db), answers(output / "core.db")
    for template, a, b in zip(requests, full, core):
        url = template.format(m=core_mushaf, ayah=last_ayah)
        if a != b:
            problems.append(f"{url}: full={a[0]} core={b[0]} (bodies differ: {a[1] != b[1]})")
        elif a[0] != 200:
            problems.append(f"{url}: answered {a[0]} on both — the check proves nothing")
    return problems


def main_cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", type=Path, default=ROOT / "data" / "quran.db")
    parser.add_argument("--translations", type=Path, default=ROOT / "data" / "translations.db")
    parser.add_argument("--locales", type=Path, default=ROOT / "apps" / "web" / "lib" / "i18n" / "locales")
    parser.add_argument("--locales-ts", type=Path, default=ROOT / "apps" / "web" / "lib" / "i18n" / "locales.ts")
    parser.add_argument("--sources", type=Path, default=ROOT / "scripts" / "translation_sources.json")
    parser.add_argument("--output", type=Path, default=ROOT / "build" / "offline")
    parser.add_argument("--core-mushaf", type=int, default=CORE_MUSHAF_ID)
    parser.add_argument("--verify", action="store_true", help="check reassembly and core search/reader parity")
    args = parser.parse_args(argv)

    manifest = build(quran_db=args.db, translations_db=args.translations, locales_dir=args.locales,
                     locales_ts=args.locales_ts, sources_path=args.sources, output=args.output,
                     core_mushaf=args.core_mushaf)
    sized = [manifest["core"]] + [p for p in manifest["packs"] if "size" in p]
    total = sum(p["size"] for p in sized)
    print(f"core.db: {manifest['core']['size'] / 1e6:.1f} MB · {len(manifest['packs'])} packs · {total / 1e6:.1f} MB in all")
    if args.verify:
        problems = verify_reassembly(args.db, args.output) + verify_parity(args.db, args.output, args.core_mushaf)
        for problem in problems:
            print("✗", problem)
        if problems:
            return 1
        print("✓ reassembly identical, core search/reader parity holds")
    return 0


if __name__ == "__main__":
    raise SystemExit(main_cli())
