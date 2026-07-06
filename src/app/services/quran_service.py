from collections import OrderedDict, defaultdict
from difflib import SequenceMatcher
import logging
import math
import os
from pathlib import Path
import re
import sqlite3
from typing import Optional

from src.app.core import config

# Setup logging for monitoring
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Connection pool (reuse connections)
_db_connection = None
_mushaf_page_index_cache = OrderedDict()
_mushaf_latin_word_index_cache = OrderedDict()
_mushaf_latin_root_index_cache = OrderedDict()
_mushaf_word_suggestion_candidates_cache = OrderedDict()
_phrase_did_you_mean_cache = OrderedDict()
_word_did_you_mean_cache = OrderedDict()
_mushaf_layout_index_cache = OrderedDict()


def get_cache_entry(cache, key):
    """Return one cached value and mark it as recently used."""
    if key not in cache:
        return None

    value = cache.pop(key)
    cache[key] = value
    return value


def put_cache_entry(cache, key, value, limit=None):
    """Store one cache entry and evict the oldest item when needed."""
    if key in cache:
        cache.pop(key)
    cache[key] = value

    if limit is not None:
        while len(cache) > limit:
            cache.popitem(last=False)

    return value


def close_db_connection():
    """Close the cached SQLite connection."""
    global _db_connection, _mushaf_page_index_cache
    global _mushaf_latin_word_index_cache, _mushaf_latin_root_index_cache, _mushaf_word_suggestion_candidates_cache
    global _phrase_did_you_mean_cache, _word_did_you_mean_cache, _mushaf_layout_index_cache
    if _db_connection is not None:
        _db_connection.close()
        _db_connection = None
    _mushaf_page_index_cache = OrderedDict()
    _mushaf_latin_word_index_cache = OrderedDict()
    _mushaf_latin_root_index_cache = OrderedDict()
    _mushaf_word_suggestion_candidates_cache = OrderedDict()
    _phrase_did_you_mean_cache = OrderedDict()
    _word_did_you_mean_cache = OrderedDict()
    _mushaf_layout_index_cache = OrderedDict()


def reset_morphology_search_index():
    """Retained for compatibility with tests and external callers."""
    return None


def get_db():
    global _db_connection
    if _db_connection is None:
        db_uri = Path(config.get_db_path()).resolve().as_uri() + "?mode=ro"
        _db_connection = sqlite3.connect(db_uri, uri=True, check_same_thread=False)
        _db_connection.row_factory = sqlite3.Row
        _db_connection.execute("PRAGMA query_only=ON")
        _db_connection.execute(f"PRAGMA cache_size={config.get_runtime_sqlite_cache_pages()}")
        _db_connection.execute("PRAGMA temp_store=MEMORY")
        if config.is_low_memory_mode():
            logger.info("Low-memory runtime mode enabled; using constrained in-process caches.")
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


def fetch_morphology_variant_records_any_scope(cursor, surface_simple, scopes):
    """Fetch offline morphology variants for one token across multiple scopes."""
    if not surface_simple or not scopes:
        return []

    placeholders = ",".join("?" for _ in scopes)
    cursor.execute(
        f"""
        SELECT search_simple, search_text, stripped_prefix_count, stripped_article_count, scope
        FROM morphology_search_variants
        WHERE surface_simple = ? AND scope IN ({placeholders})
        ORDER BY
            CASE scope WHEN 'word' THEN 0 ELSE 1 END,
            stripped_prefix_count DESC,
            stripped_article_count ASC,
            LENGTH(search_simple),
            search_text
        """,
        (surface_simple, *scopes),
    )
    return [dict(row) for row in cursor.fetchall()]


def contains_latin_text(text):
    """Return True when the query uses Latin transliteration characters."""
    return bool(re.search(r"[A-Za-z0-9]", text or ""))


def normalize_latin_lookup(text):
    """Normalize Latin transliteration input for approximate prefix matching."""
    normalized = (text or "").lower()
    normalized = normalized.replace("’", "'").replace("`", "'")
    normalized = re.sub(r"[^a-z0-9'\s]", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    normalized = normalized.replace("aa", "a").replace("ee", "i").replace("ii", "i")
    normalized = normalized.replace("oo", "u").replace("ou", "u").replace("uu", "u")
    return normalized


def build_latin_skeleton(text):
    """Build a consonant-heavy Latin skeleton that tolerates missing long vowels."""
    normalized = normalize_latin_lookup(text)
    normalized = normalized.replace("kh", "5").replace("gh", "4").replace("sh", "x")
    normalized = normalized.replace("th", "v").replace("dh", "c").replace("ch", "x")
    normalized = normalized.replace("ph", "f")
    normalized = re.sub(r"[aeiouyw']", "", normalized)
    normalized = normalized.replace("5", "kh").replace("4", "gh").replace("x", "sh")
    normalized = normalized.replace("v", "th").replace("c", "dh")
    return normalized


def arabic_text_to_latin(text):
    """Transliterate Arabic text into one canonical Latin key for lookup."""
    mapping = {
        "ا": "a",
        "أ": "a",
        "إ": "a",
        "آ": "a",
        "ٱ": "a",
        "ب": "b",
        "ت": "t",
        "ث": "th",
        "ج": "j",
        "ح": "h",
        "خ": "kh",
        "د": "d",
        "ذ": "dh",
        "ر": "r",
        "ز": "z",
        "س": "s",
        "ش": "sh",
        "ص": "s",
        "ض": "d",
        "ط": "t",
        "ظ": "z",
        "ع": "3",
        "غ": "gh",
        "ف": "f",
        "ق": "q",
        "ك": "k",
        "ل": "l",
        "م": "m",
        "ن": "n",
        "ه": "h",
        "ة": "h",
        "و": "w",
        "ي": "y",
        "ى": "a",
    }
    plain_text = plain_arabic_display_text(text)
    return "".join(mapping.get(char, "") for char in plain_text if not char.isspace())


def build_latin_key_variants(arabic_text):
    """Return lookup variants for one Arabic word or root."""
    latin_key = normalize_latin_lookup(arabic_text_to_latin(arabic_text))
    if not latin_key:
        latin_key = normalize_latin_lookup(arabic_text)
    variants = {latin_key} if latin_key else set()

    plain_text = plain_arabic_display_text(arabic_text)
    if plain_text.startswith("ال") and len(plain_text) > 2:
        articleless_key = normalize_latin_lookup(arabic_text_to_latin(plain_text[2:]))
        if articleless_key:
            variants.add(articleless_key)

    return {
        "full": sorted(variant for variant in variants if variant),
        "skeleton": sorted({build_latin_skeleton(variant) for variant in variants if variant}),
    }


def rank_latin_variant_match(query_full, query_skeleton, variants):
    """Rank one Latin query against one indexed entry."""
    best_rank = None

    for full_key in variants["full"]:
        if full_key == query_full:
            candidate_rank = (0, len(full_key))
        elif full_key.startswith(query_full):
            candidate_rank = (1, len(full_key))
        else:
            continue
        if best_rank is None or candidate_rank < best_rank:
            best_rank = candidate_rank

    if query_skeleton:
        for skeleton_key in variants["skeleton"]:
            if skeleton_key == query_skeleton:
                candidate_rank = (2, len(skeleton_key))
            elif skeleton_key.startswith(query_skeleton):
                candidate_rank = (3, len(skeleton_key))
            else:
                continue
            if best_rank is None or candidate_rank < best_rank:
                best_rank = candidate_rank

    return best_rank


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
    text = re.sub(r"\u0671", "\u0627", text)
    text = re.sub(r"[\u06E5\u06E6]", "", text)
    text = re.sub(r"\u065e", "\u064c", text)
    text = re.sub(r"\u06E1", "", text)
    text = re.sub(r"[\u0610-\u061A\u064B-\u0650\u0652-\u065F\u0670\u06D6-\u06ED]", "", text)
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
    """Return True when the query contains Arabic diacritics other than shadda."""
    return bool(re.search(r"[\u064B-\u0650\u0652\u0670]", text))


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
    return lemma == config.ARTICLE_LEMMA


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
        if lemma not in config.SUPPORTED_PREFIX_LEMMAS:
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


def fetch_morphology_variant_records(cursor, surface_simple, scope):
    """Fetch offline morphology variants for one normalized token surface."""
    cursor.execute(
        """
        SELECT search_simple, search_text, stripped_prefix_count, stripped_article_count
        FROM morphology_search_variants
        WHERE surface_simple = ? AND scope = ?
        ORDER BY stripped_prefix_count DESC, stripped_article_count ASC, LENGTH(search_simple), search_text
        """,
        (surface_simple, scope),
    )
    return [dict(row) for row in cursor.fetchall()]


def resolve_exact_word_surfaces(cursor, q_simple):
    """Resolve the concrete surface forms that should match this exact query."""
    if not q_simple:
        return []

    cursor.execute(
        """
        SELECT surface_simple, scope
        FROM morphology_search_variants
        WHERE scope IN ('word', 'phrase') AND search_simple = ? AND stripped_article_count = 0
        ORDER BY CASE scope WHEN 'word' THEN 0 ELSE 1 END, surface_simple
        """,
        (q_simple,),
    )
    ordered_surfaces = [q_simple]
    seen_surfaces = {q_simple}
    for row in cursor.fetchall():
        surface = row["surface_simple"]
        if surface in seen_surfaces:
            continue
        ordered_surfaces.append(surface)
        seen_surfaces.add(surface)
    return ordered_surfaces


def resolve_prefix_word_surfaces(cursor, q_simple, limit):
    """Resolve surface forms whose smart-search variants share the given prefix."""
    if not q_simple or limit <= 0:
        return []

    cursor.execute(
        """
        SELECT surface_simple, scope
        FROM morphology_search_variants
        WHERE scope IN ('word', 'phrase') AND search_simple LIKE ? AND stripped_article_count = 0
        ORDER BY CASE scope WHEN 'word' THEN 0 ELSE 1 END, search_simple, surface_simple
        LIMIT ?
        """,
        (f"{q_simple}%", limit),
    )
    surfaces = []
    seen_surfaces = set()
    for row in cursor.fetchall():
        surface = row["surface_simple"]
        if surface in seen_surfaces:
            continue
        surfaces.append(surface)
        seen_surfaces.add(surface)
    return surfaces


def get_phrase_surface_records(cursor, surface_simple, surface_text):
    """Return phrase-aware searchable records for one Quran token."""
    records = fetch_morphology_variant_records(cursor, surface_simple, "phrase")
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


def get_candidate_phrase_records(cursor, candidate_token):
    """Return cached phrase records for a token when available."""
    return candidate_token.get("phrase_records") or get_phrase_surface_records(
        cursor,
        candidate_token["word_simple"],
        candidate_token["word_text"],
    )


def collect_mushaf_phrase_forms(cursor, ayahs):
    """Collect searchable phrase forms present in one mushaf token cache."""
    forms = set()
    for ayah in ayahs:
        for token in ayah["tokens"]:
            for record in get_candidate_phrase_records(cursor, token):
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
            if score >= config.PHRASE_SUGGESTION_MIN_TOKEN_CONFIDENCE:
                score_map[phrase_form] = score

        if best_score < config.PHRASE_SUGGESTION_MIN_TOKEN_CONFIDENCE:
            return None
        score_maps.append(score_map)

    return score_maps


def select_best_phrase_candidate_record(cursor, query_token, candidate_token, score_map=None):
    """Return the closest phrase-aware morphology record for one Quran token."""
    best_record = None
    best_score = -1.0
    best_diacritic_match = -1
    best_penalty = math.inf

    for record in get_candidate_phrase_records(cursor, candidate_token):
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


def phrase_query_token_matches_candidate(cursor, query_token, candidate_token):
    """Return True when one query token matches one Quran token directly."""
    candidate_records = get_candidate_phrase_records(cursor, candidate_token)
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


def phrase_query_token_similarity(cursor, query_token, candidate_token):
    """Return the best fuzzy similarity between a query token and Quran token."""
    if not query_token["simple"]:
        return 0.0

    _best_record, best_score = select_best_phrase_candidate_record(cursor, query_token, candidate_token)
    return best_score


def format_suggestion_text(text, with_chakl):
    """Format a suggestion label according to the requested vocalization mode."""
    if with_chakl:
        return remove_quranic_pause_marks(text)
    return plain_arabic_display_text(text)


def get_preferred_suggestion_text(cursor, surface_simple, q_simple, with_chakl=False, surface_text=None):
    """Return the best display form for a smart suggestion."""
    records = fetch_morphology_variant_records_any_scope(cursor, surface_simple, ("word", "phrase"))
    matching_records = [
        record
        for record in records
        if record["search_simple"].startswith(q_simple) and record["stripped_article_count"] == 0
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
        SELECT DISTINCT aw.word_text, aw.word_simple
        FROM ayah_words aw
        WHERE aw.word_simple IN ({placeholders}) AND aw.mushaf_id = ?
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
            cursor,
            row["word_simple"],
            q_simple,
            with_chakl,
            row["word_text"],
        ) or format_suggestion_text(row["word_text"], with_chakl)
        display_simple = normalize_text_search(display_text)
        if not exact_candidate_matches_query(cursor, row, display_text, display_simple):
            display_text = format_suggestion_text(row["word_text"], with_chakl)
            display_simple = row["word_simple"]
        if not exact_candidate_matches_query(cursor, row, display_text, display_simple):
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


def build_root_suggestions_by_surface_query(cursor, q_simple, mushaf, limit):
    """Fetch roots implied by smart surface resolution for a user-facing word query."""
    if not q_simple or limit <= 0:
        return []

    surface_simples = resolve_exact_word_surfaces(cursor, q_simple)
    if not surface_simples:
        return []

    placeholders = ",".join("?" for _ in surface_simples)
    cursor.execute(
        f"""
        SELECT DISTINCT r.root_text, r.root_simple
        FROM roots r
        JOIN word_occurrences wo ON wo.root_id = r.id
        JOIN ayahs a ON a.id = wo.ayah_id
        WHERE wo.word_simple IN ({placeholders}) AND a.mushaf_id = ?
        ORDER BY LENGTH(r.root_simple), r.root_text
        LIMIT ?
        """,
        [*surface_simples, mushaf, limit],
    )
    return [
        {
            "type": "root",
            "text": row["root_text"],
            "label": f"\u062c\u0630\u0631 {row['root_text']}",
        }
        for row in cursor.fetchall()
    ]


def get_mushaf_latin_root_index(cursor, mushaf):
    """Return a cached Latin lookup index for mushaf roots."""
    cache_key = (config.get_db_path(), mushaf)
    cached_items = get_cache_entry(_mushaf_latin_root_index_cache, cache_key)
    if cached_items is not None:
        return cached_items

    cursor.execute(
        """
        SELECT DISTINCT r.root_text
        FROM roots r
        JOIN word_occurrences wo ON wo.root_id = r.id
        JOIN ayahs a ON a.id = wo.ayah_id
        WHERE a.mushaf_id = ?
        ORDER BY r.root_text
        """,
        (mushaf,),
    )

    items = []
    for row in cursor.fetchall():
        variants = build_latin_key_variants(row["root_text"])
        if not variants["full"]:
            continue
        items.append({"text": row["root_text"], "variants": variants})

    # Cache even in low-memory mode: the runtime limit (1 entry) already bounds
    # memory, and skipping entirely would rebuild this index on every request.
    put_cache_entry(_mushaf_latin_root_index_cache, cache_key, items, config.get_runtime_mushaf_cache_limit())
    return items


def build_root_suggestions_by_latin(cursor, query, mushaf, limit):
    """Fetch root suggestions from a Latin transliteration query."""
    query_full = normalize_latin_lookup(query)
    query_skeleton = build_latin_skeleton(query)
    if not query_full or limit <= 0:
        return []

    ranked = []
    for item in get_mushaf_latin_root_index(cursor, mushaf):
        rank = rank_latin_variant_match(query_full, query_skeleton, item["variants"])
        if rank is None:
            continue
        ranked.append((rank, item["text"]))

    ranked.sort(key=lambda entry: (entry[0], entry[1]))
    return [
        {"type": "root", "text": text, "label": f"\u062c\u0630\u0631 {text}"}
        for _rank, text in ranked[:limit]
    ]


def get_mushaf_latin_word_index(cursor, mushaf):
    """Return a cached Latin lookup index for mushaf words."""
    cache_key = (config.get_db_path(), mushaf)
    cached_items = get_cache_entry(_mushaf_latin_word_index_cache, cache_key)
    if cached_items is not None:
        return cached_items

    cursor.execute(
        """
        SELECT DISTINCT word_text, word_simple
        FROM ayah_words
        WHERE mushaf_id = ?
        ORDER BY word_simple, word_text
        """,
        (mushaf,),
    )

    indexed_items = {}
    record_cache = {}

    for row in cursor.fetchall():
        records = record_cache.setdefault(
            row["word_simple"],
            fetch_morphology_variant_records(cursor, row["word_simple"], "word"),
        )
        candidate_surfaces = {(format_suggestion_text(row["word_text"], False), format_suggestion_text(row["word_text"], True))}

        for record in records:
            candidate_surface = build_candidate_surface_text(row["word_text"], record)
            candidate_surfaces.add(
                (
                    format_suggestion_text(candidate_surface, False),
                    format_suggestion_text(candidate_surface, True),
                )
            )

        for plain_text, vocalized_text in candidate_surfaces:
            if not plain_text:
                continue
            variants = build_latin_key_variants(plain_text)
            if not variants["full"]:
                continue

            indexed_items.setdefault(
                plain_text,
                {
                    "plain_text": plain_text,
                    "vocalized_text": vocalized_text,
                    "variants": {"full": set(), "skeleton": set()},
                },
            )
            indexed_items[plain_text]["variants"]["full"].update(variants["full"])
            indexed_items[plain_text]["variants"]["skeleton"].update(variants["skeleton"])

    items = []
    for item in indexed_items.values():
        items.append(
            {
                "plain_text": item["plain_text"],
                "vocalized_text": item["vocalized_text"],
                "variants": {
                    "full": sorted(item["variants"]["full"]),
                    "skeleton": sorted(item["variants"]["skeleton"]),
                },
            }
        )

    put_cache_entry(_mushaf_latin_word_index_cache, cache_key, items, config.get_runtime_mushaf_cache_limit())
    return items


def build_word_suggestions_by_latin(cursor, query, mushaf, limit, with_chakl=False):
    """Fetch word suggestions from a Latin transliteration query."""
    query_full = normalize_latin_lookup(query)
    query_skeleton = build_latin_skeleton(query)
    if not query_full or limit <= 0:
        return []

    ranked = []
    for item in get_mushaf_latin_word_index(cursor, mushaf):
        rank = rank_latin_variant_match(query_full, query_skeleton, item["variants"])
        if rank is None:
            continue
        ranked.append((rank, item))

    ranked.sort(key=lambda entry: (entry[0], entry[1]["plain_text"]))
    return [
        {
            "type": "word",
            "text": item["vocalized_text"] if with_chakl else item["plain_text"],
            "label": item["vocalized_text"] if with_chakl else item["plain_text"],
        }
        for _rank, item in ranked[:limit]
    ]


def build_word_suggestions(cursor, q_simple, mushaf, limit, with_chakl=False):
    """Fetch word suggestions for a query prefix and mushaf."""
    if not q_simple or limit <= 0:
        return []

    like_q = f"{q_simple}%"
    cursor.execute(
        """
        SELECT DISTINCT word_text, word_simple
        FROM ayah_words
        WHERE word_simple LIKE ? AND mushaf_id = ?
        LIMIT ?
        """,
        (like_q, mushaf, limit),
    )

    suggestions = []
    seen_texts = set()
    for row in cursor.fetchall():
        display_text = get_preferred_suggestion_text(
            cursor,
            row["word_simple"],
            q_simple,
            with_chakl,
            row["word_text"],
        ) or format_suggestion_text(row["word_text"], with_chakl)
        if display_text in seen_texts:
            continue
        suggestions.append({"type": "word", "text": display_text, "label": display_text})
        seen_texts.add(display_text)

    remaining = limit - len(suggestions)
    if remaining <= 0:
        return suggestions

    smart_surfaces = [
        surface_simple
        for surface_simple in resolve_prefix_word_surfaces(cursor, q_simple, limit * 5)
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


def phrase_query_token_prefix_matches_candidate(cursor, query_token, candidate_token):
    """Return True when a Quran token can complete the current phrase token prefix."""
    return select_phrase_suggestion_record(cursor, query_token, candidate_token, allow_prefix=True) is not None


def select_phrase_suggestion_record(cursor, query_token, candidate_token, allow_prefix=False):
    """Return the morphology record that made a phrase suggestion token match."""
    if not query_token["simple"]:
        return None

    matching_records = []
    for record in get_candidate_phrase_records(cursor, candidate_token):
        record_simple = record["search_simple"]
        if allow_prefix:
            matched = record_simple.startswith(query_token["simple"])
        elif query_token["has_diacritics"]:
            matched = (
                record_simple == query_token["simple"]
                and uthmani_matches_query(
                    query_token["standardized"],
                    build_candidate_surface_text(candidate_token["word_text"], record),
                )
            )
        else:
            matched = record_simple == query_token["simple"]

        if matched:
            matching_records.append(record)

    if not matching_records:
        return None

    matching_records.sort(
        key=lambda record: (
            -record["stripped_prefix_count"],
            record["stripped_article_count"],
            len(record["search_simple"]),
            record["search_text"],
        )
    )
    return matching_records[0]


def build_phrase_suggestion_token_text(token, record, with_chakl=False):
    """Display the Quran token aligned to the query, stripping only extra clitics."""
    if record is None:
        return format_suggestion_text(token["word_text"], with_chakl)
    token_text = strip_leading_base_letters(token["word_text"], record.get("stripped_prefix_count", 0))
    return format_suggestion_text(token_text, with_chakl)


def build_phrase_suggestion_text(cursor, window, query_tokens, with_chakl=False):
    """Build a display suggestion for a matched Quran phrase window."""
    text_parts = []
    for index, (query_token, candidate_token) in enumerate(zip(query_tokens, window)):
        record = select_phrase_suggestion_record(
            cursor,
            query_token,
            candidate_token,
            allow_prefix=index == len(query_tokens) - 1,
        )
        text_parts.append(build_phrase_suggestion_token_text(candidate_token, record, with_chakl))
    return " ".join(text_parts)


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
            phrase_query_token_matches_candidate(cursor, query_token, candidate_token)
            for query_token, candidate_token in zip(query_tokens[:-1], window[:-1])
        ):
            continue
        if not phrase_query_token_prefix_matches_candidate(cursor, query_tokens[-1], window[-1]):
            continue

        phrase_text = build_phrase_suggestion_text(cursor, window, query_tokens, with_chakl)
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
    surface_simples = resolve_exact_word_surfaces(cursor, q_simple)
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


def build_root_distribution(cursor, root_query, mushaf):
    """Return per-surah occurrence counts for a root across the whole Quran."""
    q_simple = normalize_query_search(root_query)
    root_ids = get_root_ids(cursor, q_simple, mushaf)
    if not root_ids:
        return {"found": False, "root": root_query, "total": 0, "surah_count": 0, "surahs": []}

    placeholders = ",".join("?" for _ in root_ids)
    cursor.execute(
        f"""
        SELECT a.surah_id AS surah_id, s.name_arabic AS surah, COUNT(*) AS count
        FROM word_occurrences wo
        JOIN ayahs a ON wo.ayah_id = a.id
        JOIN surahs s ON a.surah_id = s.id
        WHERE wo.root_id IN ({placeholders}) AND a.mushaf_id = ?
        GROUP BY a.surah_id, s.name_arabic
        ORDER BY a.surah_id
        """,
        [*root_ids, mushaf],
    )
    surahs = [
        {"surah_id": row["surah_id"], "surah": row["surah"], "count": row["count"]}
        for row in cursor.fetchall()
    ]

    cursor.execute(f"SELECT root_text FROM roots WHERE id IN ({placeholders})", root_ids)
    root_row = cursor.fetchone()
    root_text = root_row["root_text"] if root_row else root_query

    return {
        "found": True,
        "root": root_text,
        "total": sum(item["count"] for item in surahs),
        "surah_count": len(surahs),
        "surahs": surahs,
    }


def fetch_mushaf_ayah_tokens(cursor, mushaf):
    """Fetch all Quran tokens for one mushaf grouped by ayah."""
    cursor.execute(
        """
        SELECT
            aw.ayah_id,
            aw.mushaf_id,
            s.name_arabic AS surah_name,
            aw.surah_id,
            aw.number_in_surah,
            a.text_uthmani,
            aw.global_index,
            aw.word_position,
            aw.word_text,
            aw.word_simple
        FROM ayah_words aw
        JOIN ayahs a ON aw.ayah_id = a.id
        JOIN surahs s ON aw.surah_id = s.id
        WHERE aw.mushaf_id = ?
        ORDER BY aw.surah_id, aw.number_in_surah, aw.word_position
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
            phrase_record_cache[record_key] = get_phrase_surface_records(cursor, row["word_simple"], row["word_text"])

        current_ayah["tokens"].append(
            {
                "word_position": row["word_position"],
                "word_text": row["word_text"],
                "word_simple": row["word_simple"],
                "phrase_records": phrase_record_cache[record_key],
            }
        )

    return ayahs


def get_mushaf_phrase_metadata(cursor, mushaf):
    """Return cached phrase-search metadata for one mushaf."""
    ayahs = fetch_mushaf_ayah_tokens(cursor, mushaf)
    phrase_forms = set()
    positions_by_form = defaultdict(list)
    seen_positions = set()

    for ayah_index, ayah in enumerate(ayahs):
        for token_index, token in enumerate(ayah["tokens"]):
            for record in get_candidate_phrase_records(cursor, token):
                form = record["search_simple"]
                phrase_forms.add(form)
                position_key = (form, ayah_index, token_index)
                if position_key in seen_positions:
                    continue
                seen_positions.add(position_key)
                positions_by_form[form].append((ayah_index, token_index))

    return {
        "ayahs": ayahs,
        "phrase_forms": phrase_forms,
        "positions_by_form": dict(positions_by_form),
    }


def has_consecutive_word_positions(window):
    """Return True when all tokens in a window are consecutive."""
    return all(window[index]["word_position"] == window[0]["word_position"] + index for index in range(len(window)))


def find_phrase_matches(cursor, ayahs, query_tokens, metadata=None):
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
            phrase_query_token_matches_candidate(cursor, query_token, candidate_token)
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


def build_phrase_did_you_mean(cursor, query_tokens, ayahs, phrase_forms=None):
    """Return one high-confidence same-order Quran phrase suggestion."""
    token_count = len(query_tokens)
    if token_count < 2:
        return None

    phrase_forms = phrase_forms if phrase_forms is not None else collect_mushaf_phrase_forms(cursor, ayahs)
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
                if not any(record["search_simple"] in score_map for record in get_candidate_phrase_records(cursor, candidate_token)):
                    selections = []
                    break
                selections.append(select_best_phrase_candidate_record(cursor, query_token, candidate_token, score_map))
            if not selections:
                continue

            token_scores = [score for _record, score in selections]
            overall_score = sum(token_scores) / token_count
            if overall_score < config.PHRASE_SUGGESTION_MIN_CONFIDENCE:
                continue
            if min(token_scores) < config.PHRASE_SUGGESTION_MIN_TOKEN_CONFIDENCE:
                continue

            signature = tuple(
                record["search_simple"] if record is not None else candidate_token["word_simple"]
                for (record, _score), candidate_token in zip(selections, window)
            )
            phrase_text = " ".join(plain_arabic_display_text(token["word_text"]) for token in window)
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
    if len(ranked_candidates) > 1 and best_candidate["score"] - ranked_candidates[1]["score"] < config.PHRASE_SUGGESTION_MIN_LEAD:
        return None

    return {"text": best_candidate["text"], "confidence": round(best_candidate["score"], 3)}


def collect_word_suggestion_candidates(cursor, mushaf):
    """Collect searchable single-token candidates that are present in one mushaf."""
    cache_key = (config.get_db_path(), mushaf)
    cached_candidates = get_cache_entry(_mushaf_word_suggestion_candidates_cache, cache_key)
    if cached_candidates is not None:
        return cached_candidates

    cursor.execute(
        """
        SELECT DISTINCT word_text, word_simple
        FROM ayah_words
        WHERE mushaf_id = ?
        ORDER BY word_simple, word_text
        """,
        (mushaf,),
    )

    candidates = {}
    record_cache = {}
    for row in cursor.fetchall():
        default_display = plain_arabic_display_text(row["word_text"])
        candidate_key = (row["word_simple"], default_display)
        candidates[candidate_key] = {
            "search_simple": row["word_simple"],
            "text": default_display,
            "penalty": 0,
        }

        records = record_cache.setdefault(
            row["word_simple"],
            fetch_morphology_variant_records(cursor, row["word_simple"], "word"),
        )
        for record in records:
            candidate_text = plain_arabic_display_text(build_candidate_surface_text(row["word_text"], record))
            if not candidate_text:
                continue
            candidate_key = (record["search_simple"], candidate_text)
            penalty = record["stripped_prefix_count"] + record["stripped_article_count"]
            existing_candidate = candidates.get(candidate_key)
            if existing_candidate is None or penalty < existing_candidate["penalty"]:
                candidates[candidate_key] = {
                    "search_simple": record["search_simple"],
                    "text": candidate_text,
                    "penalty": penalty,
                }

    candidate_list = list(candidates.values())
    put_cache_entry(
        _mushaf_word_suggestion_candidates_cache,
        cache_key,
        candidate_list,
        config.get_runtime_mushaf_cache_limit(),
    )
    return candidate_list


def build_word_did_you_mean(cursor, q_simple, mushaf):
    """Return one high-confidence plain single-word correction for no-result exact searches."""
    if not q_simple or " " in q_simple:
        return None

    cache_key = (config.get_db_path(), config.get_morphology_path(), mushaf, q_simple)
    cached_suggestion = get_cache_entry(_word_did_you_mean_cache, cache_key)
    if cached_suggestion is not None or cache_key in _word_did_you_mean_cache:
        return cached_suggestion

    ranked_candidates = []
    query_length = len(q_simple)
    for candidate in collect_word_suggestion_candidates(cursor, mushaf):
        candidate_simple = candidate["search_simple"]
        if not candidate_simple:
            continue
        if candidate_simple[0] != q_simple[0]:
            continue
        if min(len(candidate_simple), query_length) / max(len(candidate_simple), query_length) < 0.66:
            continue

        score = SequenceMatcher(None, q_simple, candidate_simple).ratio()
        if score < config.WORD_SUGGESTION_MIN_CONFIDENCE:
            continue

        ranked_candidates.append(
            {
                "text": candidate["text"],
                "score": score,
                "penalty": candidate["penalty"],
                "length_delta": abs(len(candidate_simple) - query_length),
            }
        )

    if not ranked_candidates:
        put_cache_entry(_word_did_you_mean_cache, cache_key, None, config.get_runtime_query_cache_limit())
        return None

    ranked_candidates.sort(
        key=lambda candidate: (
            -candidate["score"],
            candidate["penalty"],
            candidate["length_delta"],
            len(candidate["text"]),
            candidate["text"],
        )
    )
    best_candidate = ranked_candidates[0]
    if (
        len(ranked_candidates) > 1
        and best_candidate["score"] - ranked_candidates[1]["score"] < config.WORD_SUGGESTION_MIN_LEAD
        and best_candidate["text"] != ranked_candidates[1]["text"]
    ):
        put_cache_entry(_word_did_you_mean_cache, cache_key, None, config.get_runtime_query_cache_limit())
        return None

    suggestion = {"text": best_candidate["text"], "confidence": round(best_candidate["score"], 3)}
    return put_cache_entry(_word_did_you_mean_cache, cache_key, suggestion, config.get_runtime_query_cache_limit())


def search_exact_phrase_matches(cursor, q, mushaf):
    """Resolve all direct phrase matches and an optional fallback suggestion."""
    query_tokens = tokenize_exact_query(q)
    metadata = get_mushaf_phrase_metadata(cursor, mushaf)
    ayahs = metadata["ayahs"]
    phrase_forms = metadata["phrase_forms"]
    has_possible_direct_match = all(token["simple"] in phrase_forms for token in query_tokens)
    matches = find_phrase_matches(cursor, ayahs, query_tokens, metadata) if has_possible_direct_match else []
    if matches:
        did_you_mean = None
    else:
        cache_key = (
            config.get_db_path(),
            config.get_morphology_path(),
            mushaf,
            tuple(token["simple"] for token in query_tokens),
        )
        cached_suggestion = get_cache_entry(_phrase_did_you_mean_cache, cache_key)
        if cached_suggestion is not None or cache_key in _phrase_did_you_mean_cache:
            did_you_mean = cached_suggestion
        else:
            did_you_mean = build_phrase_did_you_mean(cursor, query_tokens, ayahs, phrase_forms)
            put_cache_entry(
                _phrase_did_you_mean_cache,
                cache_key,
                did_you_mean,
                config.get_runtime_query_cache_limit(),
            )
    return query_tokens, matches, did_you_mean


def fetch_exact_candidate_rows(cursor, q_simple, mushaf):
    """Fetch exact-search candidates before diacritic filtering."""
    surface_simples = resolve_exact_word_surfaces(cursor, q_simple)
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
            aw.word_position,
            aw.word_text,
            aw.word_simple
        FROM ayah_words aw
        JOIN ayahs a ON aw.ayah_id = a.id
        JOIN surahs s ON a.surah_id = s.id
        WHERE aw.word_simple IN ({placeholders}) AND a.mushaf_id = ?
        ORDER BY a.surah_id, a.number_in_surah
        """,
        [*surface_simples, mushaf],
    )
    return cursor.fetchall()


def exact_candidate_matches_query(cursor, candidate, query, q_simple):
    """Return True when one candidate row can satisfy an exact query."""
    if not has_query_diacritics(query):
        return True

    query_standard = standardize_uthmani(query.strip())
    candidate_forms = fetch_morphology_variant_records_any_scope(cursor, candidate["word_simple"], ("word", "phrase"))
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


def filter_exact_occurrences(cursor, candidate_rows, query, q_simple):
    """Filter exact-search candidates by whether diacritics were requested."""
    if not candidate_rows:
        return []

    if not has_query_diacritics(query):
        return list(candidate_rows)

    return [
        candidate
        for candidate in candidate_rows
        if exact_candidate_matches_query(cursor, candidate, query, q_simple)
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
            COUNT(DISTINCT wo.ayah_id) AS total_verses,
            COUNT(DISTINCT a.surah_id) AS total_surahs
        FROM word_occurrences wo
        JOIN ayahs a ON wo.ayah_id = a.id
        WHERE wo.root_id = ? AND a.mushaf_id = ?
        """,
        (root_id, mushaf),
    )
    row = cursor.fetchone()
    return row["total_occurrences"], row["total_verses"], row["total_surahs"]


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
    cache_key = (config.get_db_path(), mushaf)
    cached_index = get_cache_entry(_mushaf_page_index_cache, cache_key)
    if cached_index is not None:
        return cached_index

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
            a.juz,
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
            "juz": row["juz"],
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

    return put_cache_entry(_mushaf_page_index_cache, cache_key, index, config.get_runtime_mushaf_cache_limit())


# Frontend static base for the per-page QCF fonts (QPC V1 WOFF2 — the set
# distributed unmodified as WOFF2; V2 ships only as TTF).
_MUSHAF_FONT_BASE_PATH = "/fonts/qpc-hafs-v1"


def _layout_tables_present(cursor):
    row = cursor.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'mushaf_layout_meta'"
    ).fetchone()
    return row is not None


def get_mushaf_layout_index(cursor):
    """Cached authentic-layout index: page -> ordered lines (each with glyphs).

    Returns {"present": False} when the layout tables are absent (a DB built
    without scripts/build_mushaf_layout.py), so the reader can fall back.
    """
    cache_key = config.get_db_path()
    cached = get_cache_entry(_mushaf_layout_index_cache, cache_key)
    if cached is not None:
        return cached

    limit = config.get_runtime_mushaf_cache_limit()
    if not _layout_tables_present(cursor):
        return put_cache_entry(_mushaf_layout_index_cache, cache_key, {"present": False}, limit)

    meta = cursor.execute(
        "SELECT layout_id, mushaf_id, page_count FROM mushaf_layout_meta LIMIT 1"
    ).fetchone()
    if meta is None:
        return put_cache_entry(_mushaf_layout_index_cache, cache_key, {"present": False}, limit)

    surah_names = {row["id"]: row["name_arabic"] for row in cursor.execute("SELECT id, name_arabic FROM surahs")}

    cursor.execute(
        """
        SELECT
            l.id AS line_id, l.page, l.line_number, l.line_type, l.is_centered,
            l.surah_number, l.line_glyph_v1,
            w.surah_number AS w_surah, w.ayah_number, w.word_position, w.ayah_id, w.glyph_v1, w.word_text
        FROM mushaf_layout_lines l
        LEFT JOIN mushaf_layout_words w ON w.line_id = l.id
        WHERE l.mushaf_id = ?
        ORDER BY l.page, l.line_number, w.position_in_line
        """,
        (meta["mushaf_id"],),
    )

    pages = defaultdict(list)
    page_surahs = defaultdict(OrderedDict)
    line_by_id = {}

    for row in cursor.fetchall():
        line = line_by_id.get(row["line_id"])
        if line is None:
            line_type = row["line_type"]
            # Font per line: ayah words use the per-page QCF font; the basmala
            # uses the shared ligature (BSML) font; surah-name lines are text.
            if line_type == "ayah":
                font_family = f"qcf-p{row['page']}"
            elif line_type == "basmalah":
                font_family = "qcf-bsml"
            else:
                font_family = None
            line = {
                "line_number": row["line_number"],
                "line_type": line_type,
                "is_centered": bool(row["is_centered"]),
                "surah_number": row["surah_number"],
                "surah_name": surah_names.get(row["surah_number"]) if line_type == "surah_name" else None,
                "glyph": row["line_glyph_v1"] if line_type == "basmalah" else None,
                "font_family": font_family,
                "words": [],
            }
            line_by_id[row["line_id"]] = line
            pages[row["page"]].append(line)
        if row["w_surah"] is not None:
            surah, ayah, position = row["w_surah"], row["ayah_number"], row["word_position"]
            line["words"].append({
                "glyph": row["glyph_v1"],
                "surah": surah,
                "ayah": ayah,
                "word_position": position,
                "ayah_id": row["ayah_id"],
                "word_key": f"{surah}:{ayah}:{position}",
                "text": row["word_text"],
            })
            page_surahs[row["page"]].setdefault(surah, surah_names.get(surah, ""))

    page_numbers = sorted(pages.keys())
    index = {
        "present": True,
        "layout_id": meta["layout_id"],
        "min_page": page_numbers[0] if page_numbers else None,
        "max_page": page_numbers[-1] if page_numbers else None,
        "pages": dict(pages),
        "page_surahs": dict(page_surahs),
    }
    return put_cache_entry(_mushaf_layout_index_cache, cache_key, index, limit)


def build_mushaf_page_layout(cursor, mushaf, page=None, selected_ayah_id=None):
    """Authentic Madani page layout — Hafs only; fall back to the reader otherwise."""
    if mushaf != config.get_hafs_mushaf_id():
        return {"found": False, "fallback": "reader"}

    index = get_mushaf_layout_index(cursor)
    if not index.get("present"):
        return {"found": False, "fallback": "reader"}

    min_page, max_page = index["min_page"], index["max_page"]
    if min_page is None:
        return {"found": False, "fallback": "reader"}

    if page is None:
        page = min_page
    if page < min_page or page > max_page:
        return {"found": False}

    lines = []
    for line in index["pages"].get(page, []):
        words = [
            {**word, "is_selected": selected_ayah_id is not None and word["ayah_id"] == selected_ayah_id}
            for word in line["words"]
        ]
        lines.append({**line, "words": words})

    surahs = [{"id": sid, "name": name} for sid, name in index["page_surahs"].get(page, {}).items()]

    return {
        "found": True,
        "mushaf_id": mushaf,
        "page": page,
        "min_page": min_page,
        "max_page": max_page,
        "has_previous": page > min_page,
        "has_next": page < max_page,
        "selected_ayah_id": selected_ayah_id,
        "layout_id": index["layout_id"],
        "font_base_path": _MUSHAF_FONT_BASE_PATH,
        "surahs": surahs,
        "lines": lines,
    }


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


def resolve_locator_ayah_id(cursor, mushaf, surah=None, ayah=None, juz=None):
    """Resolve a surah/ayah or juz locator to an ayah id for one mushaf."""
    surah = coerce_optional_int(surah)
    ayah = coerce_optional_int(ayah)
    juz = coerce_optional_int(juz)

    if juz is not None:
        cursor.execute(
            "SELECT id FROM ayahs WHERE mushaf_id = ? AND juz = ? ORDER BY global_index LIMIT 1",
            (mushaf, juz),
        )
        row = cursor.fetchone()
        return row["id"] if row else None

    if surah is not None:
        target_ayah = ayah if ayah is not None else 1
        cursor.execute(
            "SELECT id FROM ayahs WHERE mushaf_id = ? AND surah_id = ? AND number_in_surah = ?",
            (mushaf, surah, target_ayah),
        )
        row = cursor.fetchone()
        if row:
            return row["id"]
        # Requested ayah is out of range — fall back to the surah's first ayah.
        cursor.execute(
            "SELECT id FROM ayahs WHERE mushaf_id = ? AND surah_id = ? ORDER BY number_in_surah LIMIT 1",
            (mushaf, surah),
        )
        row = cursor.fetchone()
        return row["id"] if row else None

    return None


def build_quran_page_payload(
    cursor, mushaf, page=None, ayah_id=None, selected_ayah_id=None, surah=None, ayah=None, juz=None
):
    """Build one page of Quran text, optionally resolving the page from a selected ayah,
    a surah/ayah locator, or a juz number."""
    page = coerce_optional_int(page)
    ayah_id = coerce_optional_int(ayah_id)
    selected_ayah_id = coerce_optional_int(selected_ayah_id)

    bounds = fetch_mushaf_page_bounds(cursor, mushaf)
    if bounds is None or bounds["min_page"] is None or bounds["max_page"] is None:
        return {"found": False, "ayahs": []}

    min_page = bounds["min_page"]
    max_page = bounds["max_page"]
    target_page = page

    if ayah_id is None:
        locator_ayah_id = resolve_locator_ayah_id(cursor, mushaf, surah, ayah, juz)
        if locator_ayah_id is not None:
            ayah_id = locator_ayah_id

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
    juzs_in_order = []
    seen_juzs = set()
    for ayah in ayahs:
        if ayah["surah_id"] not in seen_surahs:
            seen_surahs.add(ayah["surah_id"])
            surahs.append({"id": ayah["surah_id"], "name": ayah["surah"]})
        juz_value = ayah.get("juz")
        if juz_value is not None and juz_value not in seen_juzs:
            seen_juzs.add(juz_value)
            juzs_in_order.append(juz_value)

    juz_primary = juzs_in_order[0] if juzs_in_order else None
    juz_secondary = juzs_in_order[1] if len(juzs_in_order) > 1 else None

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
        "juz": juz_primary,
        "juz_secondary": juz_secondary,
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

    occurrences = filter_exact_occurrences(cursor, fetch_exact_candidate_rows(cursor, q_simple, mushaf), q, q_simple)
    if not occurrences:
        return [], build_word_did_you_mean(cursor, q_simple, mushaf)

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
        total_surahs = len({v["surah_id"] for v in verse_list})
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
            "total_surahs": total_surahs,
            "verses": verses,
        }

    occurrences = filter_exact_occurrences(cursor, fetch_exact_candidate_rows(cursor, q_simple, mushaf), q, q_simple)
    if not occurrences:
        return None

    verse_list = occurrences_to_verse_list(occurrences)
    total_occurrences = len(occurrences)
    total_verses = len(verse_list)
    total_surahs = len({v["surah_id"] for v in verse_list})
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
        "total_surahs": total_surahs,
        "verses": verses,
    }


def build_paginated_root_result(cursor, root_id, mushaf, page, page_size):
    """Build a single root-search card with one page of verses."""
    cursor.execute("SELECT root_text FROM roots WHERE id = ?", (root_id,))
    root_info = cursor.fetchone()
    if not root_info:
        return None

    total_occurrences, total_verses, total_surahs = fetch_root_summary(cursor, root_id, mushaf)
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
        "total_surahs": total_surahs,
        "verses": verses,
    }


def build_paginated_search_results(cursor, q, q_simple, mode, mushaf, page_size):
    """Build the initial paginated search payload."""
    if not q_simple:
        return [], None

    if mode == "exact":
        query_tokens = tokenize_exact_query(q)
        did_you_mean = None
        if len(query_tokens) > 1:
            _phrase_tokens, matches, did_you_mean = search_exact_phrase_matches(cursor, q, mushaf)
            if not matches:
                return [], did_you_mean
        result = build_paginated_exact_result(cursor, q, q_simple, mushaf, page=1, page_size=page_size)
        if result:
            return [result], did_you_mean
        if len(query_tokens) == 1:
            did_you_mean = build_word_did_you_mean(cursor, q_simple, mushaf)
        return [], did_you_mean

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
