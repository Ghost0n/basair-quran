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
    assert body["numerals"] == "arabic-indic"
    assert body["riwayah"] == 2  # Ḥafṣ is the default riwāyah
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
