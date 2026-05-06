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
_research_index_path = BASE_DIR / "data" / "research_agent.db"
_research_sources_path = BASE_DIR / "data" / "research_sources"
_auth_db_path = BASE_DIR / "data" / "auth.db"


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


def get_research_index_path() -> str:
    raw_path = os.environ.get("QBASAIR_RESEARCH_INDEX_PATH")
    return str(Path(raw_path) if raw_path else _research_index_path)


def set_research_index_path(path: str) -> None:
    global _research_index_path
    _research_index_path = Path(path)


def get_research_sources_path() -> str:
    raw_path = os.environ.get("QBASAIR_RESEARCH_SOURCES_PATH")
    return str(Path(raw_path) if raw_path else _research_sources_path)


def get_auth_db_path() -> str:
    raw_path = os.environ.get("QBASAIR_AUTH_DB_PATH")
    return str(Path(raw_path) if raw_path else _auth_db_path)


def set_auth_db_path(path: str) -> None:
    global _auth_db_path
    _auth_db_path = Path(path)


def get_llm_provider() -> str:
    return os.environ.get("QBASAIR_LLM_PROVIDER", "ollama").strip().lower()


def get_ollama_api_key() -> str:
    return os.environ.get("OLLAMA_API_KEY", "").strip()


def get_ollama_base_url() -> str:
    return os.environ.get("QBASAIR_OLLAMA_BASE_URL", "https://ollama.com").strip().rstrip("/")


def get_llm_chat_model() -> str:
    return os.environ.get("QBASAIR_LLM_CHAT_MODEL", "gemma4:31b-cloud").strip()


def get_llm_embed_model() -> str:
    return os.environ.get("QBASAIR_LLM_EMBED_MODEL", "nomic-embed-text").strip()


def get_llm_timeout_seconds() -> float:
    raw_value = os.environ.get("QBASAIR_LLM_TIMEOUT_SECONDS", "120")
    try:
        return max(1.0, float(raw_value))
    except ValueError:
        return 120.0


def is_auth_enabled() -> bool:
    return read_bool_env("QBASAIR_AUTH_ENABLED")


def get_session_secret() -> str:
    return os.environ.get("QBASAIR_SESSION_SECRET", "qbasair-dev-session-secret").strip()


def get_session_cookie_name() -> str:
    raw_value = os.environ.get("QBASAIR_SESSION_COOKIE_NAME", "qbasair_session").strip()
    return raw_value or "qbasair_session"


def is_session_secure() -> bool:
    return read_bool_env("QBASAIR_SESSION_SECURE")


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
