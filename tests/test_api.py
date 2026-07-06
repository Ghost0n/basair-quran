from src import main


def test_page_span_parsing_supports_boundary_ranges():
    assert main.parse_page_span("85-86") == (85, 86)
    assert main.page_value_contains("85-86", 85) is True
    assert main.page_value_contains("85-86", 86) is True
    assert main.page_value_contains("85-86", 87) is False


def test_openapi_contract_exposes_stable_search_and_reader_endpoints(api_client):
    response = api_client.get("/openapi.json")
    assert response.status_code == 200
    body = response.json()

    assert "/api/search-v2" in body["paths"]
    assert "/api/search-result-page" in body["paths"]
    assert "/api/quran-page" in body["paths"]
    assert "/api/auth/login" in body["paths"]
    assert "/api/auth/session" in body["paths"]
    assert "/api/research-agent" in body["paths"]
    assert "BatchSuggestRequest" in body["components"]["schemas"]
    assert "ResearchAgentRequest" in body["components"]["schemas"]


def test_search_mode_is_validated(api_client):
    response = api_client.get(
        "/api/search-v2",
        params={"q": "shared", "mode": "broad", "mushaf": 1},
    )
    assert response.status_code == 422


def test_exact_mode_suggestions_only_return_words(api_client):
    response = api_client.get(
        "/api/suggest",
        params={"q": "sha", "mode": "exact", "mushaf": 1},
    )
    assert response.status_code == 200
    items = response.json()
    assert items
    assert {item["type"] for item in items} == {"word"}

    root_response = api_client.get(
        "/api/suggest",
        params={"q": "sha", "mode": "root", "mushaf": 1},
    )
    assert root_response.status_code == 200
    root_items = root_response.json()
    assert {item["type"] for item in root_items} == {"root", "word"}


def test_exact_mode_batch_suggestions_only_return_words(api_client):
    response = api_client.post(
        "/api/suggest-batch",
        json={"queries": ["sha", "shared"], "mode": "exact", "mushaf": 1},
    )
    assert response.status_code == 200
    items = response.json()
    assert items
    assert {item["type"] for item in items} == {"word"}

    root_response = api_client.post(
        "/api/suggest-batch",
        json={"queries": ["sha", "shared"], "mode": "root", "mushaf": 1},
    )
    assert root_response.status_code == 200
    root_items = root_response.json()
    assert {item["type"] for item in root_items} == {"root", "word"}


def test_search_v2_returns_paginated_cards_and_smaller_initial_payload(api_client):
    response = api_client.get(
        "/api/search-v2",
        params={"q": "shared", "mode": "root", "mushaf": 1, "page_size": 10},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["found"] is True
    assert len(body["results"]) == 2

    first_result = body["results"][0]
    second_result = body["results"][1]
    assert first_result["result_key"] == "root:101"
    assert first_result["page"] == 1
    assert first_result["total_pages"] == 2
    assert first_result["total_verses"] == 12
    assert len(first_result["verses"]) == 10
    assert first_result["verses"][0]["ayah_id"] == 1
    assert first_result["verses"][0]["mushaf_id"] == 1
    assert first_result["verses"][0]["surah_id"] == 1
    assert first_result["verses"][0]["global_index"] == 0
    assert second_result["result_key"] == "root:102"
    assert second_result["page"] == 1
    assert second_result["total_pages"] == 1
    assert len(second_result["verses"]) == 2

    legacy_response = api_client.get(
        "/api/search",
        params={"q": "shared", "mode": "root", "mushaf": 1},
    )
    assert legacy_response.status_code == 200
    assert len(response.content) < len(legacy_response.content)
    assert len(legacy_response.json()["results"][0]["verses"]) == 12


def test_search_result_page_is_stable_and_clamped(api_client):
    first_response = api_client.get(
        "/api/search-v2",
        params={"q": "shared", "mode": "root", "mushaf": 1, "page_size": 10},
    )
    second_response = api_client.get(
        "/api/search-v2",
        params={"q": "shared", "mode": "root", "mushaf": 1, "page_size": 10},
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200

    first_keys = [item["result_key"] for item in first_response.json()["results"]]
    second_keys = [item["result_key"] for item in second_response.json()["results"]]
    assert first_keys == second_keys == ["root:101", "root:102"]
    assert [item["page"] for item in first_response.json()["results"]] == [1, 1]

    page_response = api_client.get(
        "/api/search-result-page",
        params={
            "q": "shared",
            "mode": "root",
            "mushaf": 1,
            "result_key": "root:101",
            "page": 2,
            "page_size": 10,
        },
    )
    assert page_response.status_code == 200
    page_body = page_response.json()
    assert page_body["found"] is True
    assert page_body["result"]["result_key"] == "root:101"
    assert page_body["result"]["page"] == 2
    assert page_body["result"]["total_pages"] == 2
    assert len(page_body["result"]["verses"]) == 2
    assert page_body["result"]["verses"][0]["ayah_id"] == 11
    assert page_body["result"]["verses"][0]["mushaf_id"] == 1
    assert page_body["result"]["verses"][0]["surah_id"] == 1
    assert page_body["result"]["verses"][0]["global_index"] == 10

    clamped_response = api_client.get(
        "/api/search-result-page",
        params={
            "q": "shared",
            "mode": "root",
            "mushaf": 1,
            "result_key": "root:101",
            "page": 999,
            "page_size": 10,
        },
    )
    assert clamped_response.status_code == 200
    assert clamped_response.json()["result"]["page"] == 2


def test_ayah_reader_returns_centered_slice_and_clamps(api_client):
    middle_response = api_client.get(
        "/api/ayah-reader",
        params={"mushaf": 1, "ayah_id": 8, "before": 2, "after": 2},
    )
    assert middle_response.status_code == 200
    middle_body = middle_response.json()
    assert middle_body["found"] is True
    assert middle_body["mushaf_id"] == 1
    assert middle_body["surah_id"] == 1
    assert middle_body["surah"] == "Fixture Surah"
    assert middle_body["center_ayah_id"] == 8
    assert middle_body["start_ayah"] == 6
    assert middle_body["end_ayah"] == 10
    assert middle_body["has_previous"] is True
    assert middle_body["has_next"] is True
    assert [ayah["ayah"] for ayah in middle_body["ayahs"]] == [6, 7, 8, 9, 10]
    assert [ayah["is_center"] for ayah in middle_body["ayahs"]] == [False, False, True, False, False]
    assert middle_body["ayahs"][2]["ayah_id"] == 8
    assert middle_body["ayahs"][2]["global_index"] == 7

    start_response = api_client.get(
        "/api/ayah-reader",
        params={"mushaf": 1, "ayah_id": 1, "before": 7, "after": 2},
    )
    assert start_response.status_code == 200
    start_body = start_response.json()
    assert start_body["found"] is True
    assert start_body["start_ayah"] == 1
    assert start_body["end_ayah"] == 3
    assert start_body["has_previous"] is False
    assert start_body["has_next"] is True

    end_response = api_client.get(
        "/api/ayah-reader",
        params={"mushaf": 1, "ayah_id": 15, "before": 2, "after": 7},
    )
    assert end_response.status_code == 200
    end_body = end_response.json()
    assert end_body["found"] is True
    assert end_body["start_ayah"] == 13
    assert end_body["end_ayah"] == 15
    assert end_body["has_previous"] is True
    assert end_body["has_next"] is False


def test_ayah_reader_more_returns_directional_slices_and_boundaries(api_client):
    before_response = api_client.get(
        "/api/ayah-reader-more",
        params={"mushaf": 1, "surah_id": 1, "anchor_ayah": 10, "direction": "before", "count": 3},
    )
    assert before_response.status_code == 200
    before_body = before_response.json()
    assert before_body["found"] is True
    assert before_body["direction"] == "before"
    assert before_body["has_more"] is True
    assert [ayah["ayah"] for ayah in before_body["ayahs"]] == [7, 8, 9]
    assert all(ayah["is_center"] is False for ayah in before_body["ayahs"])

    after_response = api_client.get(
        "/api/ayah-reader-more",
        params={"mushaf": 1, "surah_id": 1, "anchor_ayah": 10, "direction": "after", "count": 3},
    )
    assert after_response.status_code == 200
    after_body = after_response.json()
    assert after_body["found"] is True
    assert after_body["direction"] == "after"
    assert after_body["has_more"] is True
    assert [ayah["ayah"] for ayah in after_body["ayahs"]] == [11, 12, 13]

    before_boundary_response = api_client.get(
        "/api/ayah-reader-more",
        params={"mushaf": 1, "surah_id": 1, "anchor_ayah": 2, "direction": "before", "count": 10},
    )
    assert before_boundary_response.status_code == 200
    before_boundary_body = before_boundary_response.json()
    assert before_boundary_body["found"] is True
    assert before_boundary_body["has_more"] is False
    assert [ayah["ayah"] for ayah in before_boundary_body["ayahs"]] == [1]

    after_boundary_response = api_client.get(
        "/api/ayah-reader-more",
        params={"mushaf": 1, "surah_id": 1, "anchor_ayah": 13, "direction": "after", "count": 10},
    )
    assert after_boundary_response.status_code == 200
    after_boundary_body = after_boundary_response.json()
    assert after_boundary_body["found"] is True
    assert after_boundary_body["has_more"] is False
    assert [ayah["ayah"] for ayah in after_boundary_body["ayahs"]] == [14, 15]


def test_quran_page_resolves_selected_ayah_page_and_clamps(api_client):
    selected_response = api_client.get(
        "/api/quran-page",
        params={"mushaf": 1, "ayah_id": 11},
    )
    assert selected_response.status_code == 200
    selected_body = selected_response.json()
    assert selected_body["found"] is True
    assert selected_body["mushaf_id"] == 1
    assert selected_body["page"] == 2
    assert selected_body["min_page"] == 1
    assert selected_body["max_page"] == 2
    assert selected_body["total_pages"] == 2
    assert selected_body["has_previous"] is True
    assert selected_body["has_next"] is False
    assert selected_body["selected_ayah_id"] == 11
    assert selected_body["juz"] == 1
    assert "juz_secondary" not in selected_body
    assert [ayah["ayah"] for ayah in selected_body["ayahs"]] == [11, 12, 13, 14, 15]
    assert [ayah["is_selected"] for ayah in selected_body["ayahs"]] == [True, False, False, False, False]
    assert selected_body["ayahs"][0]["ayah_id"] == 11
    assert selected_body["ayahs"][0]["mushaf_id"] == 1
    assert selected_body["ayahs"][0]["surah_id"] == 1
    assert selected_body["ayahs"][0]["global_index"] == 10
    assert selected_body["ayahs"][0]["juz"] == 1

    clamped_response = api_client.get(
        "/api/quran-page",
        params={"mushaf": 1, "page": 999, "selected_ayah_id": 11},
    )
    assert clamped_response.status_code == 200
    clamped_body = clamped_response.json()
    assert clamped_body["found"] is True
    assert clamped_body["page"] == 2
    assert clamped_body["has_next"] is False


def test_quran_page_navigation_keeps_selection_only_on_matching_page(api_client):
    first_page_response = api_client.get(
        "/api/quran-page",
        params={"mushaf": 1, "page": 1, "selected_ayah_id": 11},
    )
    assert first_page_response.status_code == 200
    first_page_body = first_page_response.json()
    assert first_page_body["found"] is True
    assert first_page_body["page"] == 1
    assert first_page_body["has_previous"] is False
    assert first_page_body["has_next"] is True
    assert [ayah["ayah"] for ayah in first_page_body["ayahs"]] == list(range(1, 11))
    assert all(ayah["is_selected"] is False for ayah in first_page_body["ayahs"])


def test_quran_page_accepts_url_query_numbers(api_client):
    response = api_client.get("/api/quran-page?mushaf=1&page=2&selected_ayah_id=11")
    assert response.status_code == 200
    body = response.json()
    assert body["found"] is True
    assert body["page"] == 2
    assert body["selected_ayah_id"] == 11
    assert body["ayahs"][0]["is_selected"] is True


def test_quran_page_resolves_surah_ayah_and_juz_locators(api_client):
    by_surah_ayah = api_client.get("/api/quran-page", params={"mushaf": 1, "surah": 1, "ayah": 11})
    assert by_surah_ayah.status_code == 200
    surah_ayah_body = by_surah_ayah.json()
    assert surah_ayah_body["found"] is True
    assert surah_ayah_body["page"] == 2
    assert surah_ayah_body["selected_ayah_id"] == 11

    by_surah_only = api_client.get("/api/quran-page", params={"mushaf": 1, "surah": 1})
    assert by_surah_only.status_code == 200
    surah_only_body = by_surah_only.json()
    assert surah_only_body["found"] is True
    assert surah_only_body["page"] == 1
    assert surah_only_body["selected_ayah_id"] == 1

    by_juz = api_client.get("/api/quran-page", params={"mushaf": 1, "juz": 1})
    assert by_juz.status_code == 200
    juz_body = by_juz.json()
    assert juz_body["found"] is True
    assert juz_body["page"] == 1


def test_surahs_catalog_lists_surahs(api_client):
    response = api_client.get("/api/surahs")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == 1
    assert body[0]["name"] == "Fixture Surah"
    assert body[0]["type"] == "meccan"
    assert body[0]["ayah_count"] == 15


def test_reciters_catalog_lists_reciters(api_client):
    response = api_client.get("/api/reciters")
    assert response.status_code == 200
    body = response.json()
    assert len(body) >= 6
    first = body[0]
    assert first["id"]
    assert first["name"]
    assert first["audio_base"].startswith("https://")


def test_root_distribution_aggregates_by_surah(api_client):
    response = api_client.get("/api/root-distribution", params={"root": "shared", "mushaf": 1})
    assert response.status_code == 200
    body = response.json()
    assert body["found"] is True
    assert body["surah_count"] == 1
    assert body["surahs"][0]["surah_id"] == 1
    assert body["surahs"][0]["count"] == body["total"]
    assert body["total"] > 0


def test_session_save_rejects_oversized_messages(api_client):
    """Storage caps (T1.7): guests reach /api/sessions, so bound the payload."""
    too_many = {"id": "cap-count", "messages": [{"role": "user", "content": "x"} for _ in range(501)]}
    assert api_client.post("/api/sessions", json=too_many).status_code == 422

    huge = {"id": "cap-bytes", "messages": [{"role": "user", "content": "x" * (600 * 1024)}]}
    assert api_client.post("/api/sessions", json=huge).status_code == 422

    ok = {"id": "cap-ok", "messages": [{"role": "user", "content": "hello"}]}
    assert api_client.post("/api/sessions", json=ok).status_code == 200


def test_ready_endpoint_reports_db_and_commit(api_client, monkeypatch):
    """/api/ready (T1.8): DB SELECT 1 + commit SHA for the deploy gate."""
    monkeypatch.setenv("QBASAIR_COMMIT_SHA", "abc1234")
    response = api_client.get("/api/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["db"] is True
    assert body["commit"] == "abc1234"


def test_health_endpoint_stays_pure_liveness(api_client):
    response = api_client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_get_db_path_honors_env(monkeypatch):
    """T3.2: QBASAIR_DB_PATH must actually be read (was previously ignored)."""
    from pathlib import Path

    from src.app.core import config

    original = config.get_db_path()
    try:
        monkeypatch.setenv("QBASAIR_DB_PATH", "custom-quran.db")
        assert config.get_db_path() == str(Path("custom-quran.db"))
        monkeypatch.delenv("QBASAIR_DB_PATH", raising=False)
        config.set_db_path("fallback-quran.db")
        assert config.get_db_path() == str(Path("fallback-quran.db"))
    finally:
        config.set_db_path(original)


def test_query_cache_limit_is_bounded_in_normal_mode(monkeypatch):
    """T3.5: the did-you-mean caches must be bounded even in normal mode."""
    from src.app.core import config

    monkeypatch.delenv("QBASAIR_LOW_MEMORY_MODE", raising=False)
    limit = config.get_runtime_query_cache_limit()
    assert isinstance(limit, int) and limit > 0


def test_get_db_is_per_thread_and_reopens_after_close(api_client):
    """T3.3: each thread gets its own read-only connection; close reopens cleanly."""
    import threading

    from src.app.services import quran_service

    main_conn = quran_service.get_db()
    worker_conn = {}

    def grab():
        worker_conn["conn"] = quran_service.get_db()

    thread = threading.Thread(target=grab)
    thread.start()
    thread.join()

    # Distinct connection objects per thread (no shared cross-thread handle).
    assert worker_conn["conn"] is not main_conn
    # Same thread reuses its own handle.
    assert quran_service.get_db() is main_conn

    # After a close, the next get_db reopens a working connection.
    quran_service.close_db_connection()
    reopened = quran_service.get_db()
    assert reopened is not main_conn
    assert reopened.execute("SELECT 1").fetchone()[0] == 1


def test_phrase_metadata_is_memoized_per_mushaf(api_client):
    """T3.1: the per-mushaf phrase metadata is cached (no repeated full scan)."""
    from src.app.services import quran_service

    cursor = quran_service.get_db().cursor()
    first = quran_service.get_mushaf_phrase_metadata(cursor, 1)
    second = quran_service.get_mushaf_phrase_metadata(cursor, 1)
    assert first is second


def test_mushafs_expose_normalized_riwayah(api_client):
    """T8.2: each mushaf carries a normalized riwāyah key for mismatch detection."""
    from src.app.routes.mushafs import _riwayah_for_mushaf

    assert _riwayah_for_mushaf("حفص") == "hafs"
    assert _riwayah_for_mushaf("ورش") == "warsh"
    assert _riwayah_for_mushaf("قالون") == "qaloun"
    assert _riwayah_for_mushaf("السوسي") == "sousi"
    assert _riwayah_for_mushaf("unknown name") == "hafs"

    response = api_client.get("/api/mushafs")
    assert response.status_code == 200
    for mushaf in response.json():
        assert "riwayah" in mushaf and mushaf["riwayah"]
