def test_notebook_item_lifecycle(api_client):
    created = api_client.post(
        "/api/notebook",
        json={
            "ayah_id": 11,
            "mushaf_id": 1,
            "surah_id": 1,
            "surah": "Fixture Surah",
            "ayah": 11,
            "text": "shared verse 11",
            "collection": "نور",
        },
    )
    assert created.status_code == 200
    item = created.json()
    assert item["ayah_id"] == 11
    assert item["collection"] == "نور"
    assert item["id"] > 0

    listing = api_client.get("/api/notebook")
    assert listing.status_code == 200
    assert [row["id"] for row in listing.json()] == [item["id"]]

    deleted = api_client.delete(f"/api/notebook/{item['id']}")
    assert deleted.status_code == 200
    assert deleted.json() == {"deleted": True}

    assert api_client.get("/api/notebook").json() == []


def test_research_session_persists_and_reads_back(api_client):
    saved = api_client.post(
        "/api/sessions",
        json={
            "id": "studio-test-1",
            "title": "دلالة البصائر",
            "mode": "strict",
            "messages": [
                {"role": "user", "content": "ما معنى البصائر؟"},
                {"role": "assistant", "content": "البصائر جمع بصيرة."},
            ],
        },
    )
    assert saved.status_code == 200
    body = saved.json()
    assert body["message_count"] == 2
    assert body["mode"] == "strict"

    summaries = api_client.get("/api/sessions")
    assert summaries.status_code == 200
    assert [row["id"] for row in summaries.json()] == ["studio-test-1"]

    detail = api_client.get("/api/sessions/studio-test-1")
    assert detail.status_code == 200
    assert len(detail.json()["messages"]) == 2

    missing = api_client.get("/api/sessions/does-not-exist")
    assert missing.status_code == 404

    deleted = api_client.delete("/api/sessions/studio-test-1")
    assert deleted.status_code == 200
    assert deleted.json() == {"deleted": True}
    assert api_client.get("/api/sessions").json() == []


def test_followed_roots_dedupe_and_delete(api_client):
    first = api_client.post("/api/roots", json={"root_text": "ب ص ر", "occurrences": 148})
    assert first.status_code == 200
    root_id = first.json()["id"]

    duplicate = api_client.post("/api/roots", json={"root_text": "ب ص ر", "occurrences": 148})
    assert duplicate.status_code == 200
    assert duplicate.json()["id"] == root_id

    listing = api_client.get("/api/roots")
    assert listing.status_code == 200
    assert len(listing.json()) == 1

    deleted = api_client.delete(f"/api/roots/{root_id}")
    assert deleted.status_code == 200
    assert deleted.json() == {"deleted": True}
    assert api_client.get("/api/roots").json() == []


def test_user_preferences_defaults_and_patch(api_client):
    defaults = api_client.get("/api/user/preferences")
    assert defaults.status_code == 200
    body = defaults.json()
    assert body["numerals"] == "auto"  # the interface language's own digits
    assert body["mushaf_edition"] == "madani-hafs"  # the Madani mushaf is the default edition
    assert body["riwayah"] == 2  # Ḥafṣ is the default riwāyah
    assert body["mushaf_render"] == "authentic"
    assert body["reader_layout"] == "auto"
    assert body["research"]["default_mode"] == "strict"

    patched = api_client.patch(
        "/api/user/preferences",
        json={
            "numerals": "latin",
            "font_size": 32,
            "reader_layout": "scroll",
            "research": {"depth": "deep"},
        },
    )
    assert patched.status_code == 200
    updated = patched.json()
    assert updated["numerals"] == "latin"
    assert updated["font_size"] == 32
    assert updated["reader_layout"] == "scroll"
    assert updated["research"]["depth"] == "deep"
    assert updated["research"]["default_mode"] == "strict"

    # Persisted across requests.
    reread = api_client.get("/api/user/preferences")
    assert reread.json()["numerals"] == "latin"
    assert reread.json()["reader_layout"] == "scroll"


def _store_raw_preferences(data: dict) -> None:
    import json
    import time

    from src.app.services import app_data_service

    with app_data_service._connect() as connection:
        connection.execute(
            "INSERT OR REPLACE INTO user_preferences (user_id, data, updated_at) VALUES (?, ?, ?)",
            (app_data_service.DEFAULT_USER_ID, json.dumps(data), int(time.time())),
        )
        connection.commit()


def test_user_preferences_old_default_digits_follow_the_language(api_client):
    # Before "auto", every save wrote the old default «arabic-indic» whether or
    # not the reader chose it: it now reads as the language's own digits.
    _store_raw_preferences({"numerals": "arabic-indic", "ui_language": "en", "font_size": 30})
    body = api_client.get("/api/user/preferences").json()
    assert body["numerals"] == "auto"
    assert body["font_size"] == 30
    assert "numerals_rev" not in body

    # Once saved again, a later explicit «arabic-indic» is kept as chosen.
    api_client.patch("/api/user/preferences", json={"font_size": 31})
    assert api_client.get("/api/user/preferences").json()["numerals"] == "auto"
    api_client.patch("/api/user/preferences", json={"numerals": "arabic-indic"})
    assert api_client.get("/api/user/preferences").json()["numerals"] == "arabic-indic"


def test_user_preferences_old_explicit_digits_are_kept(api_client):
    _store_raw_preferences({"numerals": "persian", "ui_language": "en"})
    assert api_client.get("/api/user/preferences").json()["numerals"] == "persian"


def test_user_preferences_saved_pages(api_client):
    # Defaults to an empty list.
    defaults = api_client.get("/api/user/preferences").json()
    assert defaults["saved_pages"] == []

    # Bookmark a page (wholesale-replace semantics — the client sends the array).
    patched = api_client.patch(
        "/api/user/preferences",
        json={
            "saved_pages": [
                {"page": 50, "mushaf_id": 1, "surah": "آل عمران", "surah_id": 3, "saved_at": 1700000000}
            ]
        },
    )
    assert patched.status_code == 200
    saved = patched.json()["saved_pages"]
    assert len(saved) == 1
    assert saved[0]["page"] == 50
    assert saved[0]["surah"] == "آل عمران"

    # Persisted across requests, and clearable with an empty array.
    assert api_client.get("/api/user/preferences").json()["saved_pages"][0]["page"] == 50
    cleared = api_client.patch("/api/user/preferences", json={"saved_pages": []})
    assert cleared.json()["saved_pages"] == []


def test_user_preferences_home_hidden(api_client):
    # Every Home section shows by default.
    assert api_client.get("/api/user/preferences").json()["home_hidden"] == []

    patched = api_client.patch("/api/user/preferences", json={"home_hidden": ["verse", "community"]})
    assert patched.status_code == 200
    assert patched.json()["home_hidden"] == ["verse", "community"]
    # Other preferences are untouched, and the list persists.
    reread = api_client.get("/api/user/preferences").json()
    assert reread["home_hidden"] == ["verse", "community"]
    assert reread["saved_pages"] == []

    # Unknown sections are rejected; an empty list shows everything again.
    assert api_client.patch("/api/user/preferences", json={"home_hidden": ["sidebar"]}).status_code == 422
    assert api_client.patch("/api/user/preferences", json={"home_hidden": []}).json()["home_hidden"] == []


def test_user_preferences_recents(api_client):
    # Home's recents: empty by default, replaced wholesale, at most ten each.
    prefs = api_client.get("/api/user/preferences").json()
    assert prefs["recent_pages"] == [] and prefs["recent_searches"] == []

    pages = [{"page": 50, "mushaf_id": 2, "surah": "آل عمران", "at": 1700000000}]
    searches = [{"query": "رحم", "mode": "root", "at": 1700000001}]
    patched = api_client.patch("/api/user/preferences", json={"recent_pages": pages, "recent_searches": searches})
    assert patched.status_code == 200
    reread = api_client.get("/api/user/preferences").json()
    assert reread["recent_pages"] == pages
    assert reread["recent_searches"] == searches

    # The new Home sections can be hidden; the old shortcut ids stay accepted.
    hidden = api_client.patch("/api/user/preferences", json={"home_hidden": ["recent_pages", "recent_searches", "study"]})
    assert hidden.status_code == 200

    too_many = [{"query": f"q{i}", "mode": "exact", "at": i} for i in range(11)]
    assert api_client.patch("/api/user/preferences", json={"recent_searches": too_many}).status_code == 422
    assert api_client.patch("/api/user/preferences", json={"recent_searches": [{"query": "x", "mode": "fuzzy"}]}).status_code == 422
    assert api_client.patch("/api/user/preferences", json={"recent_pages": [{"page": 0}]}).status_code == 422
    cleared = api_client.patch("/api/user/preferences", json={"recent_pages": [], "recent_searches": []}).json()
    assert cleared["recent_pages"] == [] and cleared["recent_searches"] == []


def test_user_preferences_reading_progress(api_client):
    # «تابع القراءة»: page-turn series, empty and never reset by default.
    assert api_client.get("/api/user/preferences").json()["reading_progress"] == {"series": [], "reset_at": None}

    series = {
        "id": "a1",
        "mushaf_id": 2,
        "start": 10,
        "end": 25,
        "turns": 15,
        "surah": "البقرة",
        "surah_id": 2,
        "updated_at": 1700000000,
    }
    patched = api_client.patch("/api/user/preferences", json={"reading_progress": {"series": [series]}})
    assert patched.status_code == 200
    assert api_client.get("/api/user/preferences").json()["reading_progress"] == {"series": [series], "reset_at": None}

    # A reset replaces it wholesale.
    reset = api_client.patch("/api/user/preferences", json={"reading_progress": {"series": [], "reset_at": 1700000100}})
    assert reset.json()["reading_progress"] == {"series": [], "reset_at": 1700000100}

    too_many = [{**series, "id": f"s{i}"} for i in range(13)]
    assert api_client.patch("/api/user/preferences", json={"reading_progress": {"series": too_many}}).status_code == 422
    bad = {**series, "end": 0}
    assert api_client.patch("/api/user/preferences", json={"reading_progress": {"series": [bad]}}).status_code == 422


def test_mushaf_edition_preference_is_validated_and_falls_back(api_client):
    from src.app.services import app_data_service

    assert api_client.patch("/api/user/preferences", json={"mushaf_edition": "madani-hafs"}).status_code == 200
    # Only offered editions are accepted.
    assert api_client.patch("/api/user/preferences", json={"mushaf_edition": "qaloun-text"}).status_code == 422

    # An edition stored earlier but no longer offered reads back as the default.
    app_data_service.update_preferences({"mushaf_edition": "retired-edition"})
    body = api_client.get("/api/user/preferences").json()
    assert body["mushaf_edition"] == "madani-hafs"


# --- Themes (مواضيع) ------------------------------------------------------------------


def _save(api_client, ayah, **extra):
    response = api_client.post(
        "/api/notebook",
        json={"ayah_id": ayah, "mushaf_id": 1, "surah_id": 1, "ayah": ayah, "text": f"shared verse {ayah}", **extra},
    )
    assert response.status_code == 200
    return response.json()


def test_theme_lifecycle_and_item_counts(api_client):
    created = api_client.post("/api/themes", json={"name": " الصبر ", "color": "green"})
    assert created.status_code == 200
    theme = created.json()
    assert theme["name"] == "الصبر"
    assert theme["color"] == "green"
    assert theme["item_count"] == 0

    item = _save(api_client, 3, theme_ids=[theme["id"]])
    assert item["theme_ids"] == [theme["id"]]
    listing = api_client.get("/api/themes").json()
    assert listing[0]["item_count"] == 1

    renamed = api_client.patch(f"/api/themes/{theme['id']}", json={"name": "الصبر والشكر", "color": "teal"})
    assert renamed.json()["name"] == "الصبر والشكر"
    assert renamed.json()["color"] == "teal"

    assert api_client.delete(f"/api/themes/{theme['id']}").json() == {"deleted": True}
    # The ayah stays saved, just without the deleted theme.
    notebook = api_client.get("/api/notebook").json()
    assert [row["theme_ids"] for row in notebook] == [[]]
    assert api_client.get(f"/api/themes/{theme['id']}").status_code == 404


def test_theme_rejects_unknown_colour_and_empty_name(api_client):
    assert api_client.post("/api/themes", json={"name": "x", "color": "neon"}).status_code == 422
    assert api_client.post("/api/themes", json={"name": ""}).status_code == 422


def test_set_item_themes_replaces_and_drops_unknown_ids(api_client):
    a = api_client.post("/api/themes", json={"name": "أ"}).json()
    b = api_client.post("/api/themes", json={"name": "ب", "color": "rose"}).json()
    item = _save(api_client, 5)
    assert item["theme_ids"] == []

    updated = api_client.put(f"/api/notebook/{item['id']}/themes", json={"theme_ids": [b["id"], a["id"], b["id"], 9999]})
    assert updated.status_code == 200
    assert updated.json()["theme_ids"] == [b["id"], a["id"]]

    cleared = api_client.put(f"/api/notebook/{item['id']}/themes", json={"theme_ids": []})
    assert cleared.json()["theme_ids"] == []
    assert api_client.put("/api/notebook/424242/themes", json={"theme_ids": []}).status_code == 404


def test_theme_board_round_trips_and_is_size_capped(api_client):
    theme = api_client.post("/api/themes", json={"name": "لوحة"}).json()
    board = {"v": 1, "nodes": [{"id": "n1", "type": "note", "x": 10, "y": 20, "data": {"text": "ملاحظة"}}], "edges": []}
    saved = api_client.put(f"/api/themes/{theme['id']}/board", json={"board": board})
    assert saved.status_code == 200
    assert api_client.get(f"/api/themes/{theme['id']}").json()["board"] == board
    # The list stays light: no board payload.
    assert "board" not in api_client.get("/api/themes").json()[0]

    huge = {"v": 1, "nodes": [{"id": "n", "data": {"text": "x" * (300 * 1024)}}], "edges": []}
    assert api_client.put(f"/api/themes/{theme['id']}/board", json={"board": huge}).status_code == 413
    assert api_client.put("/api/themes/999/board", json={"board": board}).status_code == 404


def test_collections_migrate_to_themes_once(tmp_path, monkeypatch):
    import json
    import sqlite3

    from src.app.core import config
    from src.app.services import app_data_service

    db_path = tmp_path / "legacy_app.db"
    connection = sqlite3.connect(db_path)
    connection.executescript(
        """
        CREATE TABLE notebook_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL DEFAULT 0,
            ayah_id INTEGER NOT NULL, mushaf_id INTEGER NOT NULL DEFAULT 1, surah_id INTEGER,
            surah TEXT, ayah INTEGER, text TEXT, note TEXT, collection TEXT, created_at INTEGER NOT NULL
        );
        INSERT INTO notebook_items (user_id, ayah_id, collection, created_at) VALUES (7, 1, 'نور', 1);
        INSERT INTO notebook_items (user_id, ayah_id, collection, created_at) VALUES (7, 2, ' نور ', 2);
        INSERT INTO notebook_items (user_id, ayah_id, collection, created_at) VALUES (7, 3, 'صبر', 3);
        INSERT INTO notebook_items (user_id, ayah_id, collection, created_at) VALUES (7, 4, NULL, 4);
        """
    )
    connection.commit()
    connection.close()

    original = config.get_app_db_path()
    config.set_app_db_path(str(db_path))
    try:
        app_data_service.ensure_app_db()
        app_data_service.ensure_app_db()  # idempotent: no duplicate themes
        themes = app_data_service.list_themes(7)
        assert [(t["name"], t["color"], t["item_count"]) for t in themes] == [("نور", "green", 2), ("صبر", "blue", 1)]
        items = {row["ayah_id"]: row["theme_ids"] for row in app_data_service.list_notebook_items(7)}
        assert items[1] == items[2] == [themes[0]["id"]]
        assert items[3] == [themes[1]["id"]]
        assert items[4] == []
        assert json.loads(json.dumps(items))  # plain JSON-serializable lists
    finally:
        config.set_app_db_path(original)
