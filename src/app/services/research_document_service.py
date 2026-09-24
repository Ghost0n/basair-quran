"""Research documents — the structured, shareable research format.

A document (``ResearchDocumentSave``) is stored as JSON in the app-data store
(``research_documents``), one row per document, versioned on every replace.
Documents are private for now; the format is fixed so community sharing can
publish them later without migration (docs/research-workspace-spec.md §5–6).

Every quoted ayah is verified against the Quran DB on save: an empty quote is
filled from the DB, a differing one is reported (never silently rewritten).
``audit_document`` runs the deterministic, blocking pre-publication checks.
"""

from __future__ import annotations

import json
import secrets
import time

from src.app.models.api import (
    MAX_DOCUMENT_BYTES,
    MAX_DOCUMENTS_PER_USER,
    RESEARCH_DOCUMENT_VERSION,
)
from src.app.services import app_data_service, quran_service

# The Tafssir disclaimer marker a tafssir-derived document must carry.
TAFSSIR_MARKER = "تجريبي"


class DocumentLimitError(ValueError):
    """Raised when a document or the user's document count exceeds a cap."""


def _new_id() -> str:
    return f"doc-{secrets.token_urlsafe(10)}"


def verify_quotes(payload: dict) -> dict:
    """Check (and fill) every quoted ayah. Mutates ``payload`` sections in place.

    Returns a ``QuoteVerification`` dict. Matching is on the normalized rasm
    (diacritics / alif forms / tatweel ignored), so a faithful quote in another
    script form still verifies; a different verse or a paraphrase does not.
    """
    issues: list[dict] = []
    checked = 0
    for section in payload.get("sections", []):
        for ref in section.get("ayahs", []):
            checked += 1
            verse = quran_service.get_ayah_verse(ref["mushaf_id"], ref["surah_id"], ref["ayah"])
            if verse is None:
                issues.append(
                    {"section_id": section["id"], "surah_id": ref["surah_id"], "ayah": ref["ayah"], "problem": "not_found"}
                )
                continue
            ref["ayah_id"] = verse["ayah_id"]
            quoted = (ref.get("text") or "").strip()
            if not quoted:
                ref["text"] = verse["text"]
            elif quran_service.normalize_count_text(quoted) != quran_service.normalize_count_text(verse["text"]):
                issues.append(
                    {
                        "section_id": section["id"],
                        "surah_id": ref["surah_id"],
                        "ayah": ref["ayah"],
                        "problem": "text_mismatch",
                        "expected": verse["text"],
                    }
                )
    return {"ok": not issues, "checked": checked, "issues": issues}


def _summary(row) -> dict:
    body = json.loads(row["body"])
    provenance = body.get("provenance") or {}
    return {
        "id": row["id"],
        "title": row["title"],
        "summary": body.get("summary"),
        "mode": provenance.get("mode"),
        "created_from": provenance.get("created_from", "manual"),
        "section_count": len(body.get("sections", [])),
        "ayah_count": sum(len(section.get("ayahs", [])) for section in body.get("sections", [])),
        "visibility": body.get("visibility", "private"),
        "version": int(row["version"]),
        "created_at": int(row["created_at"]),
        "updated_at": int(row["updated_at"]),
    }


def _document(row) -> dict:
    body = json.loads(row["body"])
    return {
        **body,
        "id": row["id"],
        "v": RESEARCH_DOCUMENT_VERSION,
        "version": int(row["version"]),
        "created_at": int(row["created_at"]),
        "updated_at": int(row["updated_at"]),
    }


def _encode(payload: dict) -> str:
    encoded = json.dumps(payload, ensure_ascii=False)
    if len(encoded.encode("utf-8")) > MAX_DOCUMENT_BYTES:
        raise DocumentLimitError(f"A research document is limited to {MAX_DOCUMENT_BYTES // 1024} KB.")
    return encoded


def list_documents(user_id: int) -> list[dict]:
    with app_data_service.connect() as connection:
        rows = connection.execute(
            "SELECT * FROM research_documents WHERE user_id = ? ORDER BY updated_at DESC", (user_id,)
        ).fetchall()
    return [_summary(row) for row in rows]


def get_document(document_id: str, user_id: int) -> dict | None:
    with app_data_service.connect() as connection:
        row = connection.execute(
            "SELECT * FROM research_documents WHERE id = ? AND user_id = ?", (document_id, user_id)
        ).fetchone()
    return _document(row) if row else None


def create_document(payload: dict, user_id: int, guest_id: str | None = None) -> dict:
    verification = verify_quotes(payload)
    encoded = _encode(payload)
    now = int(time.time())
    document_id = _new_id()
    with app_data_service.connect() as connection:
        (count,) = connection.execute(
            "SELECT COUNT(*) FROM research_documents WHERE user_id = ?", (user_id,)
        ).fetchone()
        if count >= MAX_DOCUMENTS_PER_USER:
            raise DocumentLimitError(f"A user can keep at most {MAX_DOCUMENTS_PER_USER} research documents.")
        connection.execute(
            "INSERT INTO research_documents (id, user_id, title, body, version, created_at, updated_at, guest_id) "
            "VALUES (?, ?, ?, ?, 1, ?, ?, ?)",
            (document_id, user_id, payload["title"], encoded, now, now, app_data_service.guest_stamp(user_id, guest_id)),
        )
        connection.commit()
    document = get_document(document_id, user_id) or {}
    document["verification"] = verification
    return document


def replace_document(document_id: str, payload: dict, user_id: int) -> dict | None:
    verification = verify_quotes(payload)
    encoded = _encode(payload)
    with app_data_service.connect() as connection:
        cursor = connection.execute(
            "UPDATE research_documents SET title = ?, body = ?, version = version + 1, updated_at = ? "
            "WHERE id = ? AND user_id = ?",
            (payload["title"], encoded, int(time.time()), document_id, user_id),
        )
        connection.commit()
        if cursor.rowcount == 0:
            return None
    document = get_document(document_id, user_id) or {}
    document["verification"] = verification
    return document


def delete_document(document_id: str, user_id: int) -> bool:
    with app_data_service.connect() as connection:
        cursor = connection.execute(
            "DELETE FROM research_documents WHERE id = ? AND user_id = ?", (document_id, user_id)
        )
        connection.commit()
        return cursor.rowcount > 0


def audit_document(document: dict) -> dict:
    """Deterministic, blocking pre-publication checks (spec §6.2, step 1)."""
    sections = document.get("sections", [])
    provenance = document.get("provenance") or {}
    checks: list[dict] = []

    verification = verify_quotes(json.loads(json.dumps(document)))
    checks.append(
        {
            "rule": "quotes_verified",
            "passed": verification["ok"],
            "detail": None
            if verification["ok"]
            else "، ".join(f"{issue['surah_id']}:{issue['ayah']}" for issue in verification["issues"]),
        }
    )

    has_content = bool(document.get("title", "").strip()) and any(
        section.get("body", "").strip() or section.get("ayahs") for section in sections
    )
    checks.append({"rule": "has_content", "passed": has_content, "detail": None})

    ai_kind = {section["id"] for section in sections if section.get("kind") == "ai_answer"}
    ai_listed = set(provenance.get("ai_sections") or [])
    ai_ok = ai_kind == ai_listed
    checks.append(
        {
            "rule": "ai_sections_labelled",
            "passed": ai_ok,
            "detail": None if ai_ok else "كل قسم مولَّد آلياً يجب أن يُوسَم بذلك (والعكس).",
        }
    )

    if provenance.get("mode") == "tafssir":
        texts = [document.get("summary") or ""] + [section.get("body", "") for section in sections]
        has_disclaimer = any(TAFSSIR_MARKER in text for text in texts)
        checks.append(
            {
                "rule": "tafssir_disclaimer",
                "passed": has_disclaimer,
                "detail": None if has_disclaimer else "القراءة التفسيرية تجريبية ويجب أن تحمل التنبيه.",
            }
        )

    # Ayah references resolve in the document's mushaf (its quotes'), Hafs by default.
    mushaf_id = next((ref["mushaf_id"] for section in sections for ref in section.get("ayahs", [])), 2)
    bad_refs = []
    for reference in document.get("references", []):
        if reference.get("kind") != "ayah":
            continue
        try:
            surah, ayah = (int(part) for part in str(reference.get("locator") or "").split(":"))
        except ValueError:
            bad_refs.append(reference.get("label", ""))
            continue
        if quran_service.get_ayah_verse(mushaf_id, surah, ayah) is None:
            bad_refs.append(reference.get("label", ""))
    checks.append(
        {
            "rule": "ayah_references_resolve",
            "passed": not bad_refs,
            "detail": None if not bad_refs else "، ".join(bad_refs),
        }
    )

    return {"publishable": all(check["passed"] for check in checks), "checks": checks}
