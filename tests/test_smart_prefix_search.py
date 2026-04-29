import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src import main


def insert_ayah(cursor, ayah_id, number_in_surah, text, words, global_index):
    """Insert one ayah and its tokenized word occurrences into the fixture DB."""
    cursor.execute(
        """
        INSERT INTO ayahs (
            id, mushaf_id, surah_id, number_in_surah, text_uthmani, text_simple,
            text_imlaei, page, juz, line_start, line_end, global_index
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            ayah_id,
            1,
            1,
            number_in_surah,
            text,
            text,
            text,
            1,
            1,
            1,
            1,
            global_index,
        ),
    )

    for word_position, (root_id, word_text, word_simple) in enumerate(words, start=1):
        cursor.execute(
            """
            INSERT INTO word_occurrences (
                root_id, ayah_id, word_position, word_text, word_simple
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (root_id, ayah_id, word_position, word_text, word_simple),
        )


def create_arabic_test_db(db_path: Path):
    """Create a small Arabic fixture database for smart word and phrase tests."""
    connection = sqlite3.connect(db_path)
    cursor = connection.cursor()
    cursor.executescript(
        """
        CREATE TABLE mushafs (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT
        );

        CREATE TABLE surahs (
            id INTEGER PRIMARY KEY,
            name_arabic TEXT,
            name_english TEXT,
            type TEXT
        );

        CREATE TABLE ayahs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mushaf_id INTEGER,
            surah_id INTEGER,
            number_in_surah INTEGER,
            text_uthmani TEXT,
            text_simple TEXT,
            text_imlaei TEXT,
            page INTEGER,
            juz INTEGER,
            line_start INTEGER,
            line_end INTEGER,
            global_index INTEGER
        );

        CREATE TABLE roots (
            id INTEGER PRIMARY KEY,
            root_text TEXT UNIQUE,
            root_simple TEXT
        );

        CREATE TABLE word_occurrences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            root_id INTEGER,
            ayah_id INTEGER,
            word_position INTEGER,
            word_text TEXT,
            word_simple TEXT
        );
        """
    )

    cursor.execute("INSERT INTO mushafs VALUES (1, 'Fixture Mushaf', 'Fixture description')")
    cursor.execute("INSERT INTO surahs VALUES (1, 'البقرة', 'Al-Baqarah', 'medinan')")
    cursor.execute("INSERT INTO roots VALUES (201, 'يسر', 'يسر')")

    insert_ayah(
        cursor,
        ayah_id=1,
        number_in_surah=219,
        text="وَٱلْمَيْسِرِ رِجْسٌ",
        words=[
            (201, "وَٱلْمَيْسِرِ", "والميسر"),
            (None, "رِجْسٌ", "رجس"),
        ],
        global_index=0,
    )
    insert_ayah(
        cursor,
        ayah_id=2,
        number_in_surah=220,
        text="فالحق ظاهر",
        words=[
            (None, "فالحق", "فالحق"),
            (None, "ظاهر", "ظاهر"),
        ],
        global_index=1,
    )
    insert_ayah(
        cursor,
        ayah_id=3,
        number_in_surah=221,
        text="الصرط المستقيم نور",
        words=[
            (None, "الصرط", "الصرط"),
            (None, "المستقيم", "المستقيم"),
            (None, "نور", "نور"),
        ],
        global_index=2,
    )
    insert_ayah(
        cursor,
        ayah_id=4,
        number_in_surah=222,
        text="الصرط نور المستقيم",
        words=[
            (None, "الصرط", "الصرط"),
            (None, "نور", "نور"),
            (None, "المستقيم", "المستقيم"),
        ],
        global_index=3,
    )
    insert_ayah(
        cursor,
        ayah_id=5,
        number_in_surah=223,
        text="الصرط",
        words=[(None, "الصرط", "الصرط")],
        global_index=4,
    )
    insert_ayah(
        cursor,
        ayah_id=6,
        number_in_surah=224,
        text="المستقيم",
        words=[(None, "المستقيم", "المستقيم")],
        global_index=5,
    )
    insert_ayah(
        cursor,
        ayah_id=7,
        number_in_surah=225,
        text="صرطا مستقيما",
        words=[
            (None, "صرطا", "صرطا"),
            (None, "مستقيما", "مستقيما"),
        ],
        global_index=6,
    )

    connection.commit()
    connection.close()


def create_arabic_morphology_file(path: Path):
    """Create a tiny morphology fixture that models detachable prefixes and articles."""
    path.write_text(
        "\n".join(
            [
                "1:219:1:1\tوَ\tP\tCONJ|PREF|LEM:و",
                "1:219:1:2\tٱلْ\tP\tDET|PREF|LEM:ال",
                "1:219:1:3\tمَيْسِرُ\tN\tROOT:يسر|LEM:مَيْسِرُ|M|GEN",
                "1:219:2:1\tرِجْسٌ\tN\tLEM:رِجْسٌ|M|NOM",
                "1:220:1:1\tف\tP\tCONJ|PREF|LEM:ف",
                "1:220:1:2\tال\tP\tDET|PREF|LEM:ال",
                "1:220:1:3\tحق\tN\tROOT:حقق|LEM:حق|M|NOM",
                "1:220:2:1\tظاهر\tA\tLEM:ظاهر|ADJ",
                "1:221:1:1\tال\tP\tDET|PREF|LEM:ال",
                "1:221:1:2\tصرط\tN\tLEM:صراط|M|NOM",
                "1:221:2:1\tال\tP\tDET|PREF|LEM:ال",
                "1:221:2:2\tمستقيم\tA\tLEM:مستقيم|ADJ",
                "1:221:3:1\tنور\tN\tLEM:نور|M|NOM",
                "1:222:1:1\tال\tP\tDET|PREF|LEM:ال",
                "1:222:1:2\tصرط\tN\tLEM:صراط|M|NOM",
                "1:222:2:1\tنور\tN\tLEM:نور|M|NOM",
                "1:222:3:1\tال\tP\tDET|PREF|LEM:ال",
                "1:222:3:2\tمستقيم\tA\tLEM:مستقيم|ADJ",
                "1:223:1:1\tال\tP\tDET|PREF|LEM:ال",
                "1:223:1:2\tصرط\tN\tLEM:صراط|M|NOM",
                "1:224:1:1\tال\tP\tDET|PREF|LEM:ال",
                "1:224:1:2\tمستقيم\tA\tLEM:مستقيم|ADJ",
                "1:225:1:1\tصرطا\tN\tLEM:صراط|M|ACC",
                "1:225:2:1\tمستقيما\tA\tLEM:مستقيم|ADJ|ACC",
            ]
        ),
        encoding="utf-8",
    )


@pytest.fixture()
def arabic_api_client(tmp_path):
    """Provide a TestClient with Arabic fixture data and morphology."""
    db_path = tmp_path / "arabic_fixture.db"
    morphology_path = tmp_path / "arabic_morphology.txt"
    create_arabic_test_db(db_path)
    create_arabic_morphology_file(morphology_path)

    original_db_path = main.get_db_path()
    original_morphology_path = main.get_morphology_path()
    main.close_db_connection()
    main.reset_morphology_search_index()
    main.set_db_path(str(db_path))
    main.set_morphology_path(str(morphology_path))

    try:
        with TestClient(main.app) as client:
            yield client
    finally:
        main.close_db_connection()
        main.reset_morphology_search_index()
        main.set_db_path(original_db_path)
        main.set_morphology_path(original_morphology_path)


def test_exact_search_matches_detached_prefix_forms(arabic_api_client):
    response = arabic_api_client.get(
        "/api/search-v2",
        params={"q": "الميسر", "mode": "exact", "mushaf": 1, "page_size": 10},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["found"] is True
    assert body["results"][0]["match_type"] == "word"
    assert body["results"][0]["total_verses"] == 1
    assert body["results"][0]["verses"][0]["text"] == "وَٱلْمَيْسِرِ رِجْسٌ"
    assert body["results"][0]["verses"][0]["highlights"] == [1]


def test_root_search_uses_smart_surface_resolution(arabic_api_client):
    response = arabic_api_client.get(
        "/api/search-v2",
        params={"q": "الميسر", "mode": "root", "mushaf": 1, "page_size": 10},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["found"] is True
    assert body["results"][0]["root"] == "يسر"
    assert body["results"][0]["verses"][0]["text"] == "وَٱلْمَيْسِرِ رِجْسٌ"


def test_exact_search_matches_diacritized_suggestion(arabic_api_client):
    response = arabic_api_client.get(
        "/api/search-v2",
        params={"q": "ٱلْمَيْسِرِ", "mode": "exact", "mushaf": 1, "page_size": 10},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["found"] is True
    assert body["results"][0]["verses"][0]["text"] == "وَٱلْمَيْسِرِ رِجْسٌ"


def test_diacritized_exact_search_rejects_different_final_vowel(arabic_api_client):
    response = arabic_api_client.get(
        "/api/search-v2",
        params={"q": "ٱلْمَيْسِرُ", "mode": "exact", "mushaf": 1, "page_size": 10},
    )
    assert response.status_code == 200
    assert response.json()["found"] is False


def test_uthmani_match_allows_only_missing_initial_wasl_vowel():
    query = main.standardize_uthmani("ٱلرَّحِيمُ")
    assert main.uthmani_matches_query(query, "اُ۬لرَّحِيمُۖ") is True
    assert main.uthmani_matches_query(query, "اِ۬لرَّحِيمِ") is False
    assert main.uthmani_matches_query(main.standardize_uthmani("اُ۬لرَّحِيمُ"), "اَ۬لرَّحِيمُ") is False


def test_shadda_alone_is_not_treated_as_diacritics():
    assert main.has_query_diacritics("الرّحم") is False
    assert main.has_query_diacritics("الرَّحم") is True


def test_plain_display_keeps_shadda_and_drops_dagger_alif():
    assert main.plain_arabic_display_text("صَلَّىٰ") == "صلّى"


def test_exact_search_does_not_strip_the_article_itself(arabic_api_client):
    response = arabic_api_client.get(
        "/api/search-v2",
        params={"q": "ميسر", "mode": "exact", "mushaf": 1, "page_size": 10},
    )
    assert response.status_code == 200
    assert response.json()["found"] is False


def test_suggestions_include_smart_prefixed_variants(arabic_api_client):
    response = arabic_api_client.get(
        "/api/suggest",
        params={"q": "المي", "mode": "exact", "mushaf": 1},
    )
    assert response.status_code == 200
    items = response.json()
    assert any(item["text"] == "الميسر" for item in items)
    assert all(not main.has_query_diacritics(item["text"]) for item in items)
    assert all(item["text"] != "وَٱلْمَيْسِرِ" for item in items)

    vocalized_response = arabic_api_client.get(
        "/api/suggest",
        params={"q": "المي", "mode": "exact", "mushaf": 1, "with_chakl": True},
    )
    assert vocalized_response.status_code == 200
    vocalized_items = vocalized_response.json()
    assert any(item["text"] == "ٱلْمَيْسِرِ" for item in vocalized_items)
    assert all(item["text"] != "ٱلْمَيْسِرُ" for item in vocalized_items)
    assert all(item["text"] != "وَٱلْمَيْسِرِ" for item in vocalized_items)

    negative_response = arabic_api_client.get(
        "/api/suggest",
        params={"q": "ميس", "mode": "exact", "mushaf": 1},
    )
    assert negative_response.status_code == 200
    assert all(item["text"] != "الميسر" for item in negative_response.json())


def test_default_suggestions_are_plain_and_chakl_is_explicit(arabic_api_client):
    response = arabic_api_client.get(
        "/api/suggest",
        params={"q": "المي", "mode": "exact", "mushaf": 1},
    )
    assert response.status_code == 200
    items = response.json()
    assert any(item["text"] == "الميسر" for item in items)
    assert all(not main.has_query_diacritics(item["text"]) for item in items)

    vocalized_response = arabic_api_client.get(
        "/api/suggest",
        params={"q": "المي", "mode": "exact", "mushaf": 1, "with_chakl": True},
    )
    assert vocalized_response.status_code == 200
    vocalized_items = vocalized_response.json()
    assert any(item["text"] == "ٱلْمَيْسِرِ" for item in vocalized_items)
    assert all(item["text"] != "وَٱلْمَيْسِرِ" for item in vocalized_items)


def test_latin_exact_suggestions_resolve_real_mushaf_words(arabic_api_client):
    response = arabic_api_client.get(
        "/api/suggest",
        params={"q": "almysr", "mode": "exact", "mushaf": 1},
    )
    assert response.status_code == 200
    items = response.json()
    assert items
    assert any(item["text"] == "\u0627\u0644\u0645\u064a\u0633\u0631" for item in items)
    assert {item["type"] for item in items} == {"word"}


def test_latin_root_suggestions_keep_root_word_mix(arabic_api_client):
    response = arabic_api_client.get(
        "/api/suggest",
        params={"q": "ysr", "mode": "root", "mushaf": 1},
    )
    assert response.status_code == 200
    items = response.json()
    assert items
    assert any(item["type"] == "root" and item["text"] == "\u064a\u0633\u0631" for item in items)
    assert any(item["type"] == "word" for item in items)


def test_phrase_suggestions_are_real_selected_mushaf_phrases(arabic_api_client):
    response = arabic_api_client.get(
        "/api/suggest",
        params={"q": "\u0635\u0631\u0627\u0637 \u0645\u0633", "mode": "exact", "mushaf": 1},
    )
    assert response.status_code == 200
    items = response.json()
    assert items
    assert "\u0627\u0644\u0635\u0631\u0637 \u0627\u0644\u0645\u0633\u062a\u0642\u064a\u0645" in [
        item["text"] for item in items
    ]

    for item in items:
        search_response = arabic_api_client.get(
            "/api/search-v2",
            params={"q": item["text"], "mode": "exact", "mushaf": 1, "page_size": 10},
        )
        assert search_response.status_code == 200
        assert search_response.json()["found"] is True


def test_phrase_suggestions_display_aligned_text_without_extra_clitic(arabic_api_client):
    response = arabic_api_client.get(
        "/api/suggest",
        params={"q": "\u0627\u0644\u062d\u0642 \u0638", "mode": "exact", "mushaf": 1, "with_chakl": True},
    )
    assert response.status_code == 200
    texts = [item["text"] for item in response.json()]
    assert "\u0627\u0644\u062d\u0642 \u0638\u0627\u0647\u0631" in texts
    assert "\u0641\u0627\u0644\u062d\u0642 \u0638\u0627\u0647\u0631" not in texts


def test_phrase_search_matches_article_aligned_phrase(arabic_api_client):
    response = arabic_api_client.get(
        "/api/search-v2",
        params={"q": "صراط مستقيم", "mode": "exact", "mushaf": 1, "page_size": 10},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["found"] is True
    result = body["results"][0]
    assert result["match_type"] == "phrase"
    assert result["total_occurrences"] == 2
    assert result["total_verses"] == 2
    assert result["verses"][0]["text"] == "الصرط المستقيم نور"
    assert result["verses"][0]["highlights"] == [1, 2]


def test_phrase_search_matches_prefix_aligned_phrase(arabic_api_client):
    response = arabic_api_client.get(
        "/api/search-v2",
        params={"q": "الحق ظاهر", "mode": "exact", "mushaf": 1, "page_size": 10},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["found"] is True
    result = body["results"][0]
    assert result["match_type"] == "phrase"
    assert result["verses"][0]["text"] == "فالحق ظاهر"
    assert result["verses"][0]["highlights"] == [1, 2]


def test_phrase_search_stays_contiguous_inside_one_ayah(arabic_api_client):
    response = arabic_api_client.get(
        "/api/search",
        params={"q": "صراط مستقيم", "mode": "exact", "mushaf": 1},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["found"] is True
    texts = {verse["text"] for verse in body["results"][0]["verses"]}
    assert "الصرط المستقيم نور" in texts
    assert "الصرط نور المستقيم" not in texts


def test_phrase_search_returns_did_you_mean_for_close_phrase(arabic_api_client):
    response = arabic_api_client.get(
        "/api/search-v2",
        params={"q": "صراط مستقم", "mode": "exact", "mushaf": 1, "page_size": 10},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["found"] is False
    assert body["did_you_mean"]["text"] in {"الصرط المستقيم", "صرطا مستقيما"}
    assert body["did_you_mean"]["confidence"] >= 0.88
    assert main.has_query_diacritics(body["did_you_mean"]["text"]) is False


def test_legacy_phrase_search_returns_same_did_you_mean(arabic_api_client):
    response = arabic_api_client.get(
        "/api/search",
        params={"q": "صراط مستقم", "mode": "exact", "mushaf": 1},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["found"] is False
    assert body["did_you_mean"]["text"] in {"الصرط المستقيم", "صرطا مستقيما"}


def test_legacy_phrase_did_you_mean_is_plain_text(arabic_api_client):
    response = arabic_api_client.get(
        "/api/search",
        params={"q": "\u0635\u0631\u0627\u0637 \u0645\u0633\u062a\u0642\u0645", "mode": "exact", "mushaf": 1},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["found"] is False
    assert main.has_query_diacritics(body["did_you_mean"]["text"]) is False


def test_phrase_search_skips_weak_suggestions(arabic_api_client):
    response = arabic_api_client.get(
        "/api/search-v2",
        params={"q": "بحر عظيم", "mode": "exact", "mushaf": 1, "page_size": 10},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["found"] is False
    assert "did_you_mean" not in body


def test_single_word_search_returns_plain_did_you_mean_for_close_word(arabic_api_client):
    response = arabic_api_client.get(
        "/api/search-v2",
        params={"q": "\u0627\u0644\u0645\u0633\u062a\u0642\u0645", "mode": "exact", "mushaf": 1, "page_size": 10},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["found"] is False
    assert body["did_you_mean"]["text"] == "\u0627\u0644\u0645\u0633\u062a\u0642\u064a\u0645"
    assert main.has_query_diacritics(body["did_you_mean"]["text"]) is False


def test_single_word_search_skips_weak_did_you_mean(arabic_api_client):
    response = arabic_api_client.get(
        "/api/search-v2",
        params={"q": "\u0628\u062d\u0631", "mode": "exact", "mushaf": 1, "page_size": 10},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["found"] is False
    assert "did_you_mean" not in body
