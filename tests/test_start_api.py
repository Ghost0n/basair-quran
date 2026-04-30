import sqlite3

from src import main
from scripts import start_api


def create_db_with_tables(path, table_names):
    connection = sqlite3.connect(path)
    try:
        cursor = connection.cursor()
        for table_name in table_names:
            cursor.execute(f"CREATE TABLE {table_name} (id INTEGER)")
        connection.commit()
    finally:
        connection.close()


def test_database_has_required_tables_detects_missing_schema(tmp_path):
    db_path = tmp_path / "fixture.db"
    create_db_with_tables(db_path, ["ayahs"])

    assert start_api.database_has_required_tables(str(db_path)) is False


def test_database_has_required_tables_detects_ready_schema(tmp_path):
    db_path = tmp_path / "fixture.db"
    create_db_with_tables(db_path, ["ayah_words", "morphology_search_variants"])

    assert start_api.database_has_required_tables(str(db_path)) is True


def test_ensure_database_ready_rebuilds_when_auto_mode_detects_missing_tables(tmp_path, monkeypatch):
    db_path = tmp_path / "fixture.db"
    create_db_with_tables(db_path, ["ayahs"])

    original_db_path = main.get_db_path()
    main.set_db_path(str(db_path))
    monkeypatch.setenv("QBASAIR_BUILD_DB_ON_START", "auto")

    def fake_build_db():
        connection = sqlite3.connect(db_path)
        try:
            cursor = connection.cursor()
            cursor.execute("CREATE TABLE ayah_words (id INTEGER)")
            cursor.execute("CREATE TABLE morphology_search_variants (id INTEGER)")
            connection.commit()
        finally:
            connection.close()
        return 0

    monkeypatch.setattr(start_api.build_db, "build_db", fake_build_db)

    try:
        start_api.ensure_database_ready()
        assert start_api.database_has_required_tables(str(db_path)) is True
    finally:
        main.set_db_path(original_db_path)


def test_get_build_db_on_start_mode_parses_common_values(monkeypatch):
    monkeypatch.setenv("QBASAIR_BUILD_DB_ON_START", "0")
    assert start_api.get_build_db_on_start_mode() == "never"

    monkeypatch.setenv("QBASAIR_BUILD_DB_ON_START", "1")
    assert start_api.get_build_db_on_start_mode() == "always"

    monkeypatch.setenv("QBASAIR_BUILD_DB_ON_START", "auto")
    assert start_api.get_build_db_on_start_mode() == "auto"
