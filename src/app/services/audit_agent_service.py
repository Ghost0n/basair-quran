"""Moderation agent — checks a post or a comment against the community guidelines.

Design: docs/community-moderation-design.md (it replaces the publish-time flow
of docs/ai-audit-agent.md). The agent only *routes* an item: ``valid``,
``unsure`` or ``declined``; the moderation service decides what that means for
the author's trust level, and a person sees every ``unsure`` and ``declined``.
It never hides or deletes anything by itself, and it fails closed: an
unavailable provider, an invalid answer or a low confidence give ``unsure``.

Reasons are written in the author's interface language, so the author reads
them as they are.
"""

from __future__ import annotations

import json
from typing import Any

from src.app.core import config
from src.app.services import research_agent_service

GUIDELINES_VERSION = "2026-10"

RULES: dict[str, str] = {
    "misattribution": "Presenting an interpretation as the ayah's text, or using an ayah against its evident context.",
    "ruling_as_fact": "Stating a legal ruling (must/forbidden) as the post's conclusion without a cited scholarly source.",
    "unlabelled_ai": "A section that reads as machine-generated but is not labelled as an AI answer.",
    "disrespect": "Insults, mockery, takfir/tabdi' of people or groups, disrespect of prophets or sanctities.",
    "sectarian_attack": "Polemics against a school or sect instead of a fair argument.",
    "integrity": "Unsourced hadith presented as authentic, categorical 'scientific miracle' claims, plagiarism.",
    "spam_promo": "Advertising, promotional links, follower solicitation.",
    "personal_data": "Someone else's contact details or private information.",
    "off_topic": "A comment unrelated to the research it is posted on.",
    "harassment": "Following, targeting or provoking a person, or inciting others to.",
}
POST_RULES = [rule for rule in RULES if rule not in ("off_topic", "harassment")]
COMMENT_RULES = [rule for rule in RULES if rule not in ("unlabelled_ai",)]

# The interface languages (apps/web/lib/i18n/locales.ts), named for the model.
LANGUAGES = {
    "ar": "Arabic", "en": "English", "fr": "French", "es": "Spanish", "de": "German", "pt": "Portuguese",
    "it": "Italian", "nl": "Dutch", "ru": "Russian", "tr": "Turkish", "az": "Azerbaijani", "uz": "Uzbek",
    "bs": "Bosnian", "sq": "Albanian", "fa": "Persian", "ur": "Urdu", "id": "Indonesian", "ms": "Malay",
    "bn": "Bengali", "hi": "Hindi", "zh": "Chinese", "ja": "Japanese", "ko": "Korean", "sw": "Swahili",
}

VERDICTS = ("valid", "unsure", "declined")
_VERDICT_RANK = {verdict: rank for rank, verdict in enumerate(VERDICTS)}
_SEVERITY_VERDICT = {"high": "declined", "medium": "unsure"}
MAX_QUOTE = 200
MAX_TEXT = 600


def language_name(code: str | None) -> str:
    return LANGUAGES.get((code or "ar").split("-")[0].lower(), "Arabic")


def _system_prompt(kind: str, language: str) -> str:
    rules = POST_RULES if kind == "post" else COMMENT_RULES
    target = (
        '"target" is the id of the section the issue is in, or "summary" for the title and summary'
        if kind == "post"
        else '"target" is always "comment"'
    )
    subject = (
        "a Quran research post before it is shown to a community"
        if kind == "post"
        else "a comment left on a Quran research post (the post's title and summary are given for context)"
    )
    return (
        f"You check {subject}. Apply ONLY these community guidelines (version {GUIDELINES_VERSION}):\n"
        + "\n".join(f"- {rule}: {RULES[rule]}" for rule in rules)
        + "\nQuoted ayahs were already verified against the mushaf; judge how they are used, not their wording. "
        "Do not judge legitimate scholarly differences of opinion; flag only guideline violations. "
        "Do not rewrite the text. For each issue copy the exact passage (at most 200 characters, verbatim) "
        f"into \"quote\"; {target}. Write \"explanation\" (what breaks which guideline) and \"suggestion\" "
        f"(how to fix it) respectfully in {language}. Severity: high = clear, serious violation; "
        "medium = likely violation that needs a person; low = minor suggestion. "
        '"confidence" (0 to 1) is how sure you are of the verdict. Return strict JSON only: '
        '{"verdict":"valid|unsure|declined","confidence":0.0,"issues":[{"target":"...","rule":"...",'
        '"severity":"low|medium|high","quote":"...","explanation":"...","suggestion":"..."}]}'
    )


def _section_texts(document: dict) -> dict[str, str]:
    texts: dict[str, str] = {}
    for section in document.get("sections", []):
        parts = [section.get("title") or "", section.get("body") or ""]
        parts += [ref.get("text", "") for ref in section.get("ayahs", [])]
        texts[section["id"]] = "\n".join(part for part in parts if part)
    texts["summary"] = f"{document.get('title', '')}\n{document.get('summary') or ''}"
    return texts


def build_post_input(document: dict) -> dict[str, Any]:
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
                    "body": (section.get("body") or "")[:6000],
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


def build_comment_input(body: str, post: dict) -> dict[str, Any]:
    return {
        "guidelines_version": GUIDELINES_VERSION,
        "post": {"title": post.get("title"), "summary": post.get("summary")},
        "comment": body[:4000],
    }


def parse_check(raw: str, texts: dict[str, str], allowed_rules: list[str]) -> dict:
    """Validate the model's answer: drop issues whose quote isn't in the cited
    text (hallucination guard), derive the verdict from the severities (never
    laxer than them) and fall back to ``unsure`` under the confidence bar."""
    parsed = research_agent_service.parse_json_object(raw)
    issues: list[dict] = []
    for issue in parsed.get("issues") or []:
        if not isinstance(issue, dict):
            continue
        target = str(issue.get("target") or issue.get("section_id") or "")
        severity = str(issue.get("severity") or "medium")
        quote = str(issue.get("quote") or "").strip()[:MAX_QUOTE]
        explanation = str(issue.get("explanation") or issue.get("explanation_ar") or "").strip()
        if target not in texts or severity not in ("low", "medium", "high") or not explanation:
            continue
        if quote and quote not in texts[target]:
            continue
        rule = str(issue.get("rule") or "other")
        suggestion = str(issue.get("suggestion") or issue.get("suggestion_ar") or "").strip()
        issues.append(
            {
                "target": target,
                "rule": rule if rule in allowed_rules else "other",
                "severity": severity,
                "quote": quote or None,
                "explanation": explanation[:MAX_TEXT],
                "suggestion": suggestion[:MAX_TEXT] or None,
            }
        )
    derived = "valid"
    for issue in issues:
        candidate = _SEVERITY_VERDICT.get(issue["severity"], "valid")
        if _VERDICT_RANK[candidate] > _VERDICT_RANK[derived]:
            derived = candidate
    stated = str(parsed.get("verdict") or "unsure")
    if stated in _VERDICT_RANK and _VERDICT_RANK[stated] > _VERDICT_RANK[derived]:
        derived = stated
    try:
        confidence = min(1.0, max(0.0, float(parsed.get("confidence"))))
    except (TypeError, ValueError):
        confidence = 0.0
    if derived == "valid" and confidence < config.get_moderation_min_confidence():
        derived = "unsure"
    return {"verdict": derived, "confidence": confidence, "issues": issues}


def _run(kind: str, payload: dict, texts: dict[str, str], language: str | None) -> dict:
    """One agent call. Never raises; fails closed to ``unsure``."""
    rules = POST_RULES if kind == "post" else COMMENT_RULES
    base = {"guidelines_version": GUIDELINES_VERSION, "language": (language or "ar")}
    try:
        provider = research_agent_service.get_llm_provider()
        model = provider.provider_info().chat_model
        raw = provider.complete_json(
            _system_prompt(kind, language_name(language)),
            json.dumps(payload, ensure_ascii=False),
            stage=f"moderation_{kind}",
        )
        return {**parse_check(raw, texts, rules), **base, "model": model, "fallback_reason": None}
    except research_agent_service.ResearchProviderUnavailable:
        reason = "provider_unavailable"
    except (research_agent_service.ResearchProviderResponseError, ValueError, TypeError):
        reason = "invalid_output"
    return {"verdict": "unsure", "confidence": 0.0, "issues": [], **base, "model": None, "fallback_reason": reason}


def check_post(document: dict, language: str | None = None) -> dict:
    """Check a post snapshot (its document) in the author's language."""
    return _run("post", build_post_input(document), _section_texts(document), language)


def check_comment(body: str, post: dict, language: str | None = None) -> dict:
    """Check a comment, with the post's title and summary as context."""
    return _run("comment", build_comment_input(body, post), {"comment": body}, language)
