from src.app.core import http_cache


def test_quran_data_is_cacheable_and_user_data_is_not(api_client):
    page = api_client.get("/api/quran-page", params={"mushaf": 1, "page": 1})
    assert page.status_code == 200
    assert page.headers["cache-control"] == http_cache.QURAN_DATA

    surahs = api_client.get("/api/surahs")
    assert surahs.headers["cache-control"] == http_cache.QURAN_DATA

    # Per-user data must never be cached publicly.
    for path in ("/api/user/preferences", "/api/notebook", "/api/sessions", "/api/roots"):
        response = api_client.get(path)
        assert "public" not in response.headers.get("cache-control", ""), path


def test_cache_policy_skips_errors_and_writes():
    assert http_cache.cache_control_for("GET", "/api/quran-page", 404) is None
    assert http_cache.cache_control_for("POST", "/api/search", 200) is None
    assert http_cache.cache_control_for("GET", "/api/search-v2", 200) == http_cache.SEARCH_DATA
    assert http_cache.cache_control_for("GET", "/api/auth/session", 200) is None
