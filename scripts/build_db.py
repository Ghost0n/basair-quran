"""
Quran Database Builder V7 - Rich Metadata & Decoupled Morphology

This script builds the quran.db database from normalized mushaf JSON files.
It uses a pre-generated word-to-root dictionary for checking roots, ensuring
consistently high-quality morphology across all narrations (Riwayat).
"""

import json
import os
import re
import sqlite3
import sys

# Force UTF-8 encoding on Windows
if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

# =============================================================================
# CONFIGURATION
# =============================================================================

MUSHAFS = [
    {
        "id": 2,
        "name": "\u062d\u0641\u0635",
        "file": "mushafs/hafs.json",
        "description": "\u0645\u0635\u062d\u0641 \u062d\u0641\u0635 (\u0646\u0633\u062e\u0629 \u0646\u0635\u064a\u0629 \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u0646\u0633\u062e)",
    },
    {
        "id": 1,
        "name": "\u0642\u0627\u0644\u0648\u0646",
        "file": "mushafs/qaloun.json",
        "description": "\u0645\u0635\u062d\u0641 \u0642\u0627\u0644\u0648\u0646",
    },
    {
        "id": 3,
        "name": "\u0648\u0631\u0634",
        "file": "mushafs/warsh.json",
        "description": "\u0645\u0635\u062d\u0641 \u0648\u0631\u0634 \u0639\u0646 \u0646\u0627\u0641\u0639",
    },
    {
        "id": 4,
        "name": "\u0634\u0639\u0628\u0629",
        "file": "mushafs/shuba.json",
        "description": "\u0645\u0635\u062d\u0641 \u0634\u0639\u0628\u0629 \u0639\u0646 \u0639\u0627\u0635\u0645",
    },
    {
        "id": 5,
        "name": "\u0627\u0644\u062f\u0648\u0631\u064a",
        "file": "mushafs/douri.json",
        "description": "\u0645\u0635\u062d\u0641 \u0627\u0644\u062f\u0648\u0631\u064a \u0639\u0646 \u0623\u0628\u064a \u0639\u0645\u0631\u0648",
    },
    {
        "id": 6,
        "name": "\u0627\u0644\u0633\u0648\u0633\u064a",
        "file": "mushafs/sousi.json",
        "description": "\u0645\u0635\u062d\u0641 \u0627\u0644\u0633\u0648\u0633\u064a \u0639\u0646 \u0623\u0628\u064a \u0639\u0645\u0631\u0648",
    },
]

# =============================================================================
# PATHS
# =============================================================================

DATA_DIR = os.path.join(os.path.dirname(__file__), "../data")
DB_PATH = os.path.join(DATA_DIR, "quran.db")
ROOT_DICT_JSON = os.path.join(DATA_DIR, "word_root_dictionary.json")

# =============================================================================
# TEXT NORMALIZATION FUNCTIONS
# =============================================================================


def normalize_text_search(text):
    """Standard normalization for search matching."""
    text = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]", "", text)
    text = re.sub(r"[\u0623\u0625\u0622\u0671]", "\u0627", text)
    text = text.replace("\u0621", "")
    return text.strip()


def normalize_for_matching(text):
    """Aggressive normalization for word-root matching."""
    text = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]", "", text)
    text = re.sub(r"[\u0623\u0625\u0622\u0671\u0627]", "\u0627", text)
    text = text.replace("\u0621", "")
    text = text.replace("\u0629", "\u0647")
    text = text.replace("\u0649", "\u064A")
    text = text.replace("\u0640", "")
    return text.strip()


def clean_ayah_text(text):
    """Clean ayah text for display."""
    return text.replace("\u06DE", "").replace("\u06E9", "").strip()


def read_json_file(path, label):
    """Load JSON input and raise a readable error on failure."""
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError as exc:
        raise ValueError(f"{label} missing: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"{label} invalid JSON: {path} ({exc})") from exc
    except OSError as exc:
        raise ValueError(f"{label} unreadable: {path} ({exc})") from exc


def validate_inputs():
    """Validate the root dictionary and mushaf payloads before mutating the DB."""
    errors = []

    try:
        word_root_map = read_json_file(ROOT_DICT_JSON, "Root dictionary")
        if not isinstance(word_root_map, dict):
            raise ValueError(f"Root dictionary must be a JSON object: {ROOT_DICT_JSON}")
    except ValueError as exc:
        errors.append(str(exc))
        word_root_map = {}

    mushaf_payloads = {}
    for mushaf in MUSHAFS:
        mushaf_path = os.path.join(DATA_DIR, mushaf["file"])
        label = f"Mushaf source {mushaf['name']}"
        try:
            payload = read_json_file(mushaf_path, label)
            if not isinstance(payload, list):
                raise ValueError(f"{label} must be a JSON array: {mushaf_path}")
            mushaf_payloads[mushaf["id"]] = payload
        except ValueError as exc:
            errors.append(str(exc))

    return word_root_map, mushaf_payloads, errors


# =============================================================================
# DATABASE BUILDING
# =============================================================================


def create_database_schema(cursor):
    """Create database tables and indexes."""
    cursor.executescript(
        """
        CREATE TABLE mushafs (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT
        );

        CREATE TABLE surahs (
            id INTEGER PRIMARY KEY,
            name_arabic TEXT,
            name_english TEXT,
            type TEXT
        );

        CREATE TABLE ayahs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mushaf_id INTEGER,
            surah_id INTEGER,
            number_in_surah INTEGER,
            text_uthmani TEXT,
            text_simple TEXT,
            text_imlaei TEXT,
            page INTEGER,
            juz INTEGER,
            line_start INTEGER,
            line_end INTEGER,
            global_index INTEGER,
            FOREIGN KEY(mushaf_id) REFERENCES mushafs(id),
            FOREIGN KEY(surah_id) REFERENCES surahs(id)
        );

        CREATE TABLE roots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            root_text TEXT UNIQUE,
            root_simple TEXT
        );

        CREATE TABLE word_occurrences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            root_id INTEGER,
            ayah_id INTEGER,
            word_position INTEGER,
            word_text TEXT,
            word_simple TEXT,
            FOREIGN KEY(root_id) REFERENCES roots(id),
            FOREIGN KEY(ayah_id) REFERENCES ayahs(id)
        );

        CREATE INDEX idx_ayahs_mushaf ON ayahs(mushaf_id);
        CREATE INDEX idx_ayahs_surah ON ayahs(surah_id);
        CREATE INDEX idx_text_simple ON ayahs(text_simple);
        CREATE INDEX idx_text_imlaei ON ayahs(text_imlaei);
        CREATE INDEX idx_root_simple ON roots(root_simple);
        CREATE INDEX idx_word_simple ON word_occurrences(word_simple);
        CREATE INDEX idx_word_ayah ON word_occurrences(ayah_id);
        CREATE INDEX idx_word_root ON word_occurrences(root_id);
        CREATE INDEX idx_wo_word_simple_ayah ON word_occurrences(word_simple, ayah_id);
        CREATE INDEX idx_ayahs_mushaf_surah ON ayahs(mushaf_id, surah_id);
        CREATE INDEX idx_ayahs_mushaf_surah_number ON ayahs(mushaf_id, surah_id, number_in_surah);
        CREATE INDEX idx_ayahs_mushaf_global ON ayahs(mushaf_id, global_index);
        CREATE INDEX idx_ayahs_page ON ayahs(page);
        CREATE INDEX idx_ayahs_mushaf_page ON ayahs(mushaf_id, page);
        CREATE INDEX idx_ayahs_juz ON ayahs(juz);
        CREATE INDEX idx_wo_root_ayah_position ON word_occurrences(root_id, ayah_id, word_position);
        CREATE INDEX idx_wo_word_simple_ayah_position ON word_occurrences(word_simple, ayah_id, word_position);
    """
    )


def process_mushaf(cursor, mushaf, quran_data, word_root_map, root_cache, insert_surahs):
    """Process a single mushaf and insert its data."""
    mushaf_id = mushaf["id"]
    print(f"\nProcessing Mushaf: {mushaf['name']} ({mushaf['file']})")

    global_idx = 0
    words_with_roots = 0
    words_without_roots = 0

    for surah in quran_data:
        surah_id = surah["id"]

        if insert_surahs:
            cursor.execute(
                "INSERT OR IGNORE INTO surahs VALUES (?,?,?,?)",
                (surah_id, surah["name"], surah["transliteration"], surah["type"]),
            )

        for ayah in surah["verses"]:
            ayah_number = ayah["id"]
            text = ayah["text"]

            text_clean = clean_ayah_text(text)
            text_simple = normalize_text_search(text_clean)
            text_imlaei = clean_ayah_text(ayah.get("text_imlaei", ""))
            page = ayah.get("page")
            juz = ayah.get("juz")
            line_start = ayah.get("line_start")
            line_end = ayah.get("line_end")

            cursor.execute(
                """
                INSERT INTO ayahs (
                    mushaf_id, surah_id, number_in_surah, text_uthmani, text_simple,
                    text_imlaei, page, juz, line_start, line_end, global_index
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    mushaf_id,
                    surah_id,
                    ayah_number,
                    text_clean,
                    text_simple,
                    text_imlaei,
                    page,
                    juz,
                    line_start,
                    line_end,
                    global_idx,
                ),
            )
            ayah_db_id = cursor.lastrowid
            global_idx += 1

            for index, word_text in enumerate(text_clean.split(" "), start=1):
                word_simple = normalize_text_search(word_text)
                word_normalized = normalize_for_matching(word_text)
                roots_found = word_root_map.get(word_normalized, [])

                if not roots_found:
                    words_without_roots += 1
                    cursor.execute(
                        """
                        INSERT INTO word_occurrences (
                            root_id, ayah_id, word_position, word_text, word_simple
                        ) VALUES (NULL, ?, ?, ?, ?)
                        """,
                        (ayah_db_id, index, word_text, word_simple),
                    )
                    continue

                words_with_roots += 1
                for root_text in roots_found:
                    if root_text not in root_cache:
                        root_simple = normalize_text_search(root_text)
                        cursor.execute(
                            "INSERT OR IGNORE INTO roots (root_text, root_simple) VALUES (?, ?)",
                            (root_text, root_simple),
                        )
                        cursor.execute("SELECT id FROM roots WHERE root_text = ?", (root_text,))
                        root_cache[root_text] = cursor.fetchone()[0]

                    cursor.execute(
                        """
                        INSERT INTO word_occurrences (
                            root_id, ayah_id, word_position, word_text, word_simple
                        ) VALUES (?, ?, ?, ?, ?)
                        """,
                        (root_cache[root_text], ayah_db_id, index, word_text, word_simple),
                    )

    total_words = words_with_roots + words_without_roots
    match_rate = (words_with_roots / total_words * 100) if total_words else 0
    print(f"  Processed {global_idx} verses")
    print(f"  Words with roots: {words_with_roots} ({match_rate:.1f}%)")
    print(f"  Words without roots: {words_without_roots}")


def build_db():
    """Build the database and return a shell-friendly status code."""
    print("=" * 60)
    print("Quran Database Builder V7 - Rich Metadata & Decoupled Morphology")
    print("=" * 60)

    word_root_map, mushaf_payloads, validation_errors = validate_inputs()
    if validation_errors:
        print("Input validation failed:")
        for error in validation_errors:
            print(f"  - {error}")
        return 1

    print(f"Loading word-root dictionary from: {ROOT_DICT_JSON}")
    print(f"  Loaded {len(word_root_map)} unique word forms.")

    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        conn.execute("BEGIN")

        tables = ["word_occurrences", "roots", "ayahs", "surahs", "mushafs", "sqlite_sequence"]
        for table in tables:
            cursor.execute(f"DROP TABLE IF EXISTS {table}")

        create_database_schema(cursor)

        for mushaf in MUSHAFS:
            cursor.execute(
                "INSERT INTO mushafs (id, name, description) VALUES (?, ?, ?)",
                (mushaf["id"], mushaf["name"], mushaf["description"]),
            )

        root_cache = {}
        first_mushaf = True
        for mushaf in MUSHAFS:
            process_mushaf(
                cursor,
                mushaf,
                mushaf_payloads[mushaf["id"]],
                word_root_map,
                root_cache,
                first_mushaf,
            )
            first_mushaf = False

        conn.commit()

        cursor.execute("SELECT COUNT(*) FROM mushafs")
        mushaf_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM ayahs")
        ayah_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM roots")
        root_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM word_occurrences")
        word_count = cursor.fetchone()[0]
    except Exception as exc:
        conn.rollback()
        print(f"Database build failed: {exc}")
        return 1
    finally:
        conn.close()

    print(f"\n{'=' * 60}")
    print("Database Built Successfully!")
    print(f"{'=' * 60}")
    print(f"  Mushafs: {mushaf_count}")
    print(f"  Ayahs: {ayah_count}")
    print(f"  Roots: {root_count}")
    print(f"  Word Occurrences: {word_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(build_db())
