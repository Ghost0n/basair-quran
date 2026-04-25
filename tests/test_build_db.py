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
