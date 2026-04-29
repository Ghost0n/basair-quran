import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[3]

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 50
MAX_QUERY_LENGTH = 120
DEFAULT_CORS_ORIGINS = ("http://127.0.0.1:3000", "http://localhost:3000")
SUPPORTED_PREFIX_LEMMAS = {"\u0648", "\u0641", "\u0628", "\u0643", "\u0644"}
ARTICLE_LEMMA = "\u0627\u0644"
PHRASE_SUGGESTION_MIN_CONFIDENCE = 0.88
PHRASE_SUGGESTION_MIN_TOKEN_CONFIDENCE = 0.72
PHRASE_SUGGESTION_MIN_LEAD = 0.05
WORD_SUGGESTION_MIN_CONFIDENCE = 0.86
WORD_SUGGESTION_MIN_LEAD = 0.04

_db_path = BASE_DIR / "data" / "quran.db"
_morphology_path = BASE_DIR / "data" / "quran-morphology.txt"


def get_db_path() -> str:
    return str(_db_path)


def set_db_path(path: str) -> None:
    global _db_path
    _db_path = Path(path)


def get_morphology_path() -> str:
    return str(_morphology_path)


def set_morphology_path(path: str) -> None:
    global _morphology_path
    _morphology_path = Path(path)


def get_cors_origins() -> list[str]:
    """Return allowed browser origins for the API."""
    raw_origins = os.environ.get("QBASAIR_CORS_ORIGINS", "")
    if not raw_origins.strip():
        return list(DEFAULT_CORS_ORIGINS)

    return [origin.strip().rstrip("/") for origin in raw_origins.split(",") if origin.strip()]
