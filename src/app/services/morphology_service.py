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
        "features": features["flags"],
    }


def _build_index() -> dict[tuple[int, int], list[dict]]:
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
    for key, words in raw.items():
        index[key] = [_aggregate_word(words[word]) for word in sorted(words)]
    return index


def _get_index() -> dict[tuple[int, int], list[dict]]:
    global _index
    if _index is None:
        with _lock:
            if _index is None:
                _index = _build_index()
    return _index


def reset_index() -> None:
    """Drop the cached index (used by tests that swap the morphology file)."""
    global _index
    with _lock:
        _index = None


def get_ayah_morphology(surah: int, ayah: int) -> dict:
    """Return per-word morphology for one ayah."""
    words = _get_index().get((surah, ayah))
    if not words:
        return {"found": False, "surah": surah, "ayah": ayah, "words": []}
    return {"found": True, "surah": surah, "ayah": ayah, "words": words}
