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


def test_morphology_features_are_readable(api_client):
    # السمات shows readable Arabic, never raw QAC codes, and drops POS echoes.
    # مِن (preposition): its only QAC "feature" is "P" (its own POS) → nothing to show.
    preposition = api_client.get("/api/morphology", params={"surah": 3, "ayah": 4}).json()["words"][0]
    assert preposition["features"] == []
    # نَزَّلَ (verb): raw "PERF|VF:2|3MS" → readable aspect + person, no raw codes.
    verb = api_client.get("/api/morphology", params={"surah": 3, "ayah": 3}).json()["words"][0]
    assert "ماضٍ" in verb["features"]
    assert "PERF" not in verb["features"] and "3MS" not in verb["features"]
    # No feature label contains Latin letters (i.e. no untranslated code leaked).
    assert not any(any("a" <= ch.lower() <= "z" for ch in feat) for feat in verb["features"])


def test_normalize_signature_folds_across_riwayat():
    from src.app.services.morphology_service import normalize_signature

    # Same verse, Hafs vs Qalūn marks/spelling -> identical consonant skeleton.
    assert normalize_signature("وَلِكُلِّ قَوْمٍ هَادٍ") == normalize_signature("وَلِكُلِّ قَوْمٍ هَادٍۖ") == "ولكلقومهاد"
    # Alef-wasla variants (Hafs ٱ vs Qalūn اَ۬) fold to the same skeleton.
    assert normalize_signature("ٱلْحَسَنَةِ") == normalize_signature("اَ۬لْحَسَنَةِ")


def test_morphology_text_match_overrides_ayah_numbering(api_client):
    # The QAC morphology is Kufan-numbered. Ar-Ra'd "...وَلِكُلِّ قَوْمٍ هَادٍ" is
    # verse 7 in Kufan/Hafs but verse 8 in Madani/Qalūn numbering. Passing the
    # displayed verse text must match the verse, not the (off-by-one) number —
    # otherwise a Qalūn click on قَوْمٍ wrongly resolves to عِندَهُۥ (verse 8 word 14).
    verse_text = (
        "وَيَقُولُ ٱلَّذِينَ كَفَرُوا۟ لَوْلَآ أُنزِلَ عَلَيْهِ ءَايَةٌ مِّن رَّبِّهِۦٓ "
        "إِنَّمَآ أَنتَ مُنذِرٌ وَلِكُلِّ قَوْمٍ هَادٍ"
    )
    by_number = api_client.get("/api/morphology", params={"surah": 13, "ayah": 8}).json()
    by_text = api_client.get(
        "/api/morphology", params={"surah": 13, "ayah": 8, "text": verse_text}
    ).json()

    assert by_text["found"] is True
    assert len(by_text["words"]) == 15
    word14 = next(w for w in by_text["words"] if w["position"] == 14)
    assert word14["root"] == "قوم"
    # The text match resolved a different verse than the bare ayah number.
    assert by_text["words"][0]["text"] != by_number["words"][0]["text"]


def test_morphology_run_match_handles_split_verses(api_client):
    from src.app.services.morphology_service import normalize_signature

    # Some counting traditions SPLIT a long Kufan verse into two (e.g. Qalūn's
    # Aal ʿImrān 3:3 is the first words of Kufan 3:4). Such a partial verse won't
    # match a whole Kufan verse, so the word-run matcher must locate it and
    # re-index positions — otherwise the ayah-number fallback resolves the wrong
    # verse (the reported bug: clicking مِن showed نَزَّلَ from 3:3).
    full = api_client.get("/api/morphology", params={"surah": 3, "ayah": 4}).json()
    partial_text = " ".join(w["text"] for w in full["words"][:6])

    body = api_client.get(
        "/api/morphology", params={"surah": 3, "ayah": 3, "text": partial_text}
    ).json()
    assert body["found"] is True
    # The run (not the 11-word 3:3 fallback) — exactly the 6 clicked words.
    assert len(body["words"]) == 6
    assert body["words"][0]["position"] == 1
    assert normalize_signature(body["words"][0]["text"]) == normalize_signature(full["words"][0]["text"])
