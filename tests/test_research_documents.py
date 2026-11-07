"""Research documents — storage, quote verification, versioning, audit."""


def _doc(**overrides):
    body = {
        "title": "البصائر في القرآن",
        "summary": "بحث قصير.",
        "tags": ["بصائر", " بصائر ", ""],
        "sections": [
            {
                "id": "s1",
                "kind": "ayahs",
                "title": "الآيات",
                "body": "",
                "ayahs": [{"mushaf_id": 1, "surah_id": 1, "ayah": 2, "text": ""}],
            },
            {"id": "s2", "kind": "note", "body": "ملاحظة الباحث."},
        ],
        "references": [{"kind": "ayah", "label": "الفاتحة 3", "locator": "1:3"}],
        "provenance": {"mode": "strict", "created_from": "manual"},
    }
    body.update(overrides)
    return body


def test_document_lifecycle_fills_quotes_and_versions(api_client):
    created = api_client.post("/api/documents", json=_doc())
    assert created.status_code == 200
    document = created.json()
    assert document["id"].startswith("doc-")
    assert document["v"] == 1 and document["version"] == 1
    assert document["visibility"] == "private"
    assert document["tags"] == ["بصائر"]
    # An empty quote is filled from the Quran DB, with its ayah id.
    ref = document["sections"][0]["ayahs"][0]
    assert ref["text"] == "shared verse 2"
    assert ref["ayah_id"] == 2
    assert document["verification"] == {"ok": True, "checked": 1, "issues": []}

    listing = api_client.get("/api/documents").json()
    assert listing[0]["id"] == document["id"]
    assert listing[0]["ayah_count"] == 1 and listing[0]["section_count"] == 2

    replaced = api_client.put(f"/api/documents/{document['id']}", json=_doc(title="عنوان جديد"))
    assert replaced.json()["version"] == 2
    assert api_client.get(f"/api/documents/{document['id']}").json()["title"] == "عنوان جديد"

    assert api_client.delete(f"/api/documents/{document['id']}").json() == {"deleted": True}
    assert api_client.get(f"/api/documents/{document['id']}").status_code == 404


def test_misquoted_and_unknown_ayahs_are_reported_not_rewritten(api_client):
    sections = [
        {
            "id": "s1",
            "kind": "ayahs",
            "ayahs": [
                {"mushaf_id": 1, "surah_id": 1, "ayah": 3, "text": "a paraphrase"},
                {"mushaf_id": 1, "surah_id": 1, "ayah": 99, "text": ""},
            ],
        }
    ]
    document = api_client.post("/api/documents", json=_doc(sections=sections)).json()
    verification = document["verification"]
    assert verification["ok"] is False
    assert [(issue["ayah"], issue["problem"]) for issue in verification["issues"]] == [
        (3, "text_mismatch"),
        (99, "not_found"),
    ]
    assert verification["issues"][0]["expected"] == "shared verse 3"
    assert document["sections"][0]["ayahs"][0]["text"] == "a paraphrase"


def test_document_validation(api_client):
    assert api_client.post("/api/documents", json=_doc(title="")).status_code == 422
    assert api_client.post("/api/documents", json=_doc(visibility="public")).status_code == 422
    duplicate = [{"id": "x", "body": "a"}, {"id": "x", "body": "b"}]
    assert api_client.post("/api/documents", json=_doc(sections=duplicate)).status_code == 422
    huge = [{"id": f"s{i}", "body": "ب" * 8000} for i in range(40)]
    assert api_client.post("/api/documents", json=_doc(sections=huge)).status_code == 413


def test_audit_blocks_unlabelled_ai_missing_disclaimer_and_bad_quotes(api_client):
    good = api_client.post("/api/documents", json=_doc()).json()
    audit = api_client.get(f"/api/documents/{good['id']}/audit").json()
    assert audit["publishable"] is True
    assert {check["rule"] for check in audit["checks"]} == {
        "quotes_verified",
        "has_content",
        "ai_sections_labelled",
        "ayah_references_resolve",
    }

    bad = api_client.post(
        "/api/documents",
        json=_doc(
            sections=[
                {"id": "a1", "kind": "ai_answer", "body": "جواب"},
                {"id": "s1", "kind": "ayahs", "ayahs": [{"mushaf_id": 1, "surah_id": 1, "ayah": 3, "text": "x"}]},
            ],
            references=[{"kind": "ayah", "label": "غير موجودة", "locator": "1:400"}],
            provenance={"mode": "tafssir", "created_from": "studio", "ai_sections": []},
        ),
    ).json()
    audit = api_client.get(f"/api/documents/{bad['id']}/audit").json()
    failed = {check["rule"] for check in audit["checks"] if not check["passed"]}
    assert audit["publishable"] is False
    assert failed == {"quotes_verified", "ai_sections_labelled", "tafssir_disclaimer", "ayah_references_resolve"}


def test_documents_are_scoped_to_their_owner(api_client):
    from src.app.services import research_document_service

    other = research_document_service.create_document(_doc(), user_id=42)
    assert api_client.get(f"/api/documents/{other['id']}").status_code == 404
    assert api_client.delete(f"/api/documents/{other['id']}").json() == {"deleted": False}
