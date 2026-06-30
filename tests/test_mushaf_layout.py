"""Tests for the authentic Madani (QCF) page-layout endpoint + ingest alignment."""

import sqlite3

import pytest
from fastapi.testclient import TestClient

from src import main
from scripts.build_mushaf_layout import align_layout_to_db, normalize_word
from tests.conftest import create_test_db


# ---- Alignment integrity (the word_position parity contract) ----

def test_align_equal_counts_is_straight_one_to_one():
    positions, err = align_layout_to_db(["a", "b", "c"], [(1, "a"), (2, "b"), (3, "c")])
    assert err is None
    assert positions == [1, 2, 3]


def test_align_disconnected_word_maps_two_glyphs_to_one_position():
    # Printed mushaf splits لَّوْ + مَا; ayah_words counts the joined لَّوۡمَا as one.
    positions, err = align_layout_to_db(
        ["لَّوْ", "مَا", "تَأْتِينَا"],
        [(1, "لَّوۡمَا"), (2, "تَأۡتِينَا")],
    )
    assert err is None
    assert positions == [1, 1, 2]


def test_align_joined_word_maps_one_glyph_to_first_position():
    # Layout writes بَعْدَ مَا as one word; ayah_words splits بَعۡدَ + مَا.
    positions, err = align_layout_to_db(
        ["بَعْدَ مَا", "سَمِعَهُۥ"],
        [(3, "بَعۡدَ"), (4, "مَا"), (5, "سَمِعَهُۥ")],
    )
    assert err is None
    assert positions == [3, 5]  # second position (4) is absorbed into the single glyph


def test_normalize_word_strips_marks_digits_and_folds_letters():
    assert normalize_word("لَّوْ") + normalize_word("مَا") == normalize_word("لَّوۡمَا")
    assert normalize_word("ٱلصَّـٰدِقِينَ ٧") == normalize_word("ٱلصَّٰدِقِينَ")


# ---- Endpoint: fallback when authentic layout is unavailable ----

def test_layout_falls_back_for_non_hafs_and_when_tables_absent(api_client):
    # mushaf 1 is not Hafs -> fallback.
    non_hafs = api_client.get("/api/mushaf-page-layout", params={"mushaf": 1, "page": 1}).json()
    assert non_hafs["found"] is False and non_hafs["fallback"] == "reader"
    assert non_hafs["lines"] == []

    # Hafs id but the fixture DB has no layout tables -> graceful fallback, never 500.
    no_tables = api_client.get("/api/mushaf-page-layout", params={"mushaf": 2, "page": 1}).json()
    assert no_tables["found"] is False and no_tables["fallback"] == "reader"


def test_layout_endpoint_in_openapi(api_client):
    paths = api_client.get("/openapi.json").json()["paths"]
    assert "/api/mushaf-page-layout" in paths


# ---- Endpoint: the "found" path against a hand-built layout fixture ----

@pytest.fixture()
def layout_client(tmp_path):
    db_path = tmp_path / "layout.db"
    create_test_db(db_path)
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("INSERT INTO mushafs VALUES (2, 'Hafs', 'Hafs fixture')")
    cur.executescript(
        """
        CREATE TABLE mushaf_layout_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT, layout_id TEXT, mushaf_id INTEGER,
            page INTEGER, line_number INTEGER, line_type TEXT, is_centered INTEGER,
            surah_number INTEGER, surah_name_text TEXT, line_glyph_v2 TEXT,
            line_glyph_v1 TEXT, font_family TEXT);
        CREATE TABLE mushaf_layout_words (
            id INTEGER PRIMARY KEY AUTOINCREMENT, line_id INTEGER, layout_id TEXT,
            mushaf_id INTEGER, page INTEGER, line_number INTEGER, position_in_line INTEGER,
            surah_number INTEGER, ayah_number INTEGER, word_position INTEGER, ayah_id INTEGER,
            glyph_v2 TEXT, glyph_v1 TEXT, word_text TEXT);
        CREATE TABLE mushaf_layout_meta (
            layout_id TEXT PRIMARY KEY, mushaf_id INTEGER, page_count INTEGER,
            source TEXT, source_ref TEXT);
        """
    )
    cur.execute(
        "INSERT INTO mushaf_layout_meta VALUES ('qpc-hafs-v2', 2, 2, 'test', 'testsha')"
    )

    def add_line(page, line_number, line_type, is_centered=0, surah_number=None,
                 surah_name_text=None, line_glyph_v2=None):
        cur.execute(
            "INSERT INTO mushaf_layout_lines "
            "(layout_id, mushaf_id, page, line_number, line_type, is_centered, surah_number, "
            " surah_name_text, line_glyph_v2, line_glyph_v1, font_family) "
            "VALUES ('qpc-hafs-v2', 2, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (page, line_number, line_type, is_centered, surah_number, surah_name_text,
             line_glyph_v2, line_glyph_v2, f"qpc-p{page}"),
        )
        return cur.lastrowid

    def add_word(line_id, page, line_number, pos, surah, ayah, wp, ayah_id, glyph, text):
        cur.execute(
            "INSERT INTO mushaf_layout_words "
            "(line_id, layout_id, mushaf_id, page, line_number, position_in_line, surah_number, "
            " ayah_number, word_position, ayah_id, glyph_v2, glyph_v1, word_text) "
            "VALUES (?, 'qpc-hafs-v2', 2, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (line_id, page, line_number, pos, surah, ayah, wp, ayah_id, glyph, glyph, text),
        )

    # Page 1: surah-name header + basmala line + one ayah line (2 words).
    add_line(1, 1, "surah_name", is_centered=1, surah_number=1, surah_name_text="Fixture Surah")
    add_line(1, 2, "basmalah", is_centered=1, line_glyph_v2="BSML")
    ayah_line = add_line(1, 3, "ayah")
    add_word(ayah_line, 1, 3, 1, 1, 1, 1, 1, "G1", "word-one")
    add_word(ayah_line, 1, 3, 2, 1, 1, 2, 1, "G2", "word-two")
    # Page 2: a continuation ayah line (no header) -> proves banner isn't repeated.
    cont = add_line(2, 1, "ayah")
    add_word(cont, 2, 1, 1, 1, 2, 1, 2, "G3", "word-three")
    conn.commit()
    conn.close()

    original = main.get_db_path()
    main.close_db_connection()
    main.set_db_path(str(db_path))
    try:
        with TestClient(main.app) as client:
            yield client
    finally:
        main.close_db_connection()
        main.set_db_path(original)


def test_layout_page_returns_lines_glyphs_and_bounds(layout_client):
    response = layout_client.get("/api/mushaf-page-layout", params={"mushaf": 2, "page": 1})
    assert response.status_code == 200
    body = response.json()
    assert body["found"] is True
    assert body["page"] == 1
    assert body["layout_id"] == "qpc-hafs-v2"
    assert body["font_base_path"] == "/fonts/qpc-hafs-v1"
    assert body["has_previous"] is False and body["has_next"] is True

    types = [line["line_type"] for line in body["lines"]]
    assert types == ["surah_name", "basmalah", "ayah"]

    header = body["lines"][0]
    assert header["is_centered"] is True and header["surah_number"] == 1
    basmala = body["lines"][1]
    assert basmala["glyph"] == "BSML"
    ayah_line = body["lines"][2]
    assert [w["word_key"] for w in ayah_line["words"]] == ["1:1:1", "1:1:2"]
    assert ayah_line["words"][0]["glyph"] == "G1"
    assert ayah_line["words"][0]["ayah_id"] == 1


def test_layout_selection_marks_matching_ayah(layout_client):
    body = layout_client.get(
        "/api/mushaf-page-layout", params={"mushaf": 2, "page": 1, "selected_ayah_id": 1}
    ).json()
    selected = [w["is_selected"] for line in body["lines"] for w in line["words"]]
    assert selected and all(selected)  # every word on page 1 belongs to ayah_id 1


def test_layout_continuation_page_has_no_header(layout_client):
    body = layout_client.get("/api/mushaf-page-layout", params={"mushaf": 2, "page": 2}).json()
    assert body["found"] is True
    assert [line["line_type"] for line in body["lines"]] == ["ayah"]
    assert body["has_next"] is False
