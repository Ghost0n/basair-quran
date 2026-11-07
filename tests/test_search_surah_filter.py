"""Search results filtered to one surah (`surah` on /api/search-v2 and /api/search-result-page)."""

import sqlite3


def add_second_surah(tmp_path):
    """Three verses of surah 2 carrying root 101 («shared»), beside the fixture's twelve in surah 1."""
    connection = sqlite3.connect(tmp_path / "fixture.db")
    cursor = connection.cursor()
    cursor.execute("INSERT INTO surahs VALUES (2, 'Second Surah', 'Second Surah', 'medinan')")
    next_id = cursor.execute("SELECT MAX(id) FROM ayahs").fetchone()[0] + 1
    next_index = cursor.execute("SELECT MAX(global_index) FROM ayahs").fetchone()[0] + 1
    for offset, number_in_surah in enumerate(range(1, 4)):
        ayah_id = next_id + offset
        global_index = next_index + offset
        text = f"shared second {number_in_surah}"
        cursor.execute(
            """
            INSERT INTO ayahs (
                id, mushaf_id, surah_id, number_in_surah, text_uthmani, text_simple,
                text_imlaei, page, juz, line_start, line_end, global_index
            ) VALUES (?, 1, 2, ?, ?, ?, ?, 3, 1, 1, 1, ?)
            """,
            (ayah_id, number_in_surah, text, text, text, global_index),
        )
        cursor.execute(
            "INSERT INTO word_occurrences (root_id, ayah_id, word_position, word_text, word_simple) VALUES (101, ?, 1, 'shared', 'shared')",
            (ayah_id,),
        )
        cursor.execute(
            """
            INSERT INTO ayah_words (
                ayah_id, mushaf_id, surah_id, number_in_surah, global_index,
                word_position, word_text, word_simple
            ) VALUES (?, 1, 2, ?, ?, 1, 'shared', 'shared')
            """,
            (ayah_id, number_in_surah, global_index),
        )
    connection.commit()
    connection.close()


def root_result(body, key="root:101"):
    return next(result for result in body["results"] if result["result_key"] == key)


def test_root_search_without_surah_covers_every_surah(api_client, tmp_path):
    add_second_surah(tmp_path)
    response = api_client.get("/api/search-v2", params={"q": "shared", "mode": "root", "mushaf": 1})
    assert response.status_code == 200
    result = root_result(response.json())
    assert result["total_verses"] == 15
    assert result["total_surahs"] == 2


def test_root_search_filtered_to_one_surah(api_client, tmp_path):
    add_second_surah(tmp_path)
    response = api_client.get("/api/search-v2", params={"q": "shared", "mode": "root", "mushaf": 1, "surah": 2})
    assert response.status_code == 200
    body = response.json()
    assert body["found"] is True
    # Root 102 has no verse in surah 2: only root 101's card remains.
    assert [result["result_key"] for result in body["results"]] == ["root:101"]
    result = body["results"][0]
    assert result["total_verses"] == 3
    assert result["total_occurrences"] == 3
    assert result["total_surahs"] == 1
    assert result["total_pages"] == 1
    assert {verse["surah_id"] for verse in result["verses"]} == {2}
    assert [verse["ayah"] for verse in result["verses"]] == [1, 2, 3]


def test_result_page_keeps_the_surah_filter(api_client, tmp_path):
    add_second_surah(tmp_path)
    params = {"q": "shared", "mode": "root", "mushaf": 1, "result_key": "root:101", "page_size": 2, "surah": 2}
    first = api_client.get("/api/search-result-page", params={**params, "page": 1}).json()["result"]
    second = api_client.get("/api/search-result-page", params={**params, "page": 2}).json()["result"]
    assert first["total_pages"] == 2
    assert [verse["ayah"] for verse in first["verses"]] == [1, 2]
    assert [verse["ayah"] for verse in second["verses"]] == [3]
    assert {verse["surah_id"] for verse in first["verses"] + second["verses"]} == {2}


def test_exact_search_filtered_to_one_surah(api_client, tmp_path):
    add_second_surah(tmp_path)
    response = api_client.get("/api/search-v2", params={"q": "shared", "mode": "exact", "mushaf": 1, "surah": 2})
    assert response.status_code == 200
    body = response.json()
    assert body["found"] is True
    result = body["results"][0]
    assert {verse["surah_id"] for verse in result["verses"]} == {2}
    assert result["total_verses"] == 3
    assert result["total_surahs"] == 1


def test_surah_without_matches_finds_nothing(api_client):
    response = api_client.get("/api/search-v2", params={"q": "shared", "mode": "root", "mushaf": 1, "surah": 114})
    assert response.status_code == 200
    assert response.json()["found"] is False


def test_surah_must_be_a_real_surah_number(api_client):
    for surah in (0, 115):
        response = api_client.get("/api/search-v2", params={"q": "shared", "mode": "root", "mushaf": 1, "surah": surah})
        assert response.status_code == 422
