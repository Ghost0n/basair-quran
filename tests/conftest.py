import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src import main


def create_test_db(db_path: Path):
    """Create a small SQLite fixture database for API tests."""
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
    cursor.execute("INSERT INTO surahs VALUES (1, 'Fixture Surah', 'Fixture Surah', 'meccan')")
    cursor.executemany(
        "INSERT INTO roots VALUES (?, ?, ?)",
        [
            (101, "shared-root-a", "shared-root-a"),
            (102, "shared-root-b", "shared-root-b"),
        ],
    )

    ayah_id = 1
    global_index = 0
    for number_in_surah in range(1, 13):
        text = f"shared verse {number_in_surah}"
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
                1 if number_in_surah <= 10 else 2,
                1,
                1,
                1,
                global_index,
            ),
        )
        cursor.execute(
            """
            INSERT INTO word_occurrences (
                root_id, ayah_id, word_position, word_text, word_simple
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (101, ayah_id, 1, "shared", "shared"),
        )
        ayah_id += 1
        global_index += 1

    for number_in_surah in range(13, 15):
        text = f"shared alt verse {number_in_surah}"
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
                2,
                1,
                1,
                1,
                global_index,
            ),
        )
        cursor.execute(
            """
            INSERT INTO word_occurrences (
                root_id, ayah_id, word_position, word_text, word_simple
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (102, ayah_id, 1, "shared", "shared"),
        )
        ayah_id += 1
        global_index += 1

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
            15,
            "shadow verse",
            "shadow verse",
            "shadow verse",
            2,
            1,
            1,
            1,
            global_index,
        ),
    )
    cursor.execute(
        """
        INSERT INTO word_occurrences (
            root_id, ayah_id, word_position, word_text, word_simple
        ) VALUES (?, ?, ?, ?, ?)
        """,
        (None, ayah_id, 1, "shadow", "shadow"),
    )

    connection.commit()
    connection.close()


@pytest.fixture()
def api_client(tmp_path):
    """Provide a TestClient backed by a temporary SQLite DB."""
    db_path = tmp_path / "fixture.db"
    create_test_db(db_path)

    original_db_path = main.get_db_path()
    main.close_db_connection()
    main.set_db_path(str(db_path))

    try:
        with TestClient(main.app) as client:
            yield client
    finally:
        main.close_db_connection()
        main.set_db_path(original_db_path)
