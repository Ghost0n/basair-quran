from collections import defaultdict
from difflib import SequenceMatcher
import logging
import math
import os
import re
import sqlite3
import time
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Setup logging for monitoring
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Quran Insight AI V3 - Multi-Mushaf")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "data", "quran.db")
STATIC_DIR = os.path.join(BASE_DIR, "static")
MORPHOLOGY_PATH = os.path.join(BASE_DIR, "data", "quran-morphology.txt")

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 50
SUPPORTED_PREFIX_LEMMAS = {"\u0648", "\u0641", "\u0628", "\u0643", "\u0644"}
ARTICLE_LEMMA = "\u0627\u0644"
PHRASE_SUGGESTION_MIN_CONFIDENCE = 0.88
PHRASE_SUGGESTION_MIN_TOKEN_CONFIDENCE = 0.72
PHRASE_SUGGESTION_MIN_LEAD = 0.05

# Connection pool (reuse connections)
_db_connection = None
_morphology_search_index = None
_mushaf_ayah_tokens_cache = {}
_mushaf_phrase_metadata_cache = {}
_mushaf_page_index_cache = {}


def close_db_connection():
    """Close the cached SQLite connection."""
    global _db_connection, _mushaf_ayah_tokens_cache, _mushaf_phrase_metadata_cache, _mushaf_page_index_cache
    if _db_connection is not None:
        _db_connection.close()
        _db_connection = None
    _mushaf_ayah_tokens_cache = {}
    _mushaf_phrase_metadata_cache = {}
    _mushaf_page_index_cache = {}


def reset_morphology_search_index():
    """Reset the cached morphology search index."""
    global _morphology_search_index
    _morphology_search_index = None


def get_db():
    global _db_connection
    if _db_connection is None:
        _db_connection = sqlite3.connect(DB_PATH, check_same_thread=False)
        _db_connection.row_factory = sqlite3.Row
        # Enable WAL mode for better concurrent read performance
        _db_connection.execute("PRAGMA journal_mode=WAL")
        _db_connection.execute("PRAGMA cache_size=10000")
        _db_connection.execute("PRAGMA temp_store=MEMORY")
    return _db_connection


def normalize_text_search(text):
    """Matches build_db normalization logic."""
    text = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]", "", text)
    text = re.sub(r"[\u0623\u0625\u0622\u0671]", "\u0627", text)
    text = text.replace("\u0621", "")
    return text.strip()


def normalize_query_search(text):
    """Normalize search text while collapsing repeated whitespace."""
    return " ".join(normalize_text_search(text).split())


def standardize_uthmani(text):
    """Normalize Uthmani script peculiarities for exact comparison."""
    text = re.sub(r"\u0671", "\u0627", text)
    text = re.sub(r"\u0670", "\u0627", text)
    text = re.sub(r"[\u06E5\u06E6]", "", text)
    text = re.sub(r"\u065e", "\u064c", text)
    text = re.sub(r"[\u06E1\u0652]", "", text)
    text = re.sub(r"[\u06D6-\u06ED]", "", text)
    return text


def uthmani_matches_query(query_standard, candidate_text):
    """Compare a candidate Uthmani form with a diacritized query."""
    candidate_standard = standardize_uthmani(candidate_text)
    if candidate_standard == query_standard:
        return True

    if query_standard.startswith("ا") and (len(query_standard) == 1 or query_standard[1] not in "َُِ"):
        candidate_without_wasl_vowel = re.sub(r"^ا[َُِ]", "ا", candidate_standard)
        return candidate_without_wasl_vowel == query_standard

    return False


def remove_quranic_pause_marks(text):
    """Remove Quranic pause symbols while preserving vocalization marks."""
    return re.sub(r"[\u06D6-\u06ED]", "", text).strip()


def plain_arabic_display_text(text):
    """Render Uthmani text as a plain Arabic search label."""
    text = standardize_uthmani(text)
    text = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def is_arabic_mark(char):
    """Return True for Quranic/Arabic marks that attach to a base letter."""
    return bool(re.match(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]", char))


def strip_leading_base_letters(text, count):
    """Strip a number of leading Arabic base letters plus their attached marks."""
    if count <= 0:
        return text

    stripped_letters = 0
    index = 0
    while index < len(text) and stripped_letters < count:
        if not is_arabic_mark(text[index]) and not text[index].isspace():
            stripped_letters += 1
        index += 1

    while index < len(text) and is_arabic_mark(text[index]):
        index += 1

    return text[index:].strip()


def build_candidate_surface_text(surface_text, record):
    """Apply morphology-backed stripping to an actual Quran token surface."""
    stripped_count = record.get("stripped_prefix_count", 0)
    if record.get("stripped_article_count", 0):
        stripped_count += 2
    return strip_leading_base_letters(surface_text, stripped_count)


def has_query_diacritics(text):
    """Return True when the query contains Arabic diacritics."""
    return bool(re.search(r"[\u064B-\u0652\u0670]", text))


def compute_total_pages(total_items, page_size):
    """Return at least one page for non-empty results."""
    return max(1, math.ceil(total_items / page_size))


def clamp_page(page, total_pages):
    """Keep page numbers inside the available range."""
    return max(1, min(page, total_pages))


def build_result_key(mode, root_id=None, q_simple=""):
    """Build a stable key for result cards."""
    if mode == "root":
        return f"root:{root_id}"
    return f"exact:{q_simple}"


def extract_morphology_lemma(features, fallback_text):
    """Extract the lemma from a morphology feature string."""
    match = re.search(r"LEM:([^|]+)", features)
    return match.group(1) if match else fallback_text


def build_empty_morphology_search_index():
    """Return the empty fallback morphology index."""
    return {
        "form_to_surfaces": {},
        "surface_to_forms": {},
        "search_forms": [],
        "phrase_surface_to_forms": {},
    }


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
        unique_records[(record["search_simple"], record["search_text"])] = record
    return list(unique_records.values())


def is_article_prefix(form, features):
    """Return True when this morphology part is the detachable article."""
    if "PREF" not in features:
        return False
    lemma = normalize_text_search(extract_morphology_lemma(features, form))
    return lemma == ARTICLE_LEMMA


def tokenize_exact_query(query):
    """Split an exact query into normalized token descriptors."""
    tokens = []
    for raw_token in query.split():
        raw_token = raw_token.strip()
        if not raw_token:
            continue

        simple = normalize_text_search(raw_token)
        if not simple:
            continue

        tokens.append(
            {
                "raw": raw_token,
                "simple": simple,
                "has_diacritics": has_query_diacritics(raw_token),
                "standardized": standardize_uthmani(raw_token),
            }
        )
    return tokens


def build_exact_query_simple(query):
    """Return the canonical normalized exact-query text."""
    return " ".join(token["simple"] for token in tokenize_exact_query(query))


def build_exact_query_label(query, query_tokens):
    """Build a normalized display label for exact search results."""
    if query_tokens:
        return " ".join(token["raw"] for token in query_tokens)
    return query.strip()


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
        if lemma not in SUPPORTED_PREFIX_LEMMAS:
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


def get_morphology_search_index():
    """Load the morphology-backed search index lazily."""
    global _morphology_search_index
    if _morphology_search_index is not None:
        return _morphology_search_index

    if not os.path.exists(MORPHOLOGY_PATH):
        logger.warning("Morphology file not found at %s; smart prefix search disabled.", MORPHOLOGY_PATH)
        _morphology_search_index = build_empty_morphology_search_index()
        return _morphology_search_index

    groups = defaultdict(list)
    with open(MORPHOLOGY_PATH, "r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.rstrip("\n")
            if not line:
                continue
            ref, form, pos, features = line.split("\t")
            word_key = ":".join(ref.split(":")[:3])
            groups[word_key].append((form, pos, features))

    form_to_surfaces = defaultdict(set)
    surface_to_forms = defaultdict(dict)
    phrase_surface_to_forms = defaultdict(dict)

    for parts in groups.values():
        full_simple, records, phrase_records = build_morphology_search_records(parts)
        if not full_simple:
            continue

        for record in records:
            form_to_surfaces[record["search_simple"]].add(full_simple)
            surface_to_forms[full_simple][(record["search_simple"], record["search_text"])] = record
        for record in phrase_records:
            phrase_surface_to_forms[full_simple][(record["search_simple"], record["search_text"])] = record

    _morphology_search_index = {
        "form_to_surfaces": {search_simple: sorted(surfaces) for search_simple, surfaces in form_to_surfaces.items()},
        "surface_to_forms": {
            surface_simple: list(record_map.values()) for surface_simple, record_map in surface_to_forms.items()
        },
        "search_forms": sorted(form_to_surfaces),
        "phrase_surface_to_forms": {
            surface_simple: list(record_map.values()) for surface_simple, record_map in phrase_surface_to_forms.items()
        },
    }
    logger.info(
        "Loaded morphology search index with %s searchable forms from %s",
        len(_morphology_search_index["form_to_surfaces"]),
        MORPHOLOGY_PATH,
    )
    return _morphology_search_index


def resolve_exact_word_surfaces(q_simple):
    """Resolve the concrete surface forms that should match this exact query."""
    if not q_simple:
        return []

    morphology_index = get_morphology_search_index()
    surfaces = list(morphology_index["form_to_surfaces"].get(q_simple, []))
    ordered_surfaces = [q_simple]
    ordered_surfaces.extend(surface for surface in surfaces if surface != q_simple)
    return ordered_surfaces


def resolve_prefix_word_surfaces(q_simple, limit):
    """Resolve surface forms whose smart-search variants share the given prefix."""
    if not q_simple or limit <= 0:
        return []

    morphology_index = get_morphology_search_index()
    ordered_surfaces = []
    seen_surfaces = set()

    for search_simple in morphology_index["search_forms"]:
        if not search_simple.startswith(q_simple):
            continue

        for surface_simple in morphology_index["form_to_surfaces"].get(search_simple, []):
            if surface_simple in seen_surfaces:
                continue
            seen_surfaces.add(surface_simple)
            ordered_surfaces.append(surface_simple)
            if len(ordered_surfaces) >= limit:
                return ordered_surfaces

    return ordered_surfaces


def get_phrase_surface_records(surface_simple, surface_text):
    """Return phrase-aware searchable records for one Quran token."""
    morphology_index = get_morphology_search_index()
    records = morphology_index["phrase_surface_to_forms"].get(surface_simple, [])
    if records:
        return records
    return [
        {
            "search_simple": surface_simple,
            "search_text": surface_text,
            "stripped_prefix_count": 0,
            "stripped_article_count": 0,
        }
    ]


def get_candidate_phrase_records(candidate_token):
    """Return cached phrase records for a token when available."""
    return candidate_token.get("phrase_records") or get_phrase_surface_records(
        candidate_token["word_simple"],
        candidate_token["word_text"],
    )


def collect_mushaf_phrase_forms(ayahs):
    """Collect searchable phrase forms present in one mushaf token cache."""
    forms = set()
    for ayah in ayahs:
        for token in ayah["tokens"]:
            for record in get_candidate_phrase_records(token):
                forms.add(record["search_simple"])
    return forms


def build_phrase_similarity_score_maps(query_tokens, phrase_forms):
    """Pre-score possible fuzzy phrase forms and reject unrelated no-result phrases early."""
    score_maps = []
    for query_token in query_tokens:
        best_score = 0.0
        score_map = {}
        query_simple = query_token["simple"]
        query_length = len(query_simple)
        candidate_forms = [
            phrase_form
            for phrase_form in phrase_forms
            if phrase_form
            and query_simple
            and phrase_form[0] == query_simple[0]
            and min(len(phrase_form), query_length) / max(len(phrase_form), query_length) >= 0.55
        ]

        if not candidate_forms:
            return None

        for phrase_form in candidate_forms:
            score = SequenceMatcher(None, query_token["simple"], phrase_form).ratio()
            if score > best_score:
                best_score = score
            if score >= PHRASE_SUGGESTION_MIN_TOKEN_CONFIDENCE:
                score_map[phrase_form] = score

        if best_score < PHRASE_SUGGESTION_MIN_TOKEN_CONFIDENCE:
            return None
        score_maps.append(score_map)

    return score_maps


def select_best_phrase_candidate_record(query_token, candidate_token, score_map=None):
    """Return the closest phrase-aware morphology record for one Quran token."""
    best_record = None
    best_score = -1.0
    best_diacritic_match = -1
    best_penalty = math.inf

    for record in get_candidate_phrase_records(candidate_token):
        if score_map is not None and record["search_simple"] not in score_map:
            continue

        similarity = (
            score_map[record["search_simple"]]
            if score_map is not None
            else SequenceMatcher(None, query_token["simple"], record["search_simple"]).ratio()
        )
        diacritic_match = 0
        if query_token["has_diacritics"]:
            diacritic_match = int(uthmani_matches_query(query_token["standardized"], record["search_text"]))

        penalty = record["stripped_prefix_count"] + record["stripped_article_count"]
        if (
            similarity > best_score
            or (
                similarity == best_score
                and (
                    diacritic_match > best_diacritic_match
                    or (diacritic_match == best_diacritic_match and penalty < best_penalty)
                )
            )
        ):
            best_record = record
            best_score = similarity
            best_diacritic_match = diacritic_match
            best_penalty = penalty

    return best_record, max(best_score, 0.0)


def phrase_query_token_matches_candidate(query_token, candidate_token):
    """Return True when one query token matches one Quran token directly."""
    candidate_records = get_candidate_phrase_records(candidate_token)
    if query_token["has_diacritics"]:
        if (
            candidate_token["word_simple"] == query_token["simple"]
            and uthmani_matches_query(query_token["standardized"], candidate_token["word_text"])
        ):
            return True
        return any(
            record["search_simple"] == query_token["simple"]
            and uthmani_matches_query(
                query_token["standardized"],
                build_candidate_surface_text(candidate_token["word_text"], record),
            )
            for record in candidate_records
        )
    return any(record["search_simple"] == query_token["simple"] for record in candidate_records)


def phrase_query_token_similarity(query_token, candidate_token):
    """Return the best fuzzy similarity between a query token and Quran token."""
    if not query_token["simple"]:
        return 0.0

    _best_record, best_score = select_best_phrase_candidate_record(query_token, candidate_token)
    return best_score


def format_suggestion_text(text, with_chakl):
    """Format a suggestion label according to the requested vocalization mode."""
    if with_chakl:
        return remove_quranic_pause_marks(text)
    return plain_arabic_display_text(text)


def get_preferred_suggestion_text(surface_simple, q_simple, with_chakl=False, surface_text=None):
    """Return the best display form for a smart suggestion."""
    morphology_index = get_morphology_search_index()
    records = morphology_index["surface_to_forms"].get(surface_simple, [])
    matching_records = [
        record
        for record in records
        if record["search_simple"].startswith(q_simple)
    ]
    if not matching_records:
        return None

    matching_records.sort(
        key=lambda record: (
            0 if has_query_diacritics(record["search_text"]) == with_chakl else 1,
            -record["stripped_prefix_count"],
            len(record["search_simple"]),
            record["search_text"],
        )
    )
    best_record = matching_records[0]
    suggestion_source = (
        build_candidate_surface_text(surface_text, best_record)
        if surface_text is not None
        else best_record["search_text"]
    )
    return format_suggestion_text(suggestion_source, with_chakl)


def fetch_word_suggestions_by_surface_simples(cursor, surface_simples, q_simple, mushaf, limit, with_chakl=False):
    """Fetch distinct word suggestions for a concrete list of normalized surfaces."""
    if not surface_simples or limit <= 0:
        return []

    placeholders = ",".join("?" for _ in surface_simples)
    cursor.execute(
        f"""
        SELECT DISTINCT wo.word_text, wo.word_simple
        FROM word_occurrences wo
        JOIN ayahs a ON wo.ayah_id = a.id
        WHERE wo.word_simple IN ({placeholders}) AND a.mushaf_id = ?
        LIMIT ?
        """,
        [*surface_simples, mushaf, limit],
    )
    rows = cursor.fetchall()
    surface_rank = {surface_simple: index for index, surface_simple in enumerate(surface_simples)}
    rows = sorted(rows, key=lambda row: (surface_rank.get(row["word_simple"], len(surface_rank)), row["word_text"]))
    suggestions = []
    for row in rows:
        display_text = get_preferred_suggestion_text(
            row["word_simple"],
            q_simple,
            with_chakl,
            row["word_text"],
        ) or format_suggestion_text(row["word_text"], with_chakl)
        display_simple = normalize_text_search(display_text)
        if not exact_candidate_matches_query(row, display_text, display_simple):
            display_text = format_suggestion_text(row["word_text"], with_chakl)
            display_simple = row["word_simple"]
        if not exact_candidate_matches_query(row, display_text, display_simple):
            continue
        suggestions.append({"type": "word", "text": display_text, "label": display_text})
    return suggestions


def build_root_suggestions(cursor, like_q, limit):
    """Fetch root suggestions for a query prefix."""
    cursor.execute("SELECT root_text FROM roots WHERE root_simple LIKE ? LIMIT ?", (like_q, limit))
    return [
        {
            "type": "root",
            "text": row["root_text"],
            "label": f"\u062c\u0630\u0631 {row['root_text']}",
        }
        for row in cursor.fetchall()
    ]


def build_word_suggestions(cursor, q_simple, mushaf, limit, with_chakl=False):
    """Fetch word suggestions for a query prefix and mushaf."""
    if not q_simple or limit <= 0:
        return []

    like_q = f"{q_simple}%"
    cursor.execute(
        """
        SELECT DISTINCT wo.word_text, wo.word_simple
        FROM word_occurrences wo
        JOIN ayahs a ON wo.ayah_id = a.id
        WHERE wo.word_simple LIKE ? AND a.mushaf_id = ?
        LIMIT ?
        """,
        (like_q, mushaf, limit),
    )

    suggestions = []
    seen_texts = set()
    for row in cursor.fetchall():
        display_text = get_preferred_suggestion_text(
            row["word_simple"],
            q_simple,
            with_chakl,
            row["word_text"],
        ) or format_suggestion_text(row["word_text"], with_chakl)
        suggestions.append({"type": "word", "text": display_text, "label": display_text})
        seen_texts.add(display_text)

    remaining = limit - len(suggestions)
    if remaining <= 0:
        return suggestions

    smart_surfaces = [
        surface_simple
        for surface_simple in resolve_prefix_word_surfaces(q_simple, limit * 5)
        if not surface_simple.startswith(q_simple)
    ]
    for item in fetch_word_suggestions_by_surface_simples(
        cursor,
        smart_surfaces,
        q_simple,
        mushaf,
        remaining,
        with_chakl,
    ):
        if item["text"] in seen_texts:
            continue
        suggestions.append(item)
        seen_texts.add(item["text"])
        if len(suggestions) >= limit:
            break

    return suggestions


def phrase_query_token_prefix_matches_candidate(query_token, candidate_token):
    """Return True when a Quran token can complete the current phrase token prefix."""
    if not query_token["simple"]:
        return False
    return any(
        record["search_simple"].startswith(query_token["simple"])
        for record in get_candidate_phrase_records(candidate_token)
    )


def build_phrase_suggestion_text(window, with_chakl=False):
    """Build a display suggestion for a matched Quran phrase window."""
    return " ".join(format_suggestion_text(token["word_text"], with_chakl) for token in window)


def build_phrase_suggestions(cursor, q, mushaf, limit, with_chakl=False):
    """Suggest only real contiguous phrases from the selected mushaf."""
    query_tokens = tokenize_exact_query(q)
    token_count = len(query_tokens)
    if token_count < 2 or limit <= 0:
        return []

    metadata = get_mushaf_phrase_metadata(cursor, mushaf)
    ayahs = metadata["ayahs"]
    suggestions = []
    seen_phrases = set()

    for ayah_index, token_index in metadata["positions_by_form"].get(query_tokens[0]["simple"], []):
        ayah = ayahs[ayah_index]
        tokens = ayah["tokens"]
        if token_index + token_count > len(tokens):
            continue

        window = tokens[token_index : token_index + token_count]
        if not has_consecutive_word_positions(window):
            continue
        if not all(
            phrase_query_token_matches_candidate(query_token, candidate_token)
            for query_token, candidate_token in zip(query_tokens[:-1], window[:-1])
        ):
            continue
        if not phrase_query_token_prefix_matches_candidate(query_tokens[-1], window[-1]):
            continue

        phrase_text = build_phrase_suggestion_text(window, with_chakl)
        if phrase_text in seen_phrases:
            continue
        seen_phrases.add(phrase_text)
        suggestions.append({"type": "word", "text": phrase_text, "label": phrase_text})
        if len(suggestions) >= limit:
            return suggestions

    return suggestions


def get_root_ids(cursor, q_simple, mushaf):
    """Resolve all roots linked to the query for the selected mushaf."""
    root_ids = set()
    surface_simples = resolve_exact_word_surfaces(q_simple)
    if not surface_simples:
        surface_simples = [q_simple]

    cursor.execute("SELECT id FROM roots WHERE root_simple = ?", (q_simple,))
    root_ids.update(row["id"] for row in cursor.fetchall())

    placeholders = ",".join("?" for _ in surface_simples)
    cursor.execute(
        f"""
        SELECT DISTINCT wo.root_id
        FROM word_occurrences wo
        JOIN ayahs a ON wo.ayah_id = a.id
        WHERE wo.word_simple IN ({placeholders}) AND wo.root_id IS NOT NULL AND a.mushaf_id = ?
        """,
        [*surface_simples, mushaf],
    )
    root_ids.update(row["root_id"] for row in cursor.fetchall())
    return sorted(root_ids)


def fetch_mushaf_ayah_tokens(cursor, mushaf):
    """Fetch all Quran tokens for one mushaf grouped by ayah."""
    cache_key = (DB_PATH, mushaf)
    if cache_key in _mushaf_ayah_tokens_cache:
        return _mushaf_ayah_tokens_cache[cache_key]

    cursor.execute(
        """
        SELECT
            a.id AS ayah_id,
            a.mushaf_id,
            s.name_arabic AS surah_name,
            a.surah_id,
            a.number_in_surah,
            a.text_uthmani,
            a.global_index,
            wo.word_position,
            wo.word_text,
            wo.word_simple
        FROM word_occurrences wo
        JOIN ayahs a ON wo.ayah_id = a.id
        JOIN surahs s ON a.surah_id = s.id
        WHERE a.mushaf_id = ?
        ORDER BY a.surah_id, a.number_in_surah, wo.word_position
        """,
        (mushaf,),
    )

    ayahs = []
    current_ayah = None
    phrase_record_cache = {}
    for row in cursor.fetchall():
        if current_ayah is None or current_ayah["ayah_id"] != row["ayah_id"]:
            current_ayah = {
                "ayah_id": row["ayah_id"],
                "mushaf_id": row["mushaf_id"],
                "surah_id": row["surah_id"],
                "surah_name": row["surah_name"],
                "number_in_surah": row["number_in_surah"],
                "text_uthmani": row["text_uthmani"],
                "global_index": row["global_index"],
                "tokens": [],
            }
            ayahs.append(current_ayah)

        record_key = (row["word_simple"], row["word_text"])
        if record_key not in phrase_record_cache:
            phrase_record_cache[record_key] = get_phrase_surface_records(row["word_simple"], row["word_text"])

        current_ayah["tokens"].append(
            {
                "word_position": row["word_position"],
                "word_text": row["word_text"],
                "word_simple": row["word_simple"],
                "phrase_records": phrase_record_cache[record_key],
            }
        )

    _mushaf_ayah_tokens_cache[cache_key] = ayahs
    return ayahs


def get_mushaf_phrase_metadata(cursor, mushaf):
    """Return cached phrase-search metadata for one mushaf."""
    cache_key = (DB_PATH, mushaf)
    if cache_key in _mushaf_phrase_metadata_cache:
        return _mushaf_phrase_metadata_cache[cache_key]

    ayahs = fetch_mushaf_ayah_tokens(cursor, mushaf)
    phrase_forms = set()
    positions_by_form = defaultdict(list)
    seen_positions = set()

    for ayah_index, ayah in enumerate(ayahs):
        for token_index, token in enumerate(ayah["tokens"]):
            for record in get_candidate_phrase_records(token):
                form = record["search_simple"]
                phrase_forms.add(form)
                position_key = (form, ayah_index, token_index)
                if position_key in seen_positions:
                    continue
                seen_positions.add(position_key)
                positions_by_form[form].append((ayah_index, token_index))

    metadata = {
        "ayahs": ayahs,
        "phrase_forms": phrase_forms,
        "positions_by_form": dict(positions_by_form),
    }
    _mushaf_phrase_metadata_cache[cache_key] = metadata
    return metadata


def has_consecutive_word_positions(window):
    """Return True when all tokens in a window are consecutive."""
    return all(window[index]["word_position"] == window[0]["word_position"] + index for index in range(len(window)))


def find_phrase_matches(ayahs, query_tokens, metadata=None):
    """Find direct phrase matches for a tokenized exact query."""
    token_count = len(query_tokens)
    if token_count < 2:
        return []

    matches = []
    if metadata is not None:
        candidate_positions = metadata["positions_by_form"].get(query_tokens[0]["simple"], [])
        candidate_windows = []
        for ayah_index, token_index in candidate_positions:
            ayah = ayahs[ayah_index]
            tokens = ayah["tokens"]
            if token_index + token_count <= len(tokens):
                candidate_windows.append((ayah, tokens[token_index : token_index + token_count]))
    else:
        candidate_windows = []
        for ayah in ayahs:
            tokens = ayah["tokens"]
            if len(tokens) < token_count:
                continue
            for start in range(len(tokens) - token_count + 1):
                candidate_windows.append((ayah, tokens[start : start + token_count]))

    for ayah, window in candidate_windows:
        tokens = ayah["tokens"]
        if len(tokens) < token_count:
            continue
        if not has_consecutive_word_positions(window):
            continue
        if not all(
            phrase_query_token_matches_candidate(query_token, candidate_token)
            for query_token, candidate_token in zip(query_tokens, window)
        ):
            continue

        matches.append(
            {
                "ayah_id": ayah["ayah_id"],
                "mushaf_id": ayah["mushaf_id"],
                "surah": ayah["surah_name"],
                "surah_id": ayah["surah_id"],
                "ayah": ayah["number_in_surah"],
                "text": ayah["text_uthmani"],
                "global_index": ayah["global_index"],
                "highlights": [token["word_position"] for token in window],
            }
        )

    return matches


def phrase_matches_to_verse_list(matches):
    """Group phrase matches into verse records with merged highlights."""
    verses_map = {}
    for match in matches:
        key = (match["surah_id"], match["ayah"])
        if key not in verses_map:
            verses_map[key] = {
                "ayah_id": match["ayah_id"],
                "mushaf_id": match["mushaf_id"],
                "surah": match["surah"],
                "surah_id": match["surah_id"],
                "ayah": match["ayah"],
                "text": match["text"],
                "global_index": match["global_index"],
                "highlights": [],
            }
        verses_map[key]["highlights"].extend(match["highlights"])

    verse_list = list(verses_map.values())
    for verse in verse_list:
        verse["highlights"] = sorted(set(verse["highlights"]))
    return verse_list


def build_phrase_did_you_mean(query_tokens, ayahs, phrase_forms=None):
    """Return one high-confidence same-order Quran phrase suggestion."""
    token_count = len(query_tokens)
    if token_count < 2:
        return None

    phrase_forms = phrase_forms if phrase_forms is not None else collect_mushaf_phrase_forms(ayahs)
    score_maps = build_phrase_similarity_score_maps(query_tokens, phrase_forms)
    if score_maps is None:
        return None

    candidate_groups = {}
    for ayah in ayahs:
        tokens = ayah["tokens"]
        if len(tokens) < token_count:
            continue

        for start in range(len(tokens) - token_count + 1):
            window = tokens[start : start + token_count]
            if not has_consecutive_word_positions(window):
                continue

            selections = []
            for query_token, candidate_token, score_map in zip(query_tokens, window, score_maps):
                if not any(record["search_simple"] in score_map for record in get_candidate_phrase_records(candidate_token)):
                    selections = []
                    break
                selections.append(select_best_phrase_candidate_record(query_token, candidate_token, score_map))
            if not selections:
                continue

            token_scores = [score for _record, score in selections]
            overall_score = sum(token_scores) / token_count
            if overall_score < PHRASE_SUGGESTION_MIN_CONFIDENCE:
                continue
            if min(token_scores) < PHRASE_SUGGESTION_MIN_TOKEN_CONFIDENCE:
                continue

            signature = tuple(
                record["search_simple"] if record is not None else candidate_token["word_simple"]
                for (record, _score), candidate_token in zip(selections, window)
            )
            phrase_text = " ".join(token["word_text"] for token in window)
            penalty = sum(
                (record["stripped_prefix_count"] + record["stripped_article_count"]) if record is not None else 0
                for record, _score in selections
            )

            current_candidate = candidate_groups.get(signature)
            if (
                current_candidate is None
                or overall_score > current_candidate["score"]
                or (
                    overall_score == current_candidate["score"]
                    and (penalty, len(normalize_query_search(phrase_text)), phrase_text)
                    < (
                        current_candidate["penalty"],
                        len(normalize_query_search(current_candidate["text"])),
                        current_candidate["text"],
                    )
                )
            ):
                candidate_groups[signature] = {
                    "text": phrase_text,
                    "score": overall_score,
                    "penalty": penalty,
                }

    if not candidate_groups:
        return None

    ranked_candidates = sorted(
        candidate_groups.values(),
        key=lambda candidate: (
            -candidate["score"],
            candidate["penalty"],
            len(normalize_query_search(candidate["text"])),
            candidate["text"],
        ),
    )
    best_candidate = ranked_candidates[0]
    if len(ranked_candidates) > 1 and best_candidate["score"] - ranked_candidates[1]["score"] < PHRASE_SUGGESTION_MIN_LEAD:
        return None

    return {"text": best_candidate["text"], "confidence": round(best_candidate["score"], 3)}


def search_exact_phrase_matches(cursor, q, mushaf):
    """Resolve all direct phrase matches and an optional fallback suggestion."""
    query_tokens = tokenize_exact_query(q)
    metadata = get_mushaf_phrase_metadata(cursor, mushaf)
    ayahs = metadata["ayahs"]
    phrase_forms = metadata["phrase_forms"]
    has_possible_direct_match = all(token["simple"] in phrase_forms for token in query_tokens)
    matches = find_phrase_matches(ayahs, query_tokens, metadata) if has_possible_direct_match else []
    did_you_mean = None if matches else build_phrase_did_you_mean(query_tokens, ayahs, phrase_forms)
    return query_tokens, matches, did_you_mean


def fetch_exact_candidate_rows(cursor, q_simple, mushaf):
    """Fetch exact-search candidates before diacritic filtering."""
    surface_simples = resolve_exact_word_surfaces(q_simple)
    if not surface_simples:
        return []

    placeholders = ",".join("?" for _ in surface_simples)
    cursor.execute(
        f"""
        SELECT
            a.id AS ayah_id,
            a.mushaf_id,
            s.name_arabic AS surah_name,
            a.surah_id,
            a.number_in_surah,
            a.text_uthmani,
            a.global_index,
            wo.word_position,
            wo.word_text,
            wo.word_simple
        FROM word_occurrences wo
        JOIN ayahs a ON wo.ayah_id = a.id
        JOIN surahs s ON a.surah_id = s.id
        WHERE wo.word_simple IN ({placeholders}) AND a.mushaf_id = ?
        ORDER BY a.surah_id, a.number_in_surah
        """,
        [*surface_simples, mushaf],
    )
    return cursor.fetchall()


def exact_candidate_matches_query(candidate, query, q_simple):
    """Return True when one candidate row can satisfy an exact query."""
    if not has_query_diacritics(query):
        return True

    query_standard = standardize_uthmani(query.strip())
    morphology_index = get_morphology_search_index()
    candidate_forms = morphology_index["surface_to_forms"].get(candidate["word_simple"], [])
    if candidate_forms:
        for record in candidate_forms:
            if record["search_simple"] != q_simple:
                continue
            candidate_text = build_candidate_surface_text(candidate["word_text"], record)
            if uthmani_matches_query(query_standard, candidate_text):
                return True
        return (
            candidate["word_simple"] == q_simple
            and uthmani_matches_query(query_standard, candidate["word_text"])
        )

    return uthmani_matches_query(query_standard, candidate["word_text"])


def filter_exact_occurrences(candidate_rows, query, q_simple):
    """Filter exact-search candidates by whether diacritics were requested."""
    if not candidate_rows:
        return []

    if not has_query_diacritics(query):
        return list(candidate_rows)

    return [
        candidate
        for candidate in candidate_rows
        if exact_candidate_matches_query(candidate, query, q_simple)
    ]


def occurrences_to_verse_list(occurrences):
    """Group occurrence rows into verse records with highlight positions."""
    verses_map = {}
    for occurrence in occurrences:
        key = (occurrence["surah_id"], occurrence["number_in_surah"])
        if key not in verses_map:
            verses_map[key] = {
                "ayah_id": occurrence["ayah_id"],
                "mushaf_id": occurrence["mushaf_id"],
                "surah": occurrence["surah_name"],
                "surah_id": occurrence["surah_id"],
                "ayah": occurrence["number_in_surah"],
                "text": occurrence["text_uthmani"],
                "global_index": occurrence["global_index"],
                "highlights": [],
            }
        verses_map[key]["highlights"].append(occurrence["word_position"])
    return list(verses_map.values())


def fetch_root_occurrence_rows(cursor, root_id, mushaf):
    """Fetch all legacy root-search rows for one root."""
    cursor.execute(
        """
        SELECT
            a.id AS ayah_id,
            a.mushaf_id,
            s.name_arabic AS surah_name,
            a.surah_id,
            a.number_in_surah,
            a.text_uthmani,
            a.global_index,
            wo.word_position
        FROM word_occurrences wo
        JOIN ayahs a ON wo.ayah_id = a.id
        JOIN surahs s ON a.surah_id = s.id
        WHERE wo.root_id = ? AND a.mushaf_id = ?
        ORDER BY a.surah_id, a.number_in_surah
        """,
        (root_id, mushaf),
    )
    return cursor.fetchall()


def fetch_root_summary(cursor, root_id, mushaf):
    """Fetch root counts for paginated search responses."""
    cursor.execute(
        """
        SELECT
            COUNT(*) AS total_occurrences,
            COUNT(DISTINCT wo.ayah_id) AS total_verses
        FROM word_occurrences wo
        JOIN ayahs a ON wo.ayah_id = a.id
        WHERE wo.root_id = ? AND a.mushaf_id = ?
        """,
        (root_id, mushaf),
    )
    row = cursor.fetchone()
    return row["total_occurrences"], row["total_verses"]


def fetch_root_page_verses(cursor, root_id, mushaf, page, page_size):
    """Fetch a single page of verses for one root."""
    offset = (page - 1) * page_size
    cursor.execute(
        """
        SELECT
            a.id AS ayah_id,
            a.mushaf_id,
            s.name_arabic AS surah_name,
            a.surah_id,
            a.number_in_surah,
            a.text_uthmani,
            a.global_index
        FROM word_occurrences wo
        JOIN ayahs a ON wo.ayah_id = a.id
        JOIN surahs s ON a.surah_id = s.id
        WHERE wo.root_id = ? AND a.mushaf_id = ?
        GROUP BY a.id, s.name_arabic, a.surah_id, a.number_in_surah, a.text_uthmani
        ORDER BY a.surah_id, a.number_in_surah
        LIMIT ? OFFSET ?
        """,
        (root_id, mushaf, page_size, offset),
    )
    ayah_rows = cursor.fetchall()
    ayah_ids = [row["ayah_id"] for row in ayah_rows]
    highlights_by_ayah = {ayah_id: [] for ayah_id in ayah_ids}

    if ayah_ids:
        placeholders = ",".join("?" for _ in ayah_ids)
        cursor.execute(
            f"""
            SELECT ayah_id, word_position
            FROM word_occurrences
            WHERE root_id = ? AND ayah_id IN ({placeholders})
            ORDER BY ayah_id, word_position
            """,
            [root_id, *ayah_ids],
        )
        for highlight_row in cursor.fetchall():
            highlights_by_ayah[highlight_row["ayah_id"]].append(highlight_row["word_position"])

    return [
        {
            "ayah_id": row["ayah_id"],
            "mushaf_id": row["mushaf_id"],
            "surah": row["surah_name"],
            "surah_id": row["surah_id"],
            "ayah": row["number_in_surah"],
            "text": row["text_uthmani"],
            "global_index": row["global_index"],
            "highlights": highlights_by_ayah.get(row["ayah_id"], []),
        }
        for row in ayah_rows
    ]


def fetch_reader_center_ayah(cursor, mushaf, ayah_id):
    """Fetch the clicked ayah and its surah metadata."""
    cursor.execute(
        """
        SELECT
            a.id AS ayah_id,
            a.mushaf_id,
            a.surah_id,
            a.number_in_surah,
            a.text_uthmani,
            a.global_index,
            s.name_arabic AS surah_name
        FROM ayahs a
        JOIN surahs s ON a.surah_id = s.id
        WHERE a.id = ? AND a.mushaf_id = ?
        """,
        (ayah_id, mushaf),
    )
    return cursor.fetchone()


def fetch_surah_bounds(cursor, mushaf, surah_id):
    """Return the first and last ayah numbers in one surah."""
    cursor.execute(
        """
        SELECT
            MIN(number_in_surah) AS min_ayah,
            MAX(number_in_surah) AS max_ayah
        FROM ayahs
        WHERE mushaf_id = ? AND surah_id = ?
        """,
        (mushaf, surah_id),
    )
    return cursor.fetchone()


def fetch_surah_ayah_range(cursor, mushaf, surah_id, start_ayah, end_ayah, center_ayah_id=None):
    """Fetch a contiguous ayah range inside one surah."""
    cursor.execute(
        """
        SELECT
            a.id AS ayah_id,
            a.mushaf_id,
            a.surah_id,
            a.number_in_surah,
            a.text_uthmani,
            a.global_index,
            s.name_arabic AS surah_name
        FROM ayahs a
        JOIN surahs s ON a.surah_id = s.id
        WHERE a.mushaf_id = ? AND a.surah_id = ? AND a.number_in_surah BETWEEN ? AND ?
        ORDER BY a.number_in_surah
        """,
        (mushaf, surah_id, start_ayah, end_ayah),
    )
    return [
        {
            "ayah_id": row["ayah_id"],
            "ayah": row["number_in_surah"],
            "text": row["text_uthmani"],
            "global_index": row["global_index"],
            "is_center": row["ayah_id"] == center_ayah_id,
        }
        for row in cursor.fetchall()
    ]


def build_ayah_reader_payload(cursor, mushaf, ayah_id, before, after):
    """Build the initial same-surah reader payload around one ayah."""
    center = fetch_reader_center_ayah(cursor, mushaf, ayah_id)
    if center is None:
        return {"found": False, "ayahs": []}

    bounds = fetch_surah_bounds(cursor, mushaf, center["surah_id"])
    min_ayah = bounds["min_ayah"]
    max_ayah = bounds["max_ayah"]

    start_ayah = max(min_ayah, center["number_in_surah"] - before)
    end_ayah = min(max_ayah, center["number_in_surah"] + after)
    ayahs = fetch_surah_ayah_range(cursor, mushaf, center["surah_id"], start_ayah, end_ayah, center["ayah_id"])

    return {
        "found": True,
        "mushaf_id": center["mushaf_id"],
        "surah_id": center["surah_id"],
        "surah": center["surah_name"],
        "center_ayah_id": center["ayah_id"],
        "start_ayah": start_ayah,
        "end_ayah": end_ayah,
        "has_previous": start_ayah > min_ayah,
        "has_next": end_ayah < max_ayah,
        "ayahs": ayahs,
    }


def build_ayah_reader_more_payload(cursor, mushaf, surah_id, anchor_ayah, direction, count):
    """Build one incremental same-surah reader slice."""
    bounds = fetch_surah_bounds(cursor, mushaf, surah_id)
    min_ayah = bounds["min_ayah"]
    max_ayah = bounds["max_ayah"]
    if min_ayah is None or max_ayah is None:
        return {"found": False, "ayahs": []}

    if direction == "before":
        end_ayah = min(max_ayah, anchor_ayah - 1)
        if end_ayah < min_ayah:
            return {"found": True, "surah_id": surah_id, "direction": direction, "has_more": False, "ayahs": []}
        start_ayah = max(min_ayah, end_ayah - count + 1)
        ayahs = fetch_surah_ayah_range(cursor, mushaf, surah_id, start_ayah, end_ayah)
        has_more = start_ayah > min_ayah
    else:
        start_ayah = max(min_ayah, anchor_ayah + 1)
        if start_ayah > max_ayah:
            return {"found": True, "surah_id": surah_id, "direction": direction, "has_more": False, "ayahs": []}
        end_ayah = min(max_ayah, start_ayah + count - 1)
        ayahs = fetch_surah_ayah_range(cursor, mushaf, surah_id, start_ayah, end_ayah)
        has_more = end_ayah < max_ayah

    return {
        "found": True,
        "surah_id": surah_id,
        "direction": direction,
        "has_more": has_more,
        "ayahs": ayahs,
    }


def parse_page_span(page_value):
    """Parse a page value that can be a single page or a boundary range like 85-86."""
    if page_value is None:
        return None

    page_numbers = [int(value) for value in re.findall(r"\d+", str(page_value))]
    if not page_numbers:
        return None

    return min(page_numbers), max(page_numbers)


def page_value_contains(page_value, page):
    """Return True when one stored page value includes the requested page number."""
    page_span = parse_page_span(page_value)
    if page_span is None:
        return False
    start_page, end_page = page_span
    return start_page <= page <= end_page


def get_mushaf_page_index(cursor, mushaf):
    """Return a cached page->ayah index for one mushaf."""
    cache_key = (DB_PATH, mushaf)
    if cache_key in _mushaf_page_index_cache:
        return _mushaf_page_index_cache[cache_key]

    cursor.execute(
        """
        SELECT
            a.id AS ayah_id,
            a.mushaf_id,
            a.surah_id,
            a.number_in_surah,
            a.text_uthmani,
            a.global_index,
            a.page,
            a.line_start,
            a.line_end,
            s.name_arabic AS surah_name
        FROM ayahs a
        JOIN surahs s ON a.surah_id = s.id
        WHERE a.mushaf_id = ? AND a.page IS NOT NULL
        ORDER BY a.global_index, a.surah_id, a.number_in_surah
        """,
        (mushaf,),
    )

    page_numbers = set()
    page_to_ayahs = defaultdict(list)
    ayah_to_primary_page = {}

    for row in cursor.fetchall():
        page_span = parse_page_span(row["page"])
        if page_span is None:
            continue

        start_page, end_page = page_span
        ayah_payload = {
            "ayah_id": row["ayah_id"],
            "mushaf_id": row["mushaf_id"],
            "surah_id": row["surah_id"],
            "surah": row["surah_name"],
            "ayah": row["number_in_surah"],
            "text": row["text_uthmani"],
            "global_index": row["global_index"],
            "page": row["page"],
            "line_start": row["line_start"],
            "line_end": row["line_end"],
        }
        ayah_to_primary_page[row["ayah_id"]] = start_page

        for page_number in range(start_page, end_page + 1):
            page_numbers.add(page_number)
            page_to_ayahs[page_number].append(ayah_payload)

    if not page_numbers:
        index = {"min_page": None, "max_page": None, "page_count": 0, "page_to_ayahs": {}, "ayah_to_primary_page": {}}
    else:
        index = {
            "min_page": min(page_numbers),
            "max_page": max(page_numbers),
            "page_count": len(page_numbers),
            "page_to_ayahs": dict(page_to_ayahs),
            "ayah_to_primary_page": ayah_to_primary_page,
        }

    _mushaf_page_index_cache[cache_key] = index
    return index


def fetch_mushaf_page_bounds(cursor, mushaf):
    """Return the available Quran page-number bounds for one mushaf."""
    page_index = get_mushaf_page_index(cursor, mushaf)
    return {
        "min_page": page_index["min_page"],
        "max_page": page_index["max_page"],
        "page_count": page_index["page_count"],
    }


def fetch_ayah_page(cursor, mushaf, ayah_id):
    """Return the page number for one ayah in one mushaf."""
    page_index = get_mushaf_page_index(cursor, mushaf)
    primary_page = page_index["ayah_to_primary_page"].get(ayah_id)
    if primary_page is None:
        return None
    return {"page": primary_page}


def fetch_quran_page_ayahs(cursor, mushaf, page, selected_ayah_id=None):
    """Fetch all ayahs that belong to one printed Quran page."""
    page_index = get_mushaf_page_index(cursor, mushaf)
    return [
        {**ayah, "is_selected": ayah["ayah_id"] == selected_ayah_id}
        for ayah in page_index["page_to_ayahs"].get(page, [])
    ]


def coerce_optional_int(value):
    """Normalize optional query-number values across direct and URL callers."""
    if value is None:
        return None
    return int(value)


def build_quran_page_payload(cursor, mushaf, page=None, ayah_id=None, selected_ayah_id=None):
    """Build one page of Quran text, optionally resolving the page from a selected ayah."""
    page = coerce_optional_int(page)
    ayah_id = coerce_optional_int(ayah_id)
    selected_ayah_id = coerce_optional_int(selected_ayah_id)

    bounds = fetch_mushaf_page_bounds(cursor, mushaf)
    if bounds is None or bounds["min_page"] is None or bounds["max_page"] is None:
        return {"found": False, "ayahs": []}

    min_page = bounds["min_page"]
    max_page = bounds["max_page"]
    target_page = page

    if ayah_id is not None:
        ayah_page = fetch_ayah_page(cursor, mushaf, ayah_id)
        ayah_page_span = None if ayah_page is None else parse_page_span(ayah_page["page"])
        if ayah_page_span is None:
            return {"found": False, "ayahs": []}
        target_page = ayah_page_span[0]
        selected_ayah_id = ayah_id

    if target_page is None:
        target_page = min_page

    target_page = max(min_page, min(target_page, max_page))
    ayahs = fetch_quran_page_ayahs(cursor, mushaf, target_page, selected_ayah_id)
    if not ayahs:
        return {"found": False, "ayahs": []}

    surahs = []
    seen_surahs = set()
    for ayah in ayahs:
        if ayah["surah_id"] in seen_surahs:
            continue
        seen_surahs.add(ayah["surah_id"])
        surahs.append({"id": ayah["surah_id"], "name": ayah["surah"]})

    return {
        "found": True,
        "mushaf_id": mushaf,
        "page": target_page,
        "min_page": min_page,
        "max_page": max_page,
        "total_pages": max_page,
        "page_count": bounds["page_count"],
        "has_previous": target_page > min_page,
        "has_next": target_page < max_page,
        "selected_ayah_id": selected_ayah_id,
        "surahs": surahs,
        "ayahs": ayahs,
    }


def build_legacy_exact_results(cursor, q, q_simple, mushaf):
    """Build the original exact-search payload with every matching verse."""
    query_tokens = tokenize_exact_query(q)
    display_query = build_exact_query_label(q, query_tokens)

    if len(query_tokens) > 1:
        phrase_tokens, matches, did_you_mean = search_exact_phrase_matches(cursor, q, mushaf)
        if not matches:
            return [], did_you_mean

        verse_list = phrase_matches_to_verse_list(matches)
        return [
            {
                "root": build_exact_query_label(q, phrase_tokens),
                "root_id": None,
                "total_occurrences": len(matches),
                "total_verses": len(verse_list),
                "verses": verse_list,
                "search_type": "exact",
                "match_type": "phrase",
            }
        ], None

    occurrences = filter_exact_occurrences(fetch_exact_candidate_rows(cursor, q_simple, mushaf), q, q_simple)
    if not occurrences:
        return [], None

    verse_list = occurrences_to_verse_list(occurrences)
    return [
        {
            "root": display_query,
            "root_id": None,
            "total_occurrences": len(occurrences),
            "total_verses": len(verse_list),
            "verses": verse_list,
            "search_type": "exact",
            "match_type": "word",
        }
    ], None


def build_legacy_root_results(cursor, q_simple, mushaf):
    """Build the original root-search payload with every matching verse."""
    results = []
    for root_id in get_root_ids(cursor, q_simple, mushaf):
        cursor.execute("SELECT root_text FROM roots WHERE id = ?", (root_id,))
        root_info = cursor.fetchone()
        if not root_info:
            continue

        occurrences = fetch_root_occurrence_rows(cursor, root_id, mushaf)
        if not occurrences:
            continue

        verse_list = occurrences_to_verse_list(occurrences)
        results.append(
            {
                "root": root_info["root_text"],
                "root_id": root_id,
                "total_occurrences": len(occurrences),
                "total_verses": len(verse_list),
                "verses": verse_list,
                "search_type": "root",
            }
        )
    return results


def build_paginated_exact_result(cursor, q, q_simple, mushaf, page, page_size):
    """Build a single exact-search card with one page of verses."""
    query_tokens = tokenize_exact_query(q)
    display_query = build_exact_query_label(q, query_tokens)

    if len(query_tokens) > 1:
        phrase_tokens, matches, _did_you_mean = search_exact_phrase_matches(cursor, q, mushaf)
        if not matches:
            return None

        verse_list = phrase_matches_to_verse_list(matches)
        total_occurrences = len(matches)
        total_verses = len(verse_list)
        total_pages = compute_total_pages(total_verses, page_size)
        page = clamp_page(page, total_pages)
        start = (page - 1) * page_size
        verses = verse_list[start : start + page_size]

        return {
            "result_key": build_result_key("exact", q_simple=q_simple),
            "root": build_exact_query_label(q, phrase_tokens),
            "root_id": None,
            "search_type": "exact",
            "match_type": "phrase",
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "total_occurrences": total_occurrences,
            "total_verses": total_verses,
            "verses": verses,
        }

    occurrences = filter_exact_occurrences(fetch_exact_candidate_rows(cursor, q_simple, mushaf), q, q_simple)
    if not occurrences:
        return None

    verse_list = occurrences_to_verse_list(occurrences)
    total_occurrences = len(occurrences)
    total_verses = len(verse_list)
    total_pages = compute_total_pages(total_verses, page_size)
    page = clamp_page(page, total_pages)
    start = (page - 1) * page_size
    verses = verse_list[start : start + page_size]

    return {
        "result_key": build_result_key("exact", q_simple=q_simple),
        "root": display_query,
        "root_id": None,
        "search_type": "exact",
        "match_type": "word",
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "total_occurrences": total_occurrences,
        "total_verses": total_verses,
        "verses": verses,
    }


def build_paginated_root_result(cursor, root_id, mushaf, page, page_size):
    """Build a single root-search card with one page of verses."""
    cursor.execute("SELECT root_text FROM roots WHERE id = ?", (root_id,))
    root_info = cursor.fetchone()
    if not root_info:
        return None

    total_occurrences, total_verses = fetch_root_summary(cursor, root_id, mushaf)
    if not total_occurrences or not total_verses:
        return None

    total_pages = compute_total_pages(total_verses, page_size)
    page = clamp_page(page, total_pages)
    verses = fetch_root_page_verses(cursor, root_id, mushaf, page, page_size)

    return {
        "result_key": build_result_key("root", root_id=root_id),
        "root": root_info["root_text"],
        "root_id": root_id,
        "search_type": "root",
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "total_occurrences": total_occurrences,
        "total_verses": total_verses,
        "verses": verses,
    }


def build_paginated_search_results(cursor, q, q_simple, mode, mushaf, page_size):
    """Build the initial paginated search payload."""
    if not q_simple:
        return [], None

    if mode == "exact":
        did_you_mean = None
        if len(tokenize_exact_query(q)) > 1:
            _phrase_tokens, matches, did_you_mean = search_exact_phrase_matches(cursor, q, mushaf)
            if not matches:
                return [], did_you_mean
        result = build_paginated_exact_result(cursor, q, q_simple, mushaf, page=1, page_size=page_size)
        return ([result] if result else []), did_you_mean

    results = []
    for root_id in get_root_ids(cursor, q_simple, mushaf):
        result = build_paginated_root_result(cursor, root_id, mushaf, page=1, page_size=page_size)
        if result is not None:
            results.append(result)
    return results, None


def build_single_result_page(cursor, q, q_simple, mode, mushaf, result_key, page, page_size):
    """Build a single paginated result card for follow-up page fetches."""
    if not q_simple:
        return None

    if mode == "exact":
        expected_key = build_result_key("exact", q_simple=q_simple)
        if result_key != expected_key:
            return None
        return build_paginated_exact_result(cursor, q, q_simple, mushaf, page=page, page_size=page_size)

    if not result_key.startswith("root:"):
        return None

    try:
        root_id = int(result_key.split(":", 1)[1])
    except ValueError:
        return None

    if root_id not in get_root_ids(cursor, q_simple, mushaf):
        return None

    return build_paginated_root_result(cursor, root_id, mushaf, page=page, page_size=page_size)


@app.get("/api/health")
def health_check():
    """Health check endpoint for monitoring."""
    return {"status": "ok", "timestamp": time.time()}


@app.get("/api/mushafs")
def get_mushafs():
    """Get list of available mushaf versions."""
    start = time.time()
    cursor = get_db().cursor()
    cursor.execute("SELECT id, name, description FROM mushafs ORDER BY id")
    mushafs = [{"id": row["id"], "name": row["name"], "description": row["description"]} for row in cursor.fetchall()]
    logger.info(f"GET /api/mushafs - {(time.time() - start) * 1000:.1f}ms")
    return mushafs


@app.get("/api/suggest")
def suggest(
    q: str = Query(..., min_length=1),
    mushaf: int = Query(1, description="Mushaf ID (1=Qalon, 2=Hafs)"),
    mode: str = Query("root", description="Search mode: 'root' or 'exact'"),
    with_chakl: bool = Query(False, description="Return vocalized suggestions when true"),
):
    """Autocomplete suggestions for words and roots."""
    start = time.time()
    cursor = get_db().cursor()
    q_simple = normalize_text_search(q)

    suggestions = []
    if mode == "exact" and len(tokenize_exact_query(q)) > 1:
        suggestions.extend(build_phrase_suggestions(cursor, q, mushaf, 10, with_chakl))
    elif mode != "exact":
        suggestions.extend(build_root_suggestions(cursor, f"{q_simple}%", 5))
        suggestions.extend(build_word_suggestions(cursor, q_simple, mushaf, 10, with_chakl))
    else:
        suggestions.extend(build_word_suggestions(cursor, q_simple, mushaf, 10, with_chakl))

    elapsed = (time.time() - start) * 1000
    logger.info(f"GET /api/suggest?q={q[:10]}...&mode={mode} - {elapsed:.1f}ms - {len(suggestions)} results")
    return suggestions


class BatchSuggestRequest(BaseModel):
    queries: List[str]
    mushaf: int = 1
    mode: str = "root"
    with_chakl: bool = False


@app.post("/api/suggest-batch")
def suggest_batch(req: BatchSuggestRequest):
    """Batch autocomplete for multiple queries (optimized for Yamli candidates)."""
    start = time.time()
    cursor = get_db().cursor()
    combined_results = {}
    queries = req.queries[:5]

    for query in queries:
        q_simple = normalize_text_search(query)
        if not q_simple:
            continue

        if req.mode == "exact" and len(tokenize_exact_query(query)) > 1:
            for item in build_phrase_suggestions(cursor, query, req.mushaf, 5, req.with_chakl):
                key = f"phrase:{item['text']}"
                combined_results.setdefault(key, item)
            continue

        if req.mode != "exact":
            for item in build_root_suggestions(cursor, f"{q_simple}%", 2):
                key = f"root:{item['text']}"
                combined_results.setdefault(key, item)

        for item in build_word_suggestions(cursor, q_simple, req.mushaf, 5, req.with_chakl):
            key = f"word:{item['text']}"
            combined_results.setdefault(key, item)

    results = list(combined_results.values())
    elapsed = (time.time() - start) * 1000
    logger.info(f"POST /api/suggest-batch ({len(queries)} queries) - {elapsed:.1f}ms - {len(results)} results")
    return results


@app.get("/api/search")
def search_root(
    q: str = Query(..., description="Arabic word to search"),
    mode: str = Query("root", description="Search mode: 'root' or 'exact'"),
    mushaf: int = Query(1, description="Mushaf ID (1=Qalon, 2=Hafs)"),
):
    """Original full-payload search endpoint kept for compatibility."""
    start = time.time()
    cursor = get_db().cursor()
    q_simple = build_exact_query_simple(q) if mode == "exact" else normalize_query_search(q)

    if mode == "exact":
        results, did_you_mean = build_legacy_exact_results(cursor, q, q_simple, mushaf)
        if not results:
            logger.info(f"GET /api/search?q={q[:10]}...&mode=exact - {(time.time() - start) * 1000:.1f}ms - no results")
            response = {"found": False, "message": "No results found.", "results": []}
            if did_you_mean is not None:
                response["did_you_mean"] = did_you_mean
            return response

        elapsed = (time.time() - start) * 1000
        logger.info(f"GET /api/search?q={q[:10]}...&mode=exact - {elapsed:.1f}ms - {results[0]['total_verses']} verses")
        return {"found": True, "results": results}

    results = build_legacy_root_results(cursor, q_simple, mushaf)
    if not results:
        logger.info(f"GET /api/search?q={q[:10]}...&mode=root - {(time.time() - start) * 1000:.1f}ms - no results")
        return {"found": False, "message": "No results found.", "results": []}

    elapsed = (time.time() - start) * 1000
    total_verses = sum(result["total_verses"] for result in results)
    logger.info(f"GET /api/search?q={q[:10]}...&mode=root - {elapsed:.1f}ms - {total_verses} verses")
    return {"found": True, "results": results}


@app.get("/api/search-v2")
def search_v2(
    q: str = Query(..., description="Arabic word to search"),
    mode: str = Query("root", description="Search mode: 'root' or 'exact'"),
    mushaf: int = Query(1, description="Mushaf ID"),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
):
    """Paginated search endpoint for the current frontend."""
    start = time.time()
    cursor = get_db().cursor()
    q_simple = build_exact_query_simple(q) if mode == "exact" else normalize_query_search(q)
    results, did_you_mean = build_paginated_search_results(cursor, q, q_simple, mode, mushaf, page_size)

    if not results:
        logger.info(f"GET /api/search-v2?q={q[:10]}...&mode={mode} - {(time.time() - start) * 1000:.1f}ms - no results")
        response = {"found": False, "message": "No results found.", "results": []}
        if did_you_mean is not None:
            response["did_you_mean"] = did_you_mean
        return response

    elapsed = (time.time() - start) * 1000
    total_verses = sum(result["total_verses"] for result in results)
    logger.info(f"GET /api/search-v2?q={q[:10]}...&mode={mode} - {elapsed:.1f}ms - {total_verses} verses")
    return {"found": True, "page_size": page_size, "results": results}


@app.get("/api/search-result-page")
def search_result_page(
    q: str = Query(..., description="Arabic word to search"),
    mode: str = Query("root", description="Search mode: 'root' or 'exact'"),
    mushaf: int = Query(1, description="Mushaf ID"),
    result_key: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
):
    """Fetch one page for a single result card."""
    start = time.time()
    cursor = get_db().cursor()
    q_simple = build_exact_query_simple(q) if mode == "exact" else normalize_query_search(q)
    result = build_single_result_page(cursor, q, q_simple, mode, mushaf, result_key, page, page_size)

    if result is None:
        logger.info(f"GET /api/search-result-page?q={q[:10]}...&mode={mode}&key={result_key} - not found")
        raise HTTPException(status_code=404, detail="Result page not found.")

    elapsed = (time.time() - start) * 1000
    logger.info(
        "GET /api/search-result-page?q=%s...&mode=%s&key=%s&page=%s - %.1fms",
        q[:10],
        mode,
        result_key,
        result["page"],
        elapsed,
    )
    return {"found": True, "result": result}


@app.get("/api/ayah-reader")
def ayah_reader(
    mushaf: int = Query(1, description="Mushaf ID"),
    ayah_id: int = Query(..., ge=1),
    before: int = Query(7, ge=0, le=50),
    after: int = Query(7, ge=0, le=50),
):
    """Return an initial same-surah reader slice centered on one ayah."""
    start = time.time()
    cursor = get_db().cursor()
    payload = build_ayah_reader_payload(cursor, mushaf, ayah_id, before, after)
    elapsed = (time.time() - start) * 1000

    if not payload["found"]:
        logger.info("GET /api/ayah-reader?ayah_id=%s&mushaf=%s - %.1fms - not found", ayah_id, mushaf, elapsed)
        return payload

    logger.info(
        "GET /api/ayah-reader?ayah_id=%s&mushaf=%s - %.1fms - %s ayahs",
        ayah_id,
        mushaf,
        elapsed,
        len(payload["ayahs"]),
    )
    return payload


@app.get("/api/ayah-reader-more")
def ayah_reader_more(
    mushaf: int = Query(1, description="Mushaf ID"),
    surah_id: int = Query(..., ge=1),
    anchor_ayah: int = Query(..., ge=1),
    direction: str = Query(..., pattern="^(before|after)$"),
    count: int = Query(10, ge=1, le=50),
):
    """Return one incremental reader slice inside the same surah."""
    start = time.time()
    cursor = get_db().cursor()
    payload = build_ayah_reader_more_payload(cursor, mushaf, surah_id, anchor_ayah, direction, count)
    elapsed = (time.time() - start) * 1000

    if not payload["found"]:
        logger.info(
            "GET /api/ayah-reader-more?surah_id=%s&anchor=%s&dir=%s&mushaf=%s - %.1fms - not found",
            surah_id,
            anchor_ayah,
            direction,
            mushaf,
            elapsed,
        )
        return payload

    logger.info(
        "GET /api/ayah-reader-more?surah_id=%s&anchor=%s&dir=%s&mushaf=%s - %.1fms - %s ayahs",
        surah_id,
        anchor_ayah,
        direction,
        mushaf,
        elapsed,
        len(payload["ayahs"]),
    )
    return payload


@app.get("/api/quran-page")
def quran_page(
    mushaf: int = Query(1, description="Mushaf ID"),
    page: Optional[int] = Query(None, ge=1),
    ayah_id: Optional[int] = Query(None, ge=1),
    selected_ayah_id: Optional[int] = Query(None, ge=1),
):
    """Return one printed Quran page, optionally centered on a selected ayah."""
    start = time.time()
    cursor = get_db().cursor()
    payload = build_quran_page_payload(cursor, mushaf, page, ayah_id, selected_ayah_id)
    elapsed = (time.time() - start) * 1000

    if not payload["found"]:
        logger.info(
            "GET /api/quran-page?mushaf=%s&page=%s&ayah_id=%s - %.1fms - not found",
            mushaf,
            page,
            ayah_id,
            elapsed,
        )
        return payload

    logger.info(
        "GET /api/quran-page?mushaf=%s&page=%s&ayah_id=%s - %.1fms - page %s, %s ayahs",
        mushaf,
        page,
        ayah_id,
        elapsed,
        payload["page"],
        len(payload["ayahs"]),
    )
    return payload


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
