import json
import sqlite3

import scripts.build_db as build_db


def write_json(path, payload):
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_build_db_fails_before_mutating_existing_database(tmp_path, monkeypatch, capsys):
    data_dir = tmp_path / "data"
    mushaf_dir = data_dir / "mushafs"
    mushaf_dir.mkdir(parents=True)

    root_dict_path = data_dir / "word_root_dictionary.json"
    write_json(root_dict_path, {"shared": ["shared-root-a"]})
    morphology_path = data_dir / "quran-morphology.txt"
    morphology_path.write_text("1:1:1:1\tshared\tN\tLEM:shared\n", encoding="utf-8")

    existing_mushaf = mushaf_dir / "existing.json"
    write_json(
        existing_mushaf,
        [
            {
                "id": 1,
                "name": "Fixture Surah",
                "transliteration": "Fixture Surah",
                "type": "meccan",
                "verses": [
                    {
                        "id": 1,
                        "text": "shared",
                        "text_imlaei": "shared",
                        "page": 1,
                        "juz": 1,
                        "line_start": 1,
                        "line_end": 1,
                    }
                ],
            }
        ],
    )

    db_path = data_dir / "quran.db"
    connection = sqlite3.connect(db_path)
    connection.execute("CREATE TABLE sentinel (value TEXT)")
    connection.execute("INSERT INTO sentinel VALUES ('keep-me')")
    connection.commit()
    connection.close()

    monkeypatch.setattr(build_db, "DATA_DIR", str(data_dir))
    monkeypatch.setattr(build_db, "DB_PATH", str(db_path))
    monkeypatch.setattr(build_db, "ROOT_DICT_JSON", str(root_dict_path))
    monkeypatch.setattr(
        build_db,
        "MUSHAFS",
        [
            {"id": 1, "name": "Existing", "file": "mushafs/existing.json", "description": "Existing file"},
            {"id": 2, "name": "Missing", "file": "mushafs/missing.json", "description": "Missing file"},
        ],
    )

    exit_code = build_db.build_db()
    output = capsys.readouterr().out

    assert exit_code == 1
    assert "Input validation failed" in output
    assert "missing.json" in output
    assert "Database Built Successfully!" not in output

    connection = sqlite3.connect(db_path)
    try:
        assert connection.execute("SELECT value FROM sentinel").fetchone()[0] == "keep-me"
    finally:
        connection.close()


# --- Narration spellings in search (yā' barī, seated hamza) ------------------

NARRATION_WORDS = [
    # (as written in a narration, as Ḥafṣ writes it)
    ("فِے", "فِي"),
    ("رَبِّے", "رَبِّي"),
    ("اَ۬لذِے", "ٱلَّذِي"),
    ("يَسْتَهْزِۓ", "يَسۡتَهۡزِئُ"),
    ("شَےْءٖ", "شَيۡءٖ"),
]


def test_search_normalization_folds_narration_letters_like_hafs():
    from src.app.services import quran_service

    for narration, hafs in NARRATION_WORDS:
        expected = build_db.normalize_text_search(hafs)
        # The build and the server normalize alike, for every narration.
        assert build_db.normalize_text_search(narration) == expected
        assert quran_service.normalize_text_search(narration) == expected
    assert "ے" not in build_db.normalize_text_search("فِے وَإِنِّے")
    # Diacritized queries compare the same way (رَبِّي finds رَبِّے).
    assert quran_service.standardize_uthmani("رَبِّے") == quran_service.standardize_uthmani("رَبِّي")
    # Ḥafṣ text is untouched.
    assert build_db.fold_narration_letters("قَآئِمٌ فِي") == "قَآئِمٌ فِي"


def test_search_finds_a_word_in_every_narration(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from src import main

    data_dir = tmp_path / "data"
    (data_dir / "mushafs").mkdir(parents=True)
    write_json(data_dir / "word_root_dictionary.json", {})
    (data_dir / "quran-morphology.txt").write_text("1:1:1:1\tرَبِّ\tN\tROOT:ربب|LEM:رَبّ\n", encoding="utf-8")

    def surah(text):
        return [
            {
                "id": 1,
                "name": "Fixture",
                "transliteration": "Fixture",
                "type": "meccan",
                "verses": [{"id": 1, "text": text, "text_imlaei": text, "page": 1, "juz": 1, "line_start": 1, "line_end": 1}],
            }
        ]

    write_json(data_dir / "mushafs" / "hafs.json", surah("قُلۡ رَبِّي فِي ٱلَّذِي"))
    write_json(data_dir / "mushafs" / "warsh.json", surah("قُلْ رَبِّے فِے اَ۬لذِے"))
    db_path = data_dir / "quran.db"
    monkeypatch.setattr(build_db, "DATA_DIR", str(data_dir))
    monkeypatch.setattr(build_db, "DB_PATH", str(db_path))
    monkeypatch.setattr(build_db, "ROOT_DICT_JSON", str(data_dir / "word_root_dictionary.json"))
    monkeypatch.setattr(build_db, "MORPHOLOGY_PATH", str(data_dir / "quran-morphology.txt"))
    monkeypatch.setattr(
        build_db,
        "MUSHAFS",
        [
            {"id": 2, "name": "Hafs", "file": "mushafs/hafs.json", "description": ""},
            {"id": 3, "name": "Warsh", "file": "mushafs/warsh.json", "description": ""},
        ],
    )
    assert build_db.build_db() == 0

    original_db_path = main.get_db_path()
    main.close_db_connection()
    main.set_db_path(str(db_path))
    try:
        with TestClient(main.app) as client:
            for query, position in (("ربي", 2), ("رَبِّي", 2), ("في", 3), ("الذي", 4)):
                for mushaf in (2, 3):
                    response = client.get("/api/search", params={"q": query, "mode": "exact", "mushaf": mushaf})
                    assert response.status_code == 200, (query, mushaf)
                    results = response.json()["results"]
                    assert results and results[0]["total_occurrences"] == 1, (query, mushaf)
                    verse = results[0]["verses"][0]
                    # The highlight lands on the word, as written in that narration.
                    assert verse["highlights"] == [position], (query, mushaf, verse)
    finally:
        main.close_db_connection()
        main.set_db_path(original_db_path)
