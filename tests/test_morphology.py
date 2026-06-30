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
