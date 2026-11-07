"""Morphology service — per-word root / lemma / part-of-speech.

Parses ``data/quran-morphology.txt`` (the Quranic Arabic Corpus
morphology format) at runtime and indexes it in memory by surah:ayah.
The file is a tracked, documented input, so runtime parsing keeps
morphology reproducible without a database schema migration.

File line format (tab-separated):
    LOCATION  FORM  TAG  FEATURES
where LOCATION is ``surah:ayah:word:segment`` and FEATURES is a
``|``-separated list such as ``ROOT:رحم|LEM:رَحْمٰن|MS|GEN|ADJ``.
"""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path
import threading

from src.app.core import config

_lock = threading.Lock()
_index: dict[tuple[int, int], list[dict]] | None = None
# Secondary index: (surah, normalized-skeleton) -> words. Lets a verse be matched
# by its text regardless of the riwāyah's ayah NUMBERING, which differs between
# counting traditions (e.g. Madani/Qalūn vs Kufan/Hafs). The morphology source
# (Quranic Arabic Corpus) is Kufan-numbered, so a Qalūn ayah number would point
# at the wrong verse without this.
_text_index: dict[tuple[int, str], list[dict]] | None = None
# Per-surah ordered word stream: [(word-skeleton, word), …]. Lets a displayed
# verse be located as a contiguous run of words even when counting traditions
# SPLIT or MERGE verses differently (e.g. Qalūn splits a long Kufan verse into
# two), which the whole-verse skeleton index alone cannot handle.
_word_stream: dict[int, list[tuple[str, dict]]] | None = None

# Fold to a consonant skeleton so the same verse matches across riwāyāt (only
# marks/spelling differ). Mirrors scripts/build_mushaf_layout normalisation.
_SIG_FOLD = {"آ": "ا", "أ": "ا", "إ": "ا", "ٱ": "ا", "ى": "ي", "ئ": "ي", "ؤ": "و", "ة": "ه"}


def normalize_signature(text: str) -> str:
    """Consonant-skeleton signature of an ayah (marks/spaces/symbols removed)."""
    kept = [
        ch
        for ch in text
        if (0x0621 <= ord(ch) <= 0x063A) or (0x0641 <= ord(ch) <= 0x064A) or ord(ch) == 0x0671
    ]
    folded = "".join(_SIG_FOLD.get(ch, ch) for ch in kept)
    return folded.replace("ء", "")

POS_LABELS = {
    "N": "اسم",
    "PN": "اسم علَم",
    "V": "فعل",
    "P": "حرف جرّ",
    "DET": "أداة تعريف",
    "PRON": "ضمير",
    "ADJ": "صفة",
    "CONJ": "حرف عطف",
    "REL": "اسم موصول",
    "ACC": "ظرف",
    "T": "ظرف زمان",
    "LOC": "ظرف مكان",
    "INTG": "أداة استفهام",
    "NEG": "أداة نفي",
    "EMPH": "حرف توكيد",
    "SUB": "حرف مصدري",
    "RES": "أداة حصر",
    "COND": "أداة شرط",
    "PRP": "لام التعليل",
    "DEM": "اسم إشارة",
    "VOC": "أداة نداء",
    "ADV": "حال",
}

CASE_LABELS = {
    "NOM": "مرفوع",
    "ACC": "منصوب",
    "GEN": "مجرور",
}

# Readable Arabic for the grammatical features worth surfacing (السمات). QAC
# codes not listed here are intentionally dropped: POS echoes already shown as
# القسم (e.g. "P" for a preposition), segment structure (PREF/SUFF/PRON), verb
# form numbers, and lemma families — so the line only shows relevant الصرف info.
FEATURE_LABELS = {
    # aspect / voice / derivation
    "PERF": "ماضٍ", "IMPF": "مضارع", "IMPV": "أمر",
    "PASS": "مبنيّ للمجهول", "ACT_PCPL": "اسم فاعل", "PASS_PCPL": "اسم مفعول",
    # mood (verb i‘rāb)
    "MOOD:IND": "مرفوع", "MOOD:SUBJ": "منصوب", "MOOD:JUS": "مجزوم",
    # person
    "1S": "المتكلّم", "1P": "المتكلّمون",
    "2MS": "المخاطَب", "2FS": "المخاطَبة", "2MP": "المخاطَبون", "2FP": "المخاطَبات",
    "2MD": "المخاطَبان", "2FD": "المخاطَبتان",
    "3MS": "الغائب", "3FS": "الغائبة", "3MP": "الغائبون", "3FP": "الغائبات",
    "3MD": "الغائبان", "3FD": "الغائبتان",
    # gender / number (nouns)
    "M": "مذكّر", "F": "مؤنّث",
    "MS": "مفرد مذكّر", "FS": "مفرد مؤنّث",
    "MD": "مثنّى مذكّر", "FD": "مثنّى مؤنّث",
    "MP": "جمع مذكّر", "FP": "جمع مؤنّث",
    # definiteness
    "INDEF": "نكرة", "DEF": "معرفة",
}


def _label_features(flags: list[str]) -> list[str]:
    """Translate QAC feature codes to readable Arabic, dropping noise/redundant codes."""
    labels: list[str] = []
    for flag in flags:
        label = FEATURE_LABELS.get(flag)
        if label and label not in labels:
            labels.append(label)
    return labels


def _parse_features(raw: str) -> dict:
    root = None
    lemma = None
    case = None
    flags: list[str] = []
    for part in raw.split("|"):
        if part.startswith("ROOT:"):
            root = part[5:]
        elif part.startswith("LEM:"):
            lemma = part[4:]
        elif part in CASE_LABELS:
            case = part
        elif part:
            flags.append(part)
    return {"root": root, "lemma": lemma, "case": case, "flags": flags}


def _aggregate_word(segments: list[dict]) -> dict:
    """Collapse the segments of one word into a single morphology entry."""
    ordered = sorted(segments, key=lambda seg: seg["segment"])
    text = "".join(seg["form"] for seg in ordered)

    # The "main" segment is the stem — the one carrying a ROOT, else the
    # longest non-prefix form, else simply the last segment.
    main = next((seg for seg in ordered if seg["features"]["root"]), None)
    if main is None:
        non_prefix = [seg for seg in ordered if "PREF" not in seg["features"]["flags"]]
        pool = non_prefix or ordered
        main = max(pool, key=lambda seg: len(seg["form"]))

    root = next((seg["features"]["root"] for seg in ordered if seg["features"]["root"]), None)
    features = main["features"]
    pos = main["tag"]

    return {
        "position": ordered[0]["word"],
        "text": text,
        "root": root,
        "lemma": features["lemma"],
        "pos": pos,
        "pos_label": POS_LABELS.get(pos, pos),
        "case": features["case"],
        "case_label": CASE_LABELS.get(features["case"]) if features["case"] else None,
        "features": _label_features(features["flags"]),
    }


def _build_index() -> tuple[
    dict[tuple[int, int], list[dict]],
    dict[tuple[int, str], list[dict]],
    dict[int, list[tuple[str, dict]]],
]:
    path = Path(config.get_morphology_path())
    raw: dict[tuple[int, int], dict[int, list[dict]]] = defaultdict(lambda: defaultdict(list))
    if path.exists():
        with open(path, encoding="utf-8") as handle:
            for line in handle:
                line = line.rstrip("\n")
                if not line:
                    continue
                parts = line.split("\t")
                if len(parts) < 4:
                    continue
                location, form, tag, features_raw = parts[0], parts[1], parts[2], parts[3]
                location_parts = location.split(":")
                if len(location_parts) != 4:
                    continue
                try:
                    surah, ayah, word, segment = (int(value) for value in location_parts)
                except ValueError:
                    continue
                raw[(surah, ayah)][word].append(
                    {
                        "form": form,
                        "tag": tag,
                        "segment": segment,
                        "word": word,
                        "features": _parse_features(features_raw),
                    }
                )

    index: dict[tuple[int, int], list[dict]] = {}
    text_index: dict[tuple[int, str], list[dict]] = {}
    for key, words in raw.items():
        entries = [_aggregate_word(words[word]) for word in sorted(words)]
        index[key] = entries
        sig = normalize_signature("".join(entry["text"] for entry in entries))
        if sig:
            # Identical-skeleton verses (e.g. repeated āyāt) collide harmlessly:
            # same words → same morphology.
            text_index[(key[0], sig)] = entries

    word_stream: dict[int, list[tuple[str, dict]]] = defaultdict(list)
    for surah, ayah in sorted(index.keys()):
        for entry in index[(surah, ayah)]:
            word_stream[surah].append((normalize_signature(entry["text"]), entry))
    return index, text_index, dict(word_stream)


def _ensure_index() -> tuple[
    dict[tuple[int, int], list[dict]],
    dict[tuple[int, str], list[dict]],
    dict[int, list[tuple[str, dict]]],
]:
    global _index, _text_index, _word_stream
    if _index is None:
        with _lock:
            if _index is None:
                _index, _text_index, _word_stream = _build_index()
    return _index, _text_index, _word_stream  # type: ignore[return-value]


def reset_index() -> None:
    """Drop the cached index (used by tests that swap the morphology file)."""
    global _index, _text_index, _word_stream
    with _lock:
        _index = None
        _text_index = None
        _word_stream = None


def _match_word_run(
    surah: int, verse_sigs: list[str], word_stream: dict[int, list[tuple[str, dict]]]
) -> list[dict] | None:
    """Locate the displayed verse as a contiguous run in the surah's word stream.

    Handles split/merge counting differences: the run may start mid-verse or span
    two Kufan verses. Returns the matched words re-indexed to positions 1..N so a
    click's word index aligns. ``None`` if the skeleton sequence isn't found.
    """
    stream = word_stream.get(surah)
    if not stream or not verse_sigs or any(not s for s in verse_sigs):
        return None
    sigs = [sig for sig, _ in stream]
    n = len(verse_sigs)
    for start in range(len(sigs) - n + 1):
        if sigs[start : start + n] == verse_sigs:
            return [{**stream[start + offset][1], "position": offset + 1} for offset in range(n)]
    return None


def get_ayah_morphology(surah: int, ayah: int, text: str | None = None) -> dict:
    """Return per-word morphology for one ayah.

    When ``text`` (the displayed ayah) is given, the verse is matched by its
    normalized skeleton so the lookup is correct even for riwāyāt whose ayah
    numbering differs from the Kufan/Hafs morphology source. Falls back to the
    ``(surah, ayah)`` number when no text match is found.
    """
    index, text_index, word_stream = _ensure_index()
    words = None
    if text:
        # 1) exact verse-boundary match (fast, common case: only numbering differs)
        words = text_index.get((surah, normalize_signature(text)))
        # 2) run match — verse split/merged relative to the Kufan source
        if words is None:
            verse_sigs = [normalize_signature(token) for token in text.split()]
            words = _match_word_run(surah, verse_sigs, word_stream)
    if words is None:
        # 3) last resort: the ayah number (correct only for Kufan-numbered riwāyāt)
        words = index.get((surah, ayah))
    if not words:
        return {"found": False, "surah": surah, "ayah": ayah, "words": []}
    return {"found": True, "surah": surah, "ayah": ayah, "words": words}
