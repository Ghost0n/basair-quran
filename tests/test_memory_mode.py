from collections import OrderedDict

from src.app.core import config
from src.app.services import quran_service


def test_low_memory_mode_runtime_settings_follow_env(monkeypatch):
    monkeypatch.delenv("QBASAIR_LOW_MEMORY_MODE", raising=False)

    assert config.is_low_memory_mode() is False
    assert config.get_runtime_sqlite_cache_pages() == config.DEFAULT_SQLITE_CACHE_PAGES
    assert config.get_runtime_mushaf_cache_limit() is None
    # Query caches are keyed by arbitrary user input, so they are bounded even in
    # normal mode (previously None/unbounded — a memory leak).
    assert config.get_runtime_query_cache_limit() == config.DEFAULT_QUERY_CACHE_LIMIT

    monkeypatch.setenv("QBASAIR_LOW_MEMORY_MODE", "1")

    assert config.is_low_memory_mode() is True
    assert config.get_runtime_sqlite_cache_pages() == config.LOW_MEMORY_SQLITE_CACHE_PAGES
    assert config.get_runtime_mushaf_cache_limit() == config.LOW_MEMORY_MUSHAF_CACHE_LIMIT
    assert config.get_runtime_query_cache_limit() == config.LOW_MEMORY_QUERY_CACHE_LIMIT


def test_put_cache_entry_evicts_oldest_value_when_limit_is_reached():
    cache = OrderedDict()

    quran_service.put_cache_entry(cache, "first", 1, limit=2)
    quran_service.put_cache_entry(cache, "second", 2, limit=2)
    assert quran_service.get_cache_entry(cache, "first") == 1

    quran_service.put_cache_entry(cache, "third", 3, limit=2)

    assert list(cache.keys()) == ["first", "third"]
    assert quran_service.get_cache_entry(cache, "second") is None
