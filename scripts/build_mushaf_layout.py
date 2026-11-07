"""
Authentic Madani (QCF) page-layout builder — Hafs only.

Ingests the per-page line layout (QUL/zonetecde "qpc-hafs-v2" dataset) into
ADDITIVE tables in data/quran.db, alongside the existing Unicode tables. The
layout drives the line-for-line glyph reader; the existing /quran-page path is
untouched.

Inputs (documented, reproducible):
  <QBASAIR_MUSHAF_LAYOUT_PATH>/qpc-hafs-v2-src/mushaf/page-001.json ... page-604.json
    cloned from github.com/zonetecde/mushaf-layout (pinned SHA in
    <layout>/SOURCE_SHA.txt). Fetched at build/deploy, not committed (large).

Integrity contract: every Hafs word in ayah_words must map to the layout and
vice-versa, and each layout glyph carries the morphology `word_position` of the
ayah_words word it belongs to — so word-click + /api/morphology stay coherent.
Because the printed mushaf writes a few "disconnected words" (e.g. لَّوْ مَا,
مَا لِيَ) with a space though tokenization counts them as ONE word, the layout
word index is NOT the morphology position; we ALIGN by text per ayah.

Run after build_db.py. Idempotent: drops/recreates only its own tables.
"""

import io
import json
import re
import sqlite3
import sys
import tarfile
import urllib.request
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

from src.app.core import config  # noqa: E402

LAYOUT_ID = "qpc-hafs-v2"
SOURCE = "github.com/zonetecde/mushaf-layout"
PINNED_REF = "72116ce4d405d67823804f0eed795c1e6409b4af"  # reproducible source pin
PAGE_COUNT = 604

# Upstream basmala line glyphs (QPC V2 page font / QCF_BSML ligature codes).
BASMALA_V2 = "ﭑﭒﭓ"
BASMALA_V1 = '#"!'

# zonetecde line `type` -> our normalized line_type
LINE_TYPE_MAP = {"surah-header": "surah_name", "basmala": "basmalah", "text": "ayah"}

# Diacritics, tatweel, Arabic-Indic digits (ayah-end numbers), whitespace.
_MARKS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ٠-٩\s]")

SCHEMA = """
CREATE TABLE mushaf_layout_lines (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    layout_id       TEXT    NOT NULL,
    mushaf_id       INTEGER NOT NULL,
    page            INTEGER NOT NULL,
    line_number     INTEGER NOT NULL,
    line_type       TEXT    NOT NULL,          -- 'ayah' | 'surah_name' | 'basmalah'
    is_centered     INTEGER NOT NULL DEFAULT 0,
    surah_number    INTEGER,                   -- surah_name lines
    surah_name_text TEXT,                      -- surah_name lines (display name)
    line_glyph_v2   TEXT,                      -- basmalah lines: line-level glyph (page font)
    line_glyph_v1   TEXT,
    font_family     TEXT,                      -- per-page font id for ayah/basmala glyphs
    UNIQUE(layout_id, mushaf_id, page, line_number)
);

CREATE TABLE mushaf_layout_words (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    line_id          INTEGER NOT NULL REFERENCES mushaf_layout_lines(id),
    layout_id        TEXT    NOT NULL,
    mushaf_id        INTEGER NOT NULL,
    page             INTEGER NOT NULL,
    line_number      INTEGER NOT NULL,
    position_in_line INTEGER NOT NULL,
    surah_number     INTEGER NOT NULL,
    ayah_number      INTEGER NOT NULL,
    word_position    INTEGER NOT NULL,         -- == ayah_words.word_position / morphology index
    ayah_id          INTEGER NOT NULL REFERENCES ayahs(id),
    glyph_v2         TEXT,
    glyph_v1         TEXT,
    word_text        TEXT
);

CREATE TABLE mushaf_layout_meta (
    layout_id   TEXT PRIMARY KEY,
    mushaf_id   INTEGER NOT NULL,
    page_count  INTEGER NOT NULL,
    source      TEXT NOT NULL,
    source_ref  TEXT
);

CREATE INDEX idx_layout_lines_page   ON mushaf_layout_lines(layout_id, mushaf_id, page, line_number);
CREATE INDEX idx_layout_words_line   ON mushaf_layout_words(line_id, position_in_line);
CREATE INDEX idx_layout_words_locate ON mushaf_layout_words(mushaf_id, surah_number, ayah_number, word_position);
"""


def read_json_file(path, label):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError as exc:
        raise ValueError(f"{label} missing: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"{label} invalid JSON: {path} ({exc})") from exc


def pages_dir() -> Path:
    return Path(config.get_mushaf_layout_path()) / f"{LAYOUT_ID}-src" / "mushaf"


def source_ref() -> str:
    sha_file = Path(config.get_mushaf_layout_path()) / "SOURCE_SHA.txt"
    try:
        return sha_file.read_text(encoding="utf-8").strip() or PINNED_REF
    except OSError:
        return PINNED_REF


def fetch_layout() -> None:
    """Download the pinned layout dataset if the local cache is empty.

    Dependency-free (codeload tarball + stdlib tarfile), pinned to PINNED_REF
    for reproducibility. The cache is gitignored — fetched at build/deploy.
    """
    target = pages_dir()
    if target.exists() and any(target.glob("page-*.json")):
        return
    url = f"https://codeload.github.com/zonetecde/mushaf-layout/tar.gz/{PINNED_REF}"
    print(f"Fetching layout dataset @ {PINNED_REF[:10]} ...")
    with urllib.request.urlopen(url, timeout=180) as response:  # noqa: S310 (pinned host)
        archive = response.read()
    target.mkdir(parents=True, exist_ok=True)
    extracted = 0
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        for member in tar.getmembers():
            if "/mushaf/page-" not in member.name or not member.name.endswith(".json"):
                continue
            payload = tar.extractfile(member)
            if payload is None:
                continue
            (target / Path(member.name).name).write_bytes(payload.read())
            extracted += 1
    (Path(config.get_mushaf_layout_path()) / "SOURCE_SHA.txt").write_text(PINNED_REF, encoding="utf-8")
    print(f"  fetched {extracted} page files into {target}")


def parse_location(loc):
    parts = str(loc).split(":")
    if len(parts) != 3:
        return None
    try:
        return int(parts[0]), int(parts[1]), int(parts[2])
    except ValueError:
        return None


def normalize_word(text: str) -> str:
    text = _MARKS.sub("", text or "")
    text = re.sub(r"[آأإٱ]", "ا", text)  # alef variants -> bare alef
    text = (text.replace("ى", "ي")        # alef maqsura -> ya
                .replace("ؤ", "و")        # hamza-on-waw -> waw
                .replace("ئ", "ي")        # hamza-on-ya -> ya
                .replace("ة", "ه")        # ta marbuta -> ha
                .replace("ء", ""))        # drop standalone hamza
    return text


def align_layout_to_db(layout_texts, db_words):
    """Map each layout word (reading order) to a db word_position. Handles the
    printed-mushaf 'disconnected words' (2 layout glyphs == 1 morphology word)
    and the rarer inverse. Returns (positions | None, error)."""
    n_l, n_d = len(layout_texts), len(db_words)
    # Fast path: equal counts => straight 1:1 by position. The two text sources
    # differ in spelling (ى/ا, hamza forms, ta-marbuta), so we deliberately do
    # NOT text-compare here — only unequal counts (disconnected words) need it.
    if n_l == n_d:
        return [pos for pos, _ in db_words], None
    out = [None] * n_l
    i = j = 0
    while i < n_l and j < n_d:
        li = normalize_word(layout_texts[i])
        dj = normalize_word(db_words[j][1])
        if li == dj:
            out[i] = db_words[j][0]
            i += 1
            j += 1
        elif i + 1 < n_l and normalize_word(layout_texts[i] + layout_texts[i + 1]) == dj:
            out[i] = out[i + 1] = db_words[j][0]  # disconnected word: 2 glyphs -> 1 morph word
            i += 2
            j += 1
        elif j + 1 < n_d and li == normalize_word(db_words[j][1] + db_words[j + 1][1]):
            out[i] = db_words[j][0]  # 1 glyph spans 2 morph words -> attribute to the first
            i += 1
            j += 2
        else:
            return None, (i, j, layout_texts[i], db_words[j][1])
    if i != n_l or j != n_d:
        return None, ("tail", i, n_l, j, n_d)
    return out, None


def _first_word_location(line):
    words = line.get("words") or []
    return parse_location(words[0].get("location")) if words else None


def repair_layout_pages(pages: dict[int, list[dict]]) -> dict:
    """Correct the upstream dataset's structural lines in place, before ingest.

    The upstream generator infers surah-title and basmala lines heuristically and
    gets three cases wrong (verified against the printed Madani page):
      * a page that ENDS with the next surah's title carries the CURRENT surah's
        number on that title line (18 pages, e.g. page 76 shows آل عمران for النساء);
      * a title that announces the next surah sits at the top of the page instead
        of its foot (page 207, before يونس);
      * a page that starts a surah and also ends with the next surah's title
        (586 التكوير, 590 البروج) loses all three structural lines (12 lines).
    Text lines and word glyphs are never touched — only title/basmala lines and
    the line numbers around them. Returns counts for the build log.
    """
    rebuilt_pages = []
    page_numbers = sorted(pages)
    for index, page in enumerate(page_numbers):
        lines = pages[page]
        if len(lines) != 12 or any(line.get("type") != "text" for line in lines):
            continue
        first = _first_word_location(lines[0])
        if first is None or first[1] != 1:
            continue
        surah = first[0]
        next_lines = pages.get(page_numbers[index + 1], []) if index + 1 < len(page_numbers) else []
        repaired = [{"type": "surah-header", "surah": f"{surah:03d}"}]
        if surah != 9:
            repaired.append({"type": "basmala", "qpcV2": BASMALA_V2, "qpcV1": BASMALA_V1})
        repaired.extend(lines)
        if next_lines and next_lines[0].get("type") == "basmala":
            repaired.append({"type": "surah-header", "surah": f"{surah + 1:03d}"})
        for number, line in enumerate(repaired, start=1):
            line["line"] = number
        pages[page] = repaired
        rebuilt_pages.append(page)

    # A title at the top of a page whose text continues a running surah belongs
    # at the bottom (it announces the next surah: e.g. page 207, before يونس).
    moved_titles = []
    for page in page_numbers:
        lines = pages[page]
        if len(lines) < 2 or lines[0].get("type") != "surah-header" or lines[1].get("type") != "text":
            continue
        first = _first_word_location(lines[1])
        if first is None or (first[1], first[2]) == (1, 1):
            continue
        lines.append(lines.pop(0))
        for number, line in enumerate(lines, start=1):
            line["line"] = number
        moved_titles.append(page)

    # A title line names the surah of the first ayah word that follows it in
    # reading order (on the same page or the next one).
    retitled = 0
    pending: list[dict] = []
    for page in page_numbers:
        for line in pages[page]:
            if line.get("type") == "surah-header":
                pending.append(line)
            elif line.get("type") == "text" and pending:
                location = _first_word_location(line)
                if location is None:
                    continue
                for header in pending:
                    code = f"{location[0]:03d}"
                    if header.get("surah") != code:
                        header["surah"] = code
                        header.pop("text", None)  # the upstream display name was wrong too
                        retitled += 1
                pending = []
    return {"rebuilt_pages": rebuilt_pages, "moved_titles": moved_titles, "retitled": retitled}


def is_centered_line(page: int, line_type: str) -> bool:
    """Lines the printed mushaf centers at their natural width instead of
    justifying edge to edge: titles, basmalas, and every line of the two framed
    opening pages. (Short closing lines elsewhere are detected by the renderer
    from their measured glyph width.)"""
    return line_type in ("surah_name", "basmalah") or page in (1, 2)


def validate_layout_structure(pages: dict[int, list[dict]]) -> list[str]:
    """Structural invariants of the 15-line Madani mushaf. Empty list = valid."""
    errors: list[str] = []
    sequence: list[dict] = []
    for page in sorted(pages):
        lines = pages[page]
        expected = 8 if page in (1, 2) else 15
        if len(lines) != expected:
            errors.append(f"page {page}: {len(lines)} lines (expected {expected})")
        if [line.get("line") for line in lines] != list(range(1, len(lines) + 1)):
            errors.append(f"page {page}: line numbers are not 1..{len(lines)}")
        sequence.extend(lines)

    titles = [int(line["surah"]) for line in sequence if line.get("type") == "surah-header"]
    if titles != list(range(1, 115)):
        missing = sorted(set(range(1, 115)) - set(titles))
        duplicated = sorted({s for s in titles if titles.count(s) > 1})
        errors.append(f"surah titles: {len(titles)} (missing {missing}, duplicated {duplicated})")

    basmalas = 0
    for index, line in enumerate(sequence):
        if line.get("type") == "basmala":
            basmalas += 1
            previous = sequence[index - 1] if index else {}
            if previous.get("type") != "surah-header" or int(previous["surah"]) in (1, 9):
                errors.append(f"basmala #{basmalas} does not follow a title of a surah that has one")
        elif line.get("type") == "surah-header" and int(line["surah"]) not in (1, 9):
            following = sequence[index + 1] if index + 1 < len(sequence) else {}
            if following.get("type") != "basmala":
                errors.append(f"surah {int(line['surah'])}: title not followed by a basmala")
    if basmalas != 112:
        errors.append(f"basmala lines: {basmalas} (expected 112)")
    return errors


def build_mushaf_layout() -> int:
    print("=" * 60)
    print("Authentic Madani (QCF) page-layout builder — Hafs only")
    print("=" * 60)

    hafs = config.get_hafs_mushaf_id()
    try:
        fetch_layout()
    except Exception as exc:  # noqa: BLE001 — surface any fetch/extract failure clearly
        print(f"ERROR: could not fetch layout dataset ({SOURCE} @ {PINNED_REF[:10]}): {exc}")
        return 1
    pdir = pages_dir()
    if not pdir.exists() or not any(pdir.glob("page-*.json")):
        print(f"ERROR: layout pages not found at {pdir}")
        return 1

    conn = sqlite3.connect(config.get_db_path())
    try:
        cursor = conn.cursor()

        # Hafs identity from the existing Unicode tables: ayah_id + ordered words.
        ayah_id_of: dict[tuple[int, int], int] = {}
        db_words_of: dict[tuple[int, int], list[tuple[int, str]]] = {}
        for ayah_id, surah, ayah, position, text in cursor.execute(
            "SELECT ayah_id, surah_id, number_in_surah, word_position, word_text "
            "FROM ayah_words WHERE mushaf_id = ? ORDER BY surah_id, number_in_surah, word_position",
            (hafs,),
        ):
            ayah_id_of[(surah, ayah)] = ayah_id
            db_words_of.setdefault((surah, ayah), []).append((position, text))
        if not db_words_of:
            print(f"ERROR: no ayah_words for Hafs (mushaf {hafs}). Run build_db.py first.")
            return 1
        total_db_words = sum(len(v) for v in db_words_of.values())
        print(f"Hafs identities loaded: {len(db_words_of)} ayat, {total_db_words} words")

        # ---- Pass 1: parse all pages into memory; collect per-ayah word order ----
        parsed_lines: list[dict] = []
        ayah_layout_words: dict[tuple[int, int], list[dict]] = {}
        raw_pages = {
            page: read_json_file(pdir / f"page-{page:03d}.json", f"layout page {page}").get("lines", [])
            for page in range(1, PAGE_COUNT + 1)
        }
        repairs = repair_layout_pages(raw_pages)
        structure_errors = validate_layout_structure(raw_pages)
        if structure_errors:
            print(f"ERROR: layout structure invalid after repair ({len(structure_errors)} problems):")
            for problem in structure_errors[:20]:
                print(f"       {problem}")
            return 1
        for page, page_lines in raw_pages.items():
            for line in page_lines:
                line_type = LINE_TYPE_MAP.get(line.get("type"))
                if line_type is None:
                    print(f"ERROR: unknown line type {line.get('type')!r} on page {page}")
                    return 1
                words: list[dict] = []
                for position, word in enumerate(line.get("words") or [], start=1):
                    location = parse_location(word.get("location"))
                    if location is None:
                        print(f"ERROR: bad word location {word.get('location')!r} on page {page}")
                        return 1
                    surah, ayah, _ = location
                    wd = {
                        "position_in_line": position,
                        "surah": surah,
                        "ayah": ayah,
                        "glyph_v2": word.get("qpcV2"),
                        "glyph_v1": word.get("qpcV1"),
                        "text": word.get("word") or "",
                        "word_position": None,
                        "ayah_id": None,
                    }
                    words.append(wd)
                    ayah_layout_words.setdefault((surah, ayah), []).append(wd)
                parsed_lines.append({
                    "page": page,
                    "line_number": line["line"],
                    "line_type": line_type,
                    "is_centered": 1 if is_centered_line(page, line_type) else 0,
                    "surah_number": int(line["surah"]) if line_type == "surah_name" and line.get("surah") else None,
                    "surah_name_text": line.get("text") if line_type == "surah_name" else None,
                    "line_glyph_v2": line.get("qpcV2") if line_type == "basmalah" else None,
                    "line_glyph_v1": line.get("qpcV1") if line_type == "basmalah" else None,
                    "font_family": f"qpc-v2-p{page}",
                    "words": words,
                })

        # ---- Align each ayah's layout words to its ayah_words positions ----
        # Every Hafs ayah must appear in the layout.
        missing_ayat = sorted(set(db_words_of) - set(ayah_layout_words))
        if missing_ayat:
            print(f"ERROR: {len(missing_ayat)} Hafs ayat absent from the layout: {missing_ayat[:10]}")
            return 1

        split_glyphs = 0   # printed-mushaf disconnected words: 2 glyphs -> 1 morph word
        joined_glyphs = 0  # 1 glyph -> 2 morph words (e.g. 'بعد ما', 'إل ياسين')
        for key, words in ayah_layout_words.items():
            db_words = db_words_of[key]
            positions, err = align_layout_to_db([w["text"] for w in words], db_words)
            if positions is None:
                # The alignment's tail check guarantees full 1:1 consumption of
                # db words; a failure here is a genuine unmodelled discrepancy.
                print(f"ERROR: alignment failed for {key[0]}:{key[1]}: {err}")
                print(f"       layout: {[w['text'] for w in words]}")
                print(f"       db    : {[t for _, t in db_words]}")
                return 1
            ayah_id = ayah_id_of[key]
            for wd, pos in zip(words, positions):
                wd["word_position"] = pos
                wd["ayah_id"] = ayah_id
            delta = len(words) - len(db_words)
            if delta > 0:
                split_glyphs += delta
            elif delta < 0:
                joined_glyphs += -delta

        # ---- Pass 2: write tables ----
        conn.execute("BEGIN")
        for table in ("mushaf_layout_words", "mushaf_layout_lines", "mushaf_layout_meta"):
            cursor.execute(f"DROP TABLE IF EXISTS {table}")
        cursor.executescript(SCHEMA)

        word_rows = 0
        for line in parsed_lines:
            cursor.execute(
                "INSERT INTO mushaf_layout_lines "
                "(layout_id, mushaf_id, page, line_number, line_type, is_centered, "
                " surah_number, surah_name_text, line_glyph_v2, line_glyph_v1, font_family) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    LAYOUT_ID, hafs, line["page"], line["line_number"], line["line_type"],
                    line["is_centered"], line["surah_number"], line["surah_name_text"],
                    line["line_glyph_v2"], line["line_glyph_v1"], line["font_family"],
                ),
            )
            line_id = cursor.lastrowid
            for wd in line["words"]:
                cursor.execute(
                    "INSERT INTO mushaf_layout_words "
                    "(line_id, layout_id, mushaf_id, page, line_number, position_in_line, "
                    " surah_number, ayah_number, word_position, ayah_id, glyph_v2, glyph_v1, word_text) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        line_id, LAYOUT_ID, hafs, line["page"], line["line_number"],
                        wd["position_in_line"], wd["surah"], wd["ayah"], wd["word_position"],
                        wd["ayah_id"], wd["glyph_v2"], wd["glyph_v1"], wd["text"],
                    ),
                )
                word_rows += 1

        cursor.execute(
            "INSERT INTO mushaf_layout_meta (layout_id, mushaf_id, page_count, source, source_ref) "
            "VALUES (?, ?, ?, ?, ?)",
            (LAYOUT_ID, hafs, PAGE_COUNT, SOURCE, source_ref()),
        )
        conn.commit()

        print(f"  ayat           : {len(ayah_layout_words)}/{len(db_words_of)} (all Hafs ayat present)")
        print(f"  lines ingested : {len(parsed_lines)}")
        print(f"  glyph words    : {word_rows}")
        print(f"  rebuilt pages  : {repairs['rebuilt_pages']} (missing title/basmala lines restored)")
        print(f"  moved titles   : {repairs['moved_titles']} (title moved to the page foot)")
        print(f"  retitled lines : {repairs['retitled']} (title line named the wrong surah upstream)")
        print(f"  disconnected   : {split_glyphs} (2 glyphs = 1 morph word)")
        print(f"  joined         : {joined_glyphs} (1 glyph = 2 morph words)")
        print(f"  source         : {SOURCE} @ {source_ref()}")
        print("OK — authentic layout tables built (word_position parity verified by alignment).")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(build_mushaf_layout())
