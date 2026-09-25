"""AI audit agent — advisory review of a post before it reaches the community.

Design: docs/ai-audit-agent.md. The agent only *routes* a post: ``pass`` lets it
publish, ``review`` / ``reject`` send it to a human moderator. It never deletes
or hides anything by itself, and it fails closed: an unavailable provider or an
unparseable answer yields ``review`` — a person decides.
"""

from __future__ import annotations

import json
from typing import Any

from src.app.services import research_agent_service

GUIDELINES_VERSION = "2026-09"

RULES: dict[str, str] = {
    "misattribution": "Presenting an interpretation as the ayah's text, or using an ayah against its evident context.",
    "ruling_as_fact": "Stating a legal ruling (must/forbidden) as the post's conclusion without a cited scholarly source.",
    "unlabelled_ai": "A section that reads as machine-generated but is not labelled as an AI answer.",
    "disrespect": "Insults, mockery, takfir/tabdi' of people or groups, disrespect of prophets or sanctities.",
    "sectarian_attack": "Polemics against a school or sect instead of a fair argument.",
    "integrity": "Unsourced hadith presented as authentic, categorical 'scientific miracle' claims, plagiarism.",
    "spam_promo": "Advertising, promotional links, follower solicitation.",
    "personal_data": "Someone else's contact details or private information.",
}

SYSTEM_PROMPT = (
    "You audit a Quran research post before it is shown to a community. Apply ONLY these guidelines "
    f"(version {GUIDELINES_VERSION}):\n"
    + "\n".join(f"- {rule}: {text}" for rule, text in RULES.items())
    + "\nQuoted ayahs were already verified against the mushaf; judge how they are used, not their wording. "
    "Do not judge legitimate scholarly differences of opinion; flag only guideline violations. "
    "Do not rewrite the post. For each issue quote the exact passage (<= 200 chars, copied verbatim from "
    "that section) and explain in Arabic, respectfully, what to change. Severity: high = clear, serious "
    "violation; medium = likely violation needing a human; low = minor suggestion. "
    'Return strict JSON only: {"verdict":"pass|review|reject","issues":[{"section_id":"...","rule":"...",'
    '"severity":"low|medium|high","quote":"...","explanation_ar":"...","suggestion_ar":"..."}]}'
)

_SEVERITY_VERDICT = {"high": "reject", "medium": "review"}
_VERDICT_RANK = {"pass": 0, "review": 1, "reject": 2}


def _section_texts(document: dict) -> dict[str, str]:
    texts: dict[str, str] = {}
    for section in document.get("sections", []):
        parts = [section.get("title") or "", section.get("body") or ""]
        parts += [ref.get("text", "") for ref in section.get("ayahs", [])]
        texts[section["id"]] = "\n".join(part for part in parts if part)
    texts["summary"] = f"{document.get('title', '')}\n{document.get('summary') or ''}"
    return texts


def build_audit_input(document: dict) -> dict[str, Any]:
    return {
        "guidelines_version": GUIDELINES_VERSION,
        "document": {
            "title": document.get("title"),
            "summary": document.get("summary"),
            "provenance": document.get("provenance"),
            "sections": [
                {
                    "id": section["id"],
                    "kind": section.get("kind"),
                    "title": section.get("title"),
                    "body": section.get("body", "")[:6000],
                    "ayahs": [
                        {"ref": f"{ref.get('surah_id')}:{ref.get('ayah')}", "text": ref.get("text", "")}
                        for ref in section.get("ayahs", [])
                    ],
                }
                for section in document.get("sections", [])
            ],
            "references": document.get("references", []),
        },
    }


def parse_audit(raw: str, document: dict) -> dict:
    """Validate the model's answer; drop hallucinated issues; derive the verdict from severities."""
    parsed = research_agent_service.parse_json_object(raw)
    texts = _section_texts(document)
    issues: list[dict] = []
    for issue in parsed.get("issues") or []:
        if not isinstance(issue, dict):
            continue
        section_id = str(issue.get("section_id") or "")
        rule = str(issue.get("rule") or "other")
        severity = str(issue.get("severity") or "medium")
        quote = str(issue.get("quote") or "").strip()[:200]
        explanation = str(issue.get("explanation_ar") or "").strip()
        if section_id not in texts or severity not in ("low", "medium", "high") or not explanation:
            continue
        # Hallucination guard: a quote must be a passage of the cited section.
        if quote and quote not in texts[section_id]:
            continue
        issues.append(
            {
                "section_id": section_id,
                "rule": rule if rule in RULES else "other",
                "severity": severity,
                "quote": quote or None,
                "explanation_ar": explanation[:600],
                "suggestion_ar": (str(issue.get("suggestion_ar") or "").strip()[:600] or None),
            }
        )
    derived = "pass"
    for issue in issues:
        candidate = _SEVERITY_VERDICT.get(issue["severity"], "pass")
        if _VERDICT_RANK[candidate] > _VERDICT_RANK[derived]:
            derived = candidate
    # The model may be stricter than its own issues; never laxer.
    stated = str(parsed.get("verdict") or "review")
    if stated in _VERDICT_RANK and _VERDICT_RANK[stated] > _VERDICT_RANK[derived]:
        derived = stated
    return {"verdict": derived, "issues": issues}


def run_ai_audit(document: dict) -> dict:
    """Audit a document snapshot. Never raises; fails closed to ``review``."""
    try:
        provider = research_agent_service.get_llm_provider()
        model = provider.provider_info().chat_model
        raw = provider.complete_json(
            SYSTEM_PROMPT,
            json.dumps(build_audit_input(document), ensure_ascii=False),
            stage="community_audit",
        )
        result = parse_audit(raw, document)
        return {**result, "model": model, "fallback_reason": None}
    except research_agent_service.ResearchProviderUnavailable:
        return {"verdict": "review", "issues": [], "model": None, "fallback_reason": "provider_unavailable"}
    except (research_agent_service.ResearchProviderResponseError, ValueError, TypeError):
        return {"verdict": "review", "issues": [], "model": None, "fallback_reason": "invalid_output"}
