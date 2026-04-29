import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[3]

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 50
MAX_QUERY_LENGTH = 120
DEFAULT_CORS_ORIGINS = ("http://127.0.0.1:3000", "http://localhost:3000")
DEFAULT_SQLITE_CACHE_PAGES = 10000
LOW_MEMORY_SQLITE_CACHE_PAGES = 2000
LOW_MEMORY_MUSHAF_CACHE_LIMIT = 1
LOW_MEMORY_QUERY_CACHE_LIMIT = 32
SUPPORTED_PREFIX_LEMMAS = {"\u0648", "\u0641", "\u0628", "\u0643", "\u0644"}
ARTICLE_LEMMA = "\u0627\u0644"
PHRASE_SUGGESTION_MIN_CONFIDENCE = 0.88
PHRASE_SUGGESTION_MIN_TOKEN_CONFIDENCE = 0.72
PHRASE_SUGGESTION_MIN_LEAD = 0.05
WORD_SUGGESTION_MIN_CONFIDENCE = 0.86
WORD_SUGGESTION_MIN_LEAD = 0.04

_db_path = BASE_DIR / "data" / "quran.db"
_morphology_path = BASE_DIR / "data" / "quran-morphology.txt"


def read_bool_env(name: str, default: bool = False) -> bool:
    """Parse a conventional boolean environment variable."""
    raw_value = os.environ.get(name)
    if raw_value is None:
        return default

    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


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


def is_low_memory_mode() -> bool:
    """Return True when runtime caches should favor lower memory usage."""
    return read_bool_env("QBASAIR_LOW_MEMORY_MODE")


def get_runtime_sqlite_cache_pages() -> int:
    """Return the SQLite page-cache target for the current runtime mode."""
    if is_low_memory_mode():
        return LOW_MEMORY_SQLITE_CACHE_PAGES
    return DEFAULT_SQLITE_CACHE_PAGES


def get_runtime_mushaf_cache_limit() -> int | None:
    """Return the per-mushaf cache entry limit, or None when unlimited."""
    if is_low_memory_mode():
        return LOW_MEMORY_MUSHAF_CACHE_LIMIT
    return None


def get_runtime_query_cache_limit() -> int | None:
    """Return the did-you-mean cache entry limit, or None when unlimited."""
    if is_low_memory_mode():
        return LOW_MEMORY_QUERY_CACHE_LIMIT
    return None


def get_cors_origins() -> list[str]:
    """Return allowed browser origins for the API."""
    raw_origins = os.environ.get("QBASAIR_CORS_ORIGINS", "")
    if not raw_origins.strip():
        return list(DEFAULT_CORS_ORIGINS)

    return [origin.strip().rstrip("/") for origin in raw_origins.split(",") if origin.strip()]
