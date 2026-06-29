def test_morphology_returns_word_breakdown_for_al_fatiha(api_client):
    response = api_client.get("/api/morphology", params={"surah": 1, "ayah": 1})
    assert response.status_code == 200
    body = response.json()
    assert body["found"] is True
    assert body["surah"] == 1
    assert body["ayah"] == 1
    assert len(body["words"]) >= 3

    first = body["words"][0]
    assert first["position"] == 1
    assert first["text"]
    assert first["pos"]
    # بِسْمِ — the stem سْمِ carries the root س م و in the QAC morphology.
    assert first["root"] == "سمو"

    # Every word exposes a human-readable POS label.
    assert all(word["pos_label"] for word in body["words"])


def test_morphology_validates_surah_bounds(api_client):
    response = api_client.get("/api/morphology", params={"surah": 999, "ayah": 1})
    assert response.status_code == 422
