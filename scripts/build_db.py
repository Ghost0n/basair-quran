"""
Quran Database Builder V7 - Rich Metadata & Decoupled Morphology

This script builds the quran.db database from normalized mushaf JSON files.
Each word's root comes from the morphology source (the Quranic Arabic Corpus,
Ḥafṣ), word by word: by its position when the words line up, else from the
same word nearby in the same surah (narrations number some verses
differently), else from the source's usual reading of that spelling. Particles
have no root. The word-to-root dictionary is only the fallback for spellings
the source never uses (see ``RootResolver``).
"""

import json
import os
import re
import sqlite3
import sys
from collections import Counter, defaultdict

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
MORPHOLOGY_PATH = os.path.join(DATA_DIR, "quran-morphology.txt")

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
    # Qālūn and Warsh write a final yā' as yā' barī (فِے, رَبِّے).
    text = text.replace("\u06D2", "\u064A")
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


def read_text_file(path, label):
    """Load a UTF-8 text input and raise a readable error on failure."""
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read()
    except FileNotFoundError as exc:
        raise ValueError(f"{label} missing: {path}") from exc
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

    try:
        morphology_text = read_text_file(MORPHOLOGY_PATH, "Morphology source")
        if not morphology_text.strip():
            raise ValueError(f"Morphology source empty: {MORPHOLOGY_PATH}")
    except ValueError as exc:
        errors.append(str(exc))
        morphology_text = ""

    return word_root_map, mushaf_payloads, morphology_text, errors


def plain_arabic_display_text(text):
    """Render Uthmani text as a plain Arabic search label."""
    text = re.sub(r"\u0671", "\u0627", text)
    text = re.sub(r"[\u06E5\u06E6]", "", text)
    text = re.sub(r"\u065e", "\u064c", text)
    text = re.sub(r"\u06E1", "", text)
    text = re.sub(r"[\u0610-\u061A\u064B-\u0650\u0652-\u065F\u0670\u06D6-\u06ED]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_morphology_lemma(features, fallback_text):
    """Extract the lemma from a morphology feature string."""
    match = re.search(r"LEM:([^|]+)", features)
    return match.group(1) if match else fallback_text


def build_morphology_search_text(parts, use_lemma_for_lexical=False):
    """Build searchable text for a morphology token slice."""
    text_parts = []
    for form, _pos, features in parts:
        text_part = form
        if use_lemma_for_lexical and "PREF" not in features:
            text_part = extract_morphology_lemma(features, form)
        text_parts.append(text_part)
    return "".join(text_parts)


def build_morphology_search_record(parts, stripped_prefix_count=0, stripped_article_count=0, use_lemma_for_lexical=False):
    """Build one searchable morphology record for a token slice."""
    search_text = build_morphology_search_text(parts, use_lemma_for_lexical=use_lemma_for_lexical)
    search_simple = normalize_text_search(search_text)
    if not search_simple:
        return None

    return {
        "search_simple": search_simple,
        "search_text": search_text,
        "stripped_prefix_count": stripped_prefix_count,
        "stripped_article_count": stripped_article_count,
    }


def build_orthographic_morphology_search_record(parts, stripped_prefix_count=0, stripped_article_count=0):
    """Build a plain-writing search record from Uthmani orthography."""
    search_text = plain_arabic_display_text(build_morphology_search_text(parts))
    search_simple = normalize_text_search(search_text)
    if not search_simple:
        return None

    return {
        "search_simple": search_simple,
        "search_text": search_text,
        "stripped_prefix_count": stripped_prefix_count,
        "stripped_article_count": stripped_article_count,
    }


def deduplicate_morphology_records(records):
    """Deduplicate morphology records by their searchable text."""
    unique_records = {}
    for record in records:
        if record is None:
            continue
        unique_records[
            (
                record["search_simple"],
                record["search_text"],
                record["stripped_prefix_count"],
                record["stripped_article_count"],
            )
        ] = record
    return list(unique_records.values())


def is_article_prefix(form, features):
    """Return True when this morphology part is the detachable article."""
    if "PREF" not in features:
        return False
    lemma = normalize_text_search(extract_morphology_lemma(features, form))
    return lemma == "\u0627\u0644"


def build_morphology_search_records(parts):
    """Build searchable surface variants for one morphology token."""
    full_text = "".join(form for form, _pos, _features in parts)
    full_simple = normalize_text_search(full_text)
    if not full_simple:
        return None, [], []

    removable_prefix_count = 0
    for form, _pos, features in parts:
        if "PREF" not in features:
            break

        lemma = normalize_text_search(extract_morphology_lemma(features, form))
        if lemma not in {"\u0648", "\u0641", "\u0628", "\u0643", "\u0644"}:
            break

        removable_prefix_count += 1

    word_records = []
    phrase_records = []

    for prefix_count in range(removable_prefix_count + 1):
        remaining_parts = parts[prefix_count:]
        word_records.append(build_morphology_search_record(remaining_parts, stripped_prefix_count=prefix_count))
        word_records.append(build_orthographic_morphology_search_record(remaining_parts, stripped_prefix_count=prefix_count))
        phrase_records.append(build_morphology_search_record(remaining_parts, stripped_prefix_count=prefix_count))
        phrase_records.append(build_orthographic_morphology_search_record(remaining_parts, stripped_prefix_count=prefix_count))
        phrase_records.append(
            build_morphology_search_record(
                remaining_parts,
                stripped_prefix_count=prefix_count,
                use_lemma_for_lexical=True,
            )
        )

        if remaining_parts and is_article_prefix(remaining_parts[0][0], remaining_parts[0][2]):
            phrase_records.append(
                build_morphology_search_record(
                    remaining_parts[1:],
                    stripped_prefix_count=prefix_count,
                    stripped_article_count=1,
                )
            )
            phrase_records.append(
                build_orthographic_morphology_search_record(
                    remaining_parts[1:],
                    stripped_prefix_count=prefix_count,
                    stripped_article_count=1,
                )
            )
            phrase_records.append(
                build_morphology_search_record(
                    remaining_parts[1:],
                    stripped_prefix_count=prefix_count,
                    stripped_article_count=1,
                    use_lemma_for_lexical=True,
                )
            )

    return full_simple, deduplicate_morphology_records(word_records), deduplicate_morphology_records(phrase_records)


def build_morphology_variant_rows(morphology_text):
    """Build offline word/phrase morphology variants from the morphology source."""
    groups = defaultdict(list)
    for raw_line in morphology_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        ref, form, pos, features = line.split("\t")
        word_key = ":".join(ref.split(":")[:3])
        groups[word_key].append((form, pos, features))

    variant_rows = []
    seen_rows = set()
    for parts in groups.values():
        full_simple, word_records, phrase_records = build_morphology_search_records(parts)
        if not full_simple:
            continue

        for scope, records in (("word", word_records), ("phrase", phrase_records)):
            for record in records:
                row = (
                    full_simple,
                    record["search_simple"],
                    record["search_text"],
                    record["stripped_prefix_count"],
                    record["stripped_article_count"],
                    scope,
                )
                if row in seen_rows:
                    continue
                seen_rows.add(row)
                variant_rows.append(row)

    return variant_rows


# =============================================================================
# DATABASE BUILDING
# =============================================================================


# How far (in verses, within the surah) a word is looked for in the morphology
# source when its position doesn't line up: covers the verse-numbering
# differences between the narrations (Kufan vs Madinan counts, …).
ROOT_SEARCH_WINDOW = 8


def loose_letters(text):
    """Letters of a word with hamza seats and alifs set aside, so that the
    narrations' spellings of one word meet (يومنون / يؤمنون, بيسما / بئسما)."""
    return normalize_for_matching(text).replace("\u0624", "\u0648").replace("\u0626", "\u064A").replace("\u0627", "")


class RootResolver:
    """The root of each word of a mushaf, from the morphology source.

    Looking roots up by spelling alone is wrong: «قل» is قول in «قُلۡ» but قلل
    in «قَلَّ», and the particle «مِن» shares its letters with «مَنّ» (منن).
    The source gives a root per word position (none for particles), so a word
    takes, in order:

    1. ``position`` — the source's word at the same surah:verse:word, when it
       has the same letters (Ḥafṣ and Shuʿba, nearly everywhere);
    2. ``nearby`` — the nearest source word with the same letters in the same
       surah, within ``ROOT_SEARCH_WINDOW`` verses (narrations that number or
       split verses differently), then the nearest one with the same letters
       once hamza seats and alifs are set aside (``loose_letters``: Warsh's
       «يُومِنُونَ» is «يُؤْمِنُونَ»);
    3. ``spelling`` — the source's most frequent reading of that spelling
       (a root, or none);
    4. ``dictionary`` — the word-to-root dictionary, for spellings the source
       never uses (other narrations' orthography).
    """

    def __init__(self, morphology_text, word_root_map):
        self.word_root_map = word_root_map
        forms = defaultdict(str)
        roots = {}
        for raw_line in morphology_text.splitlines():
            fields = raw_line.strip().split("\t")
            if len(fields) != 4:
                continue
            ref, form, _pos, features = fields
            try:
                surah, ayah, word = (int(part) for part in ref.split(":")[:3])
            except ValueError:
                continue
            key = (surah, ayah, word)
            forms[key] += form
            match = re.search(r"ROOT:([^|]+)", features)
            if match and key not in roots:
                roots[key] = match.group(1)

        self.by_position = {}
        self.by_ayah = defaultdict(lambda: defaultdict(list))
        self.by_ayah_loose = defaultdict(lambda: defaultdict(list))
        readings = defaultdict(Counter)
        for key, form in forms.items():
            normalized = normalize_for_matching(form)
            root = roots.get(key)
            self.by_position[key] = (normalized, root)
            self.by_ayah[key[:2]][normalized].append((key[2], root))
            self.by_ayah_loose[key[:2]][loose_letters(form)].append((key[2], root))
            readings[normalized][root] += 1
        # Most frequent first; ties broken by the root's text (none first), so
        # the build stays deterministic.
        self.by_spelling = {
            normalized: min(counts.items(), key=lambda item: (-item[1], item[0] or ""))[0]
            for normalized, counts in readings.items()
        }
        self.sources = Counter()

    def resolve(self, surah, ayah, word, normalized):
        """The roots of one word (none, one, or the dictionary's list)."""
        at_position = self.by_position.get((surah, ayah, word))
        if at_position and at_position[0] == normalized:
            self.sources["position"] += 1
            return [at_position[1]] if at_position[1] else []

        for index, letters in ((self.by_ayah, normalized), (self.by_ayah_loose, loose_letters(normalized))):
            found, root = self._nearest(index, surah, ayah, word, letters)
            if found:
                self.sources["nearby"] += 1
                return [root] if root else []

        if normalized in self.by_spelling:
            self.sources["spelling"] += 1
            root = self.by_spelling[normalized]
            return [root] if root else []

        self.sources["dictionary"] += 1
        return list(self.word_root_map.get(normalized, []))

    def _nearest(self, index, surah, ayah, word, letters):
        """The source word spelt ``letters`` closest to surah:ayah:word (the
        nearest verse, then the nearest position): (found, its root)."""
        best = None
        for distance in range(ROOT_SEARCH_WINDOW + 1):
            for candidate in {ayah - distance, ayah + distance}:
                for position, root in index.get((surah, candidate), {}).get(letters, ()):
                    rank = (distance, abs(position - word))
                    if best is None or rank < best[0]:
                        best = (rank, root)
            if best is not None:
                return True, best[1]
        return False, None


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

        CREATE TABLE ayah_words (
            ayah_id INTEGER NOT NULL,
            mushaf_id INTEGER NOT NULL,
            surah_id INTEGER NOT NULL,
            number_in_surah INTEGER NOT NULL,
            global_index INTEGER NOT NULL,
            word_position INTEGER NOT NULL,
            word_text TEXT NOT NULL,
            word_simple TEXT NOT NULL,
            PRIMARY KEY (ayah_id, word_position),
            FOREIGN KEY(ayah_id) REFERENCES ayahs(id)
        );

        CREATE TABLE morphology_search_variants (
            surface_simple TEXT NOT NULL,
            search_simple TEXT NOT NULL,
            search_text TEXT NOT NULL,
            stripped_prefix_count INTEGER NOT NULL DEFAULT 0,
            stripped_article_count INTEGER NOT NULL DEFAULT 0,
            scope TEXT NOT NULL
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
        CREATE INDEX idx_aw_mushaf_word_simple ON ayah_words(mushaf_id, word_simple);
        CREATE INDEX idx_aw_ayah_position ON ayah_words(ayah_id, word_position);
        CREATE INDEX idx_aw_mushaf_surah_number ON ayah_words(mushaf_id, surah_id, number_in_surah, word_position);
        CREATE INDEX idx_msv_surface_scope ON morphology_search_variants(surface_simple, scope);
        CREATE INDEX idx_msv_scope_search_surface ON morphology_search_variants(scope, search_simple, surface_simple);
    """
    )


def process_mushaf(cursor, mushaf, quran_data, root_resolver, root_cache, insert_surahs):
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
                roots_found = root_resolver.resolve(surah_id, ayah_number, index, word_normalized)

                cursor.execute(
                    """
                    INSERT INTO ayah_words (
                        ayah_id, mushaf_id, surah_id, number_in_surah, global_index,
                        word_position, word_text, word_simple
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        ayah_db_id,
                        mushaf_id,
                        surah_id,
                        ayah_number,
                        global_idx - 1,
                        index,
                        word_text,
                        word_simple,
                    ),
                )

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
    sources = root_resolver.sources
    print(
        "  Roots taken by "
        + ", ".join(f"{name}: {sources[name]}" for name in ("position", "nearby", "spelling", "dictionary"))
    )
    sources.clear()


def populate_morphology_variants(cursor, morphology_text):
    """Insert precomputed morphology search variants into SQLite."""
    variant_rows = build_morphology_variant_rows(morphology_text)
    cursor.executemany(
        """
        INSERT INTO morphology_search_variants (
            surface_simple,
            search_simple,
            search_text,
            stripped_prefix_count,
            stripped_article_count,
            scope
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        variant_rows,
    )
    return len(variant_rows)


def build_db():
    """Build the database and return a shell-friendly status code."""
    print("=" * 60)
    print("Quran Database Builder V7 - Rich Metadata & Decoupled Morphology")
    print("=" * 60)

    word_root_map, mushaf_payloads, morphology_text, validation_errors = validate_inputs()
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

        tables = [
            "morphology_search_variants",
            "ayah_words",
            "word_occurrences",
            "roots",
            "ayahs",
            "surahs",
            "mushafs",
        ]
        for table in tables:
            cursor.execute(f"DROP TABLE IF EXISTS {table}")

        create_database_schema(cursor)

        for mushaf in MUSHAFS:
            cursor.execute(
                "INSERT INTO mushafs (id, name, description) VALUES (?, ?, ?)",
                (mushaf["id"], mushaf["name"], mushaf["description"]),
            )

        root_cache = {}
        root_resolver = RootResolver(morphology_text, word_root_map)
        first_mushaf = True
        for mushaf in MUSHAFS:
            process_mushaf(
                cursor,
                mushaf,
                mushaf_payloads[mushaf["id"]],
                root_resolver,
                root_cache,
                first_mushaf,
            )
            first_mushaf = False

        variant_count = populate_morphology_variants(cursor, morphology_text)

        conn.commit()

        cursor.execute("SELECT COUNT(*) FROM mushafs")
        mushaf_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM ayahs")
        ayah_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM roots")
        root_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM word_occurrences")
        word_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM ayah_words")
        ayah_word_count = cursor.fetchone()[0]
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
    print(f"  Ayah Words: {ayah_word_count}")
    print(f"  Morphology Variants: {variant_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(build_db())
