"""Record the server's answers for the on-device engine's parity suite.

The standalone app answers the Quran routes with a TypeScript port of the
search/reader services (``packages/offline-engine``). This script asks the
real FastAPI app a large, deterministic set of requests — sampled from the
database itself: words, diacritized words, roots, phrases, typos, prefixes,
Latin transliterations, pages, ayahs, layouts, counts, morphology,
translations and invalid input — and writes each request with the status and
JSON the server gave. ``packages/offline-engine/test/parity.test.ts`` replays
them against the engine on the same database and requires identical JSON.

Usage:
    python scripts/offline_parity.py                       # build/offline/core.db (the phone's database)
    python scripts/offline_parity.py --db data/quran.db --mushaf 1
    python scripts/offline_parity.py --fixture             # the small test fixture (CI)
    pnpm --filter @q-basair/offline-engine test
"""
from __future__ import annotations

import argparse
import json
import random
import sqlite3
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "build" / "offline-parity"
LATIN_QUERIES = ["rahm", "rahma", "kitab", "ktb", "salat", "qul", "alhamd", "hamd", "sabr", "nur", "rbb", "ilm", "3lm", "shukr", "dhikr", "zz"]
ARABIC_LETTERS = "ابتثجحخدذرزسشصضطظعغفقكلمنهوي"


def _url(path: str, **params) -> str:
    return f"{path}?{urlencode({k: v for k, v in params.items() if v is not None})}" if params else path


def _typo(word: str, rng: random.Random) -> str | None:
    if len(word) < 4:
        return None
    index = rng.randrange(1, len(word))
    kind = rng.choice(["replace", "drop", "insert"])
    if kind == "replace":
        return word[:index] + rng.choice(ARABIC_LETTERS) + word[index + 1 :]
    if kind == "drop":
        return word[:index] + word[index + 1 :]
    return word[:index] + rng.choice(ARABIC_LETTERS) + word[index:]


def build_requests(db: Path, mushaf: int, sample: int, seed: int, has_translations: bool) -> list[dict]:
    rng = random.Random(seed)
    connection = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    q = lambda sql, *params: connection.execute(sql, params).fetchall()  # noqa: E731
    words = q("SELECT DISTINCT word_simple, word_text FROM ayah_words WHERE mushaf_id = ? ORDER BY word_simple, word_text", mushaf)
    roots = [row[0] for row in q("SELECT root_text FROM roots ORDER BY id")]
    ayahs = q("SELECT id, surah_id, number_in_surah, page, juz, text_uthmani FROM ayahs WHERE mushaf_id = ? ORDER BY global_index", mushaf)
    tokens_by_ayah: dict[int, list[tuple[str, str]]] = {}
    for ayah_id, simple, text in q("SELECT ayah_id, word_simple, word_text FROM ayah_words WHERE mushaf_id = ? ORDER BY ayah_id, word_position", mushaf):
        tokens_by_ayah.setdefault(ayah_id, []).append((simple, text))
    layout = q("SELECT name FROM sqlite_master WHERE name = 'mushaf_layout_lines'")
    layout_pages = [row[0] for row in q("SELECT DISTINCT page FROM mushaf_layout_lines ORDER BY page")] if layout else []
    connection.close()

    pick = lambda items, n: rng.sample(items, min(n, len(items))) if items else []  # noqa: E731
    requests: list[dict] = []
    get = lambda path, **params: requests.append({"method": "GET", "url": _url(path, **params)})  # noqa: E731
    m = mushaf

    get("/api/mushafs")
    get("/api/surahs", mushaf=m)
    get("/api/surahs", mushaf=999)
    get("/api/reciters")

    # Words: exact (plain and diacritized), root mode, legacy search, suggestions.
    for simple, text in pick(words, sample):
        get("/api/search-v2", q=simple, mode="exact", mushaf=m)
        get("/api/search-v2", q=simple, mode="root", mushaf=m, page_size=rng.choice([5, 10, 50]))
        if rng.random() < 0.5:
            get("/api/search-v2", q=text, mode="exact", mushaf=m)
        if rng.random() < 0.25:
            get("/api/search", q=simple, mode=rng.choice(["root", "exact"]), mushaf=m)
        prefix = simple[: rng.randint(1, max(1, min(4, len(simple))))]
        get("/api/suggest", q=prefix, mode=rng.choice(["root", "exact"]), mushaf=m, with_chakl=rng.choice(["true", "false"]))
    for root in pick(roots, max(10, sample // 3)):
        get("/api/search-v2", q=root, mode="root", mushaf=m)
        get("/api/root-distribution", root=root, mushaf=m)
        get("/api/suggest", q=root[:2], mode="root", mushaf=m)

    # Phrases: exact windows of 2–3 words, their suggestions, and typos of both.
    ayah_ids = [row[0] for row in ayahs if len(tokens_by_ayah.get(row[0], [])) >= 2]
    for ayah_id in pick(ayah_ids, sample // 2):
        tokens = tokens_by_ayah[ayah_id]
        size = min(len(tokens), rng.choice([2, 2, 3]))
        start = rng.randrange(0, len(tokens) - size + 1)
        window = tokens[start : start + size]
        phrase = " ".join(simple for simple, _ in window)
        get("/api/search-v2", q=phrase, mode="exact", mushaf=m)
        if rng.random() < 0.3:
            get("/api/search-v2", q=" ".join(text for _, text in window), mode="exact", mushaf=m)
        last = window[-1][0]
        partial = " ".join([s for s, _ in window[:-1]] + [last[: max(1, len(last) // 2)]])
        get("/api/suggest", q=partial, mode="exact", mushaf=m, with_chakl=rng.choice(["true", "false"]))
        typo = _typo(window[rng.randrange(size)][0], rng)
        if typo:
            get("/api/search-v2", q=" ".join(typo if s == window[0][0] else s for s, _ in window), mode="exact", mushaf=m)
    for simple, _ in pick([w for w in words if len(w[0]) >= 4], sample // 2):
        typo = _typo(simple, rng)
        if typo:
            get("/api/search-v2", q=typo, mode="exact", mushaf=m)
            get("/api/search", q=typo, mode="exact", mushaf=m)

    for latin in LATIN_QUERIES:
        get("/api/suggest", q=latin, mode="root", mushaf=m)
        get("/api/suggest", q=latin, mode="exact", mushaf=m)
    requests.append({"method": "POST", "url": "/api/suggest-batch", "body": {"queries": [w[0][:3] for w in pick(words, 4)] + ["rahm"], "mushaf": m, "mode": "root"}})
    two_words = next((tokens[:2] for tokens in tokens_by_ayah.values() if len(tokens) >= 2), [])
    requests.append({"method": "POST", "url": "/api/suggest-batch", "body": {"queries": [" ".join(s for s, _ in two_words)], "mushaf": m, "mode": "exact", "with_chakl": True}})
    requests.append({"method": "POST", "url": "/api/suggest-batch", "body": {"queries": ["x" * 121], "mushaf": m}})

    # Reader.
    pages = sorted({int(str(row[3]).split("-")[0]) for row in ayahs if row[3] is not None})
    for page in pick(pages, max(8, sample // 10)) + [pages[0], pages[-1], pages[-1] + 5] if pages else []:
        get("/api/quran-page", mushaf=m, page=page)
    for row in pick(ayahs, max(10, sample // 5)):
        ayah_id, surah, number, _page, juz, text = row
        get("/api/quran-page", mushaf=m, ayah_id=ayah_id)
        get("/api/quran-page", mushaf=m, surah=surah, ayah=number, selected_ayah_id=ayah_id)
        get("/api/ayah-reader", mushaf=m, ayah_id=ayah_id, before=rng.randint(0, 10), after=rng.randint(0, 10))
        get("/api/ayah-reader-more", mushaf=m, surah_id=surah, anchor_ayah=number, direction=rng.choice(["before", "after"]), count=rng.randint(1, 20))
        get("/api/morphology", surah=surah, ayah=number, mushaf=m)
        if rng.random() < 0.3:
            get("/api/morphology", surah=surah, ayah=number, text=text)
        tokens = tokens_by_ayah.get(ayah_id, [])
        if tokens:
            start = rng.randrange(len(tokens))
            selection = " ".join(t for _, t in tokens[start : start + rng.randint(1, 3)])
            get("/api/text-count", text=selection, mushaf=m, surah=surah if rng.random() < 0.7 else None, page=_page if isinstance(_page, int) and rng.random() < 0.7 else None)
        if juz and rng.random() < 0.2:
            get("/api/quran-page", mushaf=m, juz=juz)
    get("/api/quran-page", mushaf=m, surah=2, ayah=999)
    get("/api/quran-page", mushaf=m)
    get("/api/ayah-reader", mushaf=m, ayah_id=10**7)
    get("/api/ayah-reader-more", mushaf=m, surah_id=1, anchor_ayah=1, direction="before")
    get("/api/ayah-reader-more", mushaf=m, surah_id=1, anchor_ayah=999, direction="after")
    for page in (pick(layout_pages, max(6, sample // 20)) + [None] if layout_pages else [1, None]):
        get("/api/mushaf-page-layout", mushaf=m, page=page)
    if layout_pages and ayahs:
        get("/api/mushaf-page-layout", mushaf=m, page=layout_pages[0], selected_ayah_id=ayahs[0][0])
    get("/api/mushaf-page-layout", mushaf=m + 1000, page=1)
    get("/api/morphology", surah=114, ayah=99, mushaf=m)

    if has_translations:
        get("/api/translations")
        get("/api/translations/ayahs", keys="quranenc:english_saheeh,quranenc:french_montada,missing", refs="1:1-7,2:255,114:1")
        get("/api/translations/ayahs", keys="quranenc:english_saheeh", refs="2:1-300")
        get("/api/translations/ayahs", keys="quranenc:english_saheeh", refs="0:1")

    # Validation and not-found answers (status must match).
    get("/api/search-v2", q="x" * 121)
    get("/api/search-v2", q="رحم", mode="bogus")
    get("/api/search-v2", q="رحم", page_size=0)
    get("/api/suggest", q="")
    get("/api/quran-page", mushaf="abc")
    get("/api/search-result-page", q="رحم", mode="root", result_key="root:999999", mushaf=m)
    get("/api/search-result-page", q="رحم", mode="exact", result_key="exact:غلط", mushaf=m)
    get("/api/text-count", text="abc", mushaf=m)
    get("/api/text-count", text=" ".join(["من"] * 13), mushaf=m)
    get("/api/ayah-reader-more", surah_id=1, anchor_ayah=1, direction="sideways")
    return requests


def record(requests: list[dict], db: Path, translations: Path | None) -> list[dict]:
    sys.path.insert(0, str(ROOT))
    try:
        from fastapi.testclient import TestClient

        from src import main
        from src.app.core import config
        from src.app.services import translation_service
    finally:
        sys.path.pop(0)

    main.set_db_path(str(db))
    config.set_translations_db_path(str(translations or (Path(tempfile.gettempdir()) / "qbasair-no-translations.db")))
    translation_service.reset_connection()
    cases = []
    with TestClient(main.app) as client:
        pending = list(requests)
        while pending:
            request = pending.pop(0)
            if request["method"] == "POST":
                response = client.post(request["url"], json=request.get("body"))
            else:
                response = client.get(request["url"])
            body = response.json()
            cases.append({**request, "status": response.status_code, "json": body})
            # Follow a paginated result to its next page, as the UI does.
            if request["url"].startswith("/api/search-v2") and response.status_code == 200 and not request.get("followed"):
                for result in body.get("results", [])[:2]:
                    if result["total_pages"] > 1:
                        base = request["url"].replace("/api/search-v2", "/api/search-result-page")
                        extra = urlencode({"result_key": result["result_key"], "page": min(result["total_pages"], 2 + len(cases) % 3)})
                        pending.append({"method": "GET", "url": f"{base}&{extra}", "followed": True})
    main.close_db_connection()
    return [{k: v for k, v in case.items() if k != "followed"} for case in cases]


def fixture_db(target: Path) -> Path:
    """The pytest fixture database plus the morphology table the phone reads."""
    sys.path.insert(0, str(ROOT))
    try:
        from scripts.build_offline_packs import add_morphology
        from tests.conftest import create_test_db
    finally:
        sys.path.pop(0)
    create_test_db(target)
    with sqlite3.connect(target) as connection:
        add_morphology(connection, ROOT / "data" / "quran-morphology.txt")
    return target


def main_cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", type=Path, default=ROOT / "build" / "offline" / "core.db")
    parser.add_argument("--mushaf", type=int, default=2)
    parser.add_argument("--translations", type=Path, default=ROOT / "data" / "translations.db")
    parser.add_argument("--fixture", action="store_true", help="use the small pytest fixture database (CI)")
    parser.add_argument("--sample", type=int, default=400, help="words sampled per category")
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args(argv)

    args.out.mkdir(parents=True, exist_ok=True)
    db = args.db.resolve()
    mushaf = args.mushaf
    translations = args.translations.resolve() if args.translations and args.translations.exists() else None
    if args.fixture:
        db = fixture_db(args.out / "fixture.db")
        (args.out / "fixture.db-journal").unlink(missing_ok=True)
        mushaf = 1
        translations = None
    if not db.exists():
        print(f"{db} not found — run python scripts/build_offline_packs.py first (or pass --fixture)")
        return 1
    requests = build_requests(db, mushaf, args.sample, args.seed, translations is not None)
    cases = record(requests, db, translations)
    manifest = {"quran_db": str(db), "translations_db": str(translations) if translations else None, "mushaf": mushaf, "cases": cases}
    (args.out / "cases.json").write_text(json.dumps(manifest, ensure_ascii=False) + "\n", encoding="utf-8")
    statuses: dict[int, int] = {}
    for case in cases:
        statuses[case["status"]] = statuses.get(case["status"], 0) + 1
    print(f"{len(cases)} cases → {args.out / 'cases.json'} (statuses {statuses})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main_cli())
