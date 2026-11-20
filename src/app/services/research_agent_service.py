from __future__ import annotations

from dataclasses import dataclass, field
import json
import re
import sqlite3
import threading
import time
from typing import Any, Iterable
from urllib import error, request
from urllib.parse import urlsplit

from src.app.core import config
from src.app.models.api import (
    OllamaModelItem,
    ResearchAgentAyah,
    ResearchAgentMessage,
    ResearchAgentRequest,
    ResearchAgentResponse,
    ResearchAgentSettingsResponse,
    ResearchLimitsInfo,
    ResearchProviderInfo,
    ResearchRelatedTerm,
    ResearchSearchItem,
    ResearchUsageStep,
    ResearchUsageSummary,
)
from src.app.services import quran_service


class ResearchAgentError(Exception):
    """Base exception for research-agent failures."""


class ResearchProviderUnavailable(ResearchAgentError):
    """Raised when the configured LLM provider cannot be used."""


class ResearchProviderResponseError(ResearchAgentError):
    """Raised when the provider returns unusable structured output."""


@dataclass
class QuranTermCandidate:
    type: str
    text: str
    root_id: int | None = None
    score: float = 0.0


@dataclass
class SearchPlan:
    status: str
    clarifying_question: str | None = None
    related_terms: list[ResearchRelatedTerm] = field(default_factory=list)
    searches: list[ResearchSearchItem] = field(default_factory=list)


@dataclass
class CandidateExpansion:
    related_terms: list[ResearchRelatedTerm] = field(default_factory=list)
    searches: list[ResearchSearchItem] = field(default_factory=list)


@dataclass
class AnswerReview:
    answer: str
    keep_ayah_ids: list[int] = field(default_factory=list)
    discard_ayah_ids: list[int] = field(default_factory=list)


@dataclass
class ResearchRuntimeSettings:
    provider_name: str
    base_url: str
    chat_model: str
    embed_model: str
    timeout: float
    api_key: str = ""
    # The reader's thinking level for this request ("" = the model's default;
    # llm_providers.THINKING_LEVELS).
    thinking: str = ""


@dataclass
class UsageAccumulator:
    steps: list[ResearchUsageStep] = field(default_factory=list)

    def add_step(self, stage: str, model: str, payload: dict[str, Any]) -> None:
        self.steps.append(
            ResearchUsageStep(
                stage=stage,
                model=model,
                total_duration_ns=int(payload.get("total_duration") or 0),
                load_duration_ns=int(payload.get("load_duration") or 0),
                prompt_eval_count=int(payload.get("prompt_eval_count") or 0),
                eval_count=int(payload.get("eval_count") or 0),
            )
        )

    def as_summary(self) -> ResearchUsageSummary:
        return ResearchUsageSummary(
            request_count=len(self.steps),
            total_duration_ns=sum(step.total_duration_ns for step in self.steps),
            load_duration_ns=sum(step.load_duration_ns for step in self.steps),
            prompt_eval_count=sum(step.prompt_eval_count for step in self.steps),
            eval_count=sum(step.eval_count for step in self.steps),
            steps=self.steps,
        )


SPACED_ARABIC_ROOT_RE = re.compile(r"^[\u0621-\u064A](?:[\s\-_/,،]+[\u0621-\u064A]){1,5}$")


PUBLIC_OLLAMA_CLOUD_CATALOG_URL = "https://ollama.com/search?c=cloud"
PUBLIC_OLLAMA_LIBRARY_URL = "https://ollama.com/library/"
PUBLIC_OLLAMA_CLOUD_CACHE_TTL_SECONDS = 1800
_public_ollama_cloud_catalog_cache: tuple[float, list[OllamaModelItem]] | None = None


# Every answer comes from the Quran alone: the ayahs the search returned, and nothing else.
QURAN_ONLY_ANSWER_RULES = (
    "You answer questions about the Quran using ONLY the ayahs given in the JSON payload. "
    "Rules: "
    "1) Base every statement on those ayahs. Do not use tafsir, hadith, the sayings of scholars, "
    "fiqh rulings, historical reports (asbab al-nuzul, Israiliyyat) or any knowledge from outside "
    "the payload, and do not attribute views to anyone. "
    "2) Cite each ayah you rely on by surah name and ayah number (for example: البقرة 153), and "
    "quote the words of the ayah exactly as given when you quote; never quote or paraphrase an "
    "ayah that is not in the payload. "
    "3) Report what the ayahs say, and keep it apart from any connection you draw between them; "
    "present such a connection as an observation from the ayahs' wording, not as a ruling or a "
    "definitive interpretation. Do not issue religious rulings (halal/haram, obligations) or fatwas. "
    "4) If the ayahs do not answer the question, or answer only part of it, say so plainly instead "
    "of filling the gap. "
    "5) Write in the requested answer_language, clearly and concisely; keep Quranic words in Arabic."
)

# The final stage reads every ayah in its passage: its neighbours come from the Quran database.
QURAN_CONTEXT_RULE = (
    "CONTEXT RULE: each ayah carries `context.before` and `context.after` (the neighbouring ayahs of "
    "the same surah, in order) and `context.surah` (name, Meccan/Medinan type, ayah count) with "
    "`context.position`. Read every ayah within its passage before using it, never as an isolated "
    "fragment, and say so when the passage narrows or changes the meaning. Neighbouring ayahs are "
    "context only: keep_ayah_ids must come from the ayah_id values listed in `ayahs`. When "
    "`focus_ayah_id` is present the question is about that ayah: centre the answer on it and keep it."
)
# Neighbouring ayahs can be long (e.g. 2:282); bound each so the prompt stays sized.
CONTEXT_AYAH_CHARS = 600
# Neighbours on each side of a search hit, and of the ayah a reader asks about.
CONTEXT_WINDOW = 1
FOCUS_CONTEXT_WINDOW = 5


class ResearchLlmProvider:
    """Interface for research-agent LLM providers."""

    def expand_search_candidates(
        self,
        messages: list[ResearchAgentMessage],
        quran_terms: list[QuranTermCandidate],
        answer_language: str,
    ) -> CandidateExpansion:
        fallback_terms = [
            ResearchRelatedTerm(type=coerce_term_type(term.type), text=term.text, root_id=term.root_id)
            for term in quran_terms[:10]
        ]
        fallback_searches = [
            ResearchSearchItem(mode="root" if term.type == "root" else "exact", query=term.text, reason="Fallback candidate.")
            for term in quran_terms[:8]
        ]
        return CandidateExpansion(
            related_terms=dedupe_related_terms(fallback_terms),
            searches=dedupe_searches(fallback_searches),
        )

    def create_search_plan(
        self,
        messages: list[ResearchAgentMessage],
        quran_terms: list[QuranTermCandidate],
        expanded_candidates: CandidateExpansion,
        answer_language: str,
    ) -> SearchPlan:
        raise NotImplementedError

    def synthesize_answer(
        self,
        messages: list[ResearchAgentMessage],
        ayahs: list[ResearchAgentAyah],
        related_terms: list[ResearchRelatedTerm],
        searches: list[ResearchSearchItem],
        answer_language: str,
    ) -> str:
        raise NotImplementedError

    def complete_json(self, system: str, user: str, *, stage: str) -> str:
        """One deterministic JSON completion (used by the community audit agent)."""
        raise ResearchProviderUnavailable("The configured provider does not support JSON completions.")

    def provider_info(self) -> ResearchProviderInfo:
        return ResearchProviderInfo(
            provider="ollama",
            transport="local_api",
            base_url=config.get_ollama_base_url(),
            chat_model=config.get_llm_chat_model(),
            embed_model=config.get_llm_embed_model(),
            authenticated=bool(config.get_ollama_api_key()),
        )

    def usage_summary(self) -> ResearchUsageSummary:
        return ResearchUsageSummary()

    def list_models(self) -> list[OllamaModelItem]:
        return []

    def finalize_answer(
        self,
        messages: list[ResearchAgentMessage],
        ayahs: list[ResearchAgentAyah],
        related_terms: list[ResearchRelatedTerm],
        searches: list[ResearchSearchItem],
        answer_language: str,
        focus_ayah_id: int | None = None,
    ) -> AnswerReview:
        return AnswerReview(
            answer=self.synthesize_answer(messages, ayahs, related_terms, searches, answer_language),
            keep_ayah_ids=[ayah.ayah_id for ayah in ayahs],
        )

class OllamaResearchLlmProvider(ResearchLlmProvider):
    def __init__(self, settings: ResearchRuntimeSettings | None = None) -> None:
        runtime = settings or build_runtime_settings()
        self.base_url = runtime.base_url
        self.chat_model = runtime.chat_model
        self.embed_model = runtime.embed_model
        self.timeout = runtime.timeout
        self.api_key = runtime.api_key
        self.thinking = runtime.thinking
        self.usage = UsageAccumulator()

    def _post_json(self, path: str, payload: dict[str, Any], *, stage: str = "request", model: str = "") -> dict[str, Any]:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        req = request.Request(
            f"{self.base_url}{path}",
            data=body,
            headers=headers,
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=self.timeout) as response:
                parsed = json.loads(response.read().decode("utf-8"))
                if isinstance(parsed, dict):
                    self.usage.add_step(stage, model or str(payload.get("model") or ""), parsed)
                return parsed
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise ResearchProviderUnavailable(
                _bounded_provider_error(f"Ollama request failed with HTTP {exc.code}: {detail}")
            ) from exc
        except (error.URLError, TimeoutError, OSError) as exc:
            raise ResearchProviderUnavailable(
                _bounded_provider_error(f"Ollama is unavailable at {self.base_url}: {exc}")
            ) from exc
        except json.JSONDecodeError as exc:
            raise ResearchProviderResponseError("Ollama returned invalid JSON.") from exc

    def complete_json(self, system: str, user: str, *, stage: str) -> str:
        return self._chat(
            [{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.0,
            stage=stage,
        )

    def _chat(self, messages: list[dict[str, str]], *, temperature: float = 0.1, stage: str = "chat") -> str:
        payload = {
            "model": self.chat_model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": temperature},
        }
        if self.thinking:
            # Ollama: true/false, or a named level for the models that take one (gpt-oss).
            payload["think"] = (
                False if self.thinking == "off" else self.thinking if "gpt-oss" in self.chat_model.lower() else True
            )
        try:
            response = self._post_json("/api/chat", payload, stage=stage, model=self.chat_model)
        except ResearchProviderUnavailable as exc:
            # A model that can't think refuses the field: asked again without it.
            if "think" not in payload or "think" not in str(exc).lower():
                raise
            payload.pop("think")
            response = self._post_json("/api/chat", payload, stage=stage, model=self.chat_model)
        content = response.get("message", {}).get("content")
        if not isinstance(content, str) or not content.strip():
            raise ResearchProviderResponseError("Ollama returned an empty chat response.")
        return content.strip()

    def provider_info(self) -> ResearchProviderInfo:
        return ResearchProviderInfo(
            provider="ollama",
            transport="cloud_api" if self.base_url.startswith("https://") else "local_api",
            base_url=self.base_url,
            chat_model=self.chat_model,
            embed_model=self.embed_model or None,
            authenticated=bool(self.api_key),
        )

    def usage_summary(self) -> ResearchUsageSummary:
        return self.usage.as_summary()

    def list_models(self) -> list[OllamaModelItem]:
        payload = self._get_json("/api/tags")
        models = payload.get("models")
        items = build_model_items_from_tags_payload(models)
        items = merge_model_catalogs(
            items,
            [
                make_model_item(self.chat_model, is_cloud=self.base_url.startswith("https://")),
                make_model_item(self.embed_model),
            ],
        )
        if self.base_url.startswith("https://"):
            items = merge_model_catalogs(items, get_public_ollama_cloud_catalog(timeout=min(self.timeout, 10.0)))
        return sort_model_catalog(items)

    def _get_json(self, path: str) -> dict[str, Any]:
        headers = {"Accept": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        req = request.Request(f"{self.base_url}{path}", headers=headers, method="GET")
        try:
            with request.urlopen(req, timeout=self.timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise ResearchProviderUnavailable(
                _bounded_provider_error(f"Ollama request failed with HTTP {exc.code}: {detail}")
            ) from exc
        except (error.URLError, TimeoutError, OSError) as exc:
            raise ResearchProviderUnavailable(
                _bounded_provider_error(f"Ollama is unavailable at {self.base_url}: {exc}")
            ) from exc
        except json.JSONDecodeError as exc:
            raise ResearchProviderResponseError("Ollama returned invalid JSON.") from exc

    def expand_search_candidates(
        self,
        messages: list[ResearchAgentMessage],
        quran_terms: list[QuranTermCandidate],
        answer_language: str,
    ) -> CandidateExpansion:
        payload = {
            "conversation": [dump_model(message) for message in messages],
            "quran_term_candidates": [
                {"type": term.type, "text": term.text, "root_id": term.root_id, "score": term.score}
                for term in quran_terms[:36]
            ],
            "answer_language": answer_language,
        }
        content = self._chat(
            [
                {
                    "role": "system",
                    "content": (
                        "You are the first stage of a Quran research planner. Your only job is to find the "
                        "Quranic vocabulary (roots, words, phrases as they occur in the Quran) that could answer "
                        "the user's question. Be permissive and exploratory. Use the user's wording as the "
                        "highest priority and the quran_term_candidates (taken from the Quran's own vocabulary) "
                        "as hints; think of the Quran's own expressions for the idea, its synonyms and opposites. "
                        "Do not answer the user and do not decide yet which terms are best. "
                        "Return strict JSON only with this shape: "
                        '{"related_terms":[{"type":"root|word|phrase","text":"...","reason":"..."}],'
                        '"searches":[{"mode":"root|exact","query":"...","reason":"..."}]}. '
                        "Include several plausible Quranic candidates, even if some may later be rejected. "
                        "When you return an Arabic root query, write it without spaces or separators."
                    ),
                },
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            temperature=0.2,
            stage="expand_candidates",
        )
        return parse_candidate_expansion(content, quran_terms)

    def create_search_plan(
        self,
        messages: list[ResearchAgentMessage],
        quran_terms: list[QuranTermCandidate],
        expanded_candidates: CandidateExpansion,
        answer_language: str,
    ) -> SearchPlan:
        payload = {
            "conversation": [dump_model(message) for message in messages],
            "quran_term_candidates": [
                {"type": term.type, "text": term.text, "root_id": term.root_id}
                for term in quran_terms[:30]
            ],
            "expanded_candidates": {
                "related_terms": [dump_model(term) for term in expanded_candidates.related_terms[:18]],
                "searches": [dump_model(search) for search in expanded_candidates.searches[:18]],
            },
            "answer_language": answer_language,
        }
        content = self._chat(
            [
                {
                    "role": "system",
                    "content": (
                        "You are the second stage of a Quran research planner. Choose the best Quranic candidates "
                        "from the user's question first, then the broad candidate list. "
                        "Do not answer the user. "
                        "Return strict JSON only with this shape: "
                        '{"status":"needs_clarification|search","clarifying_question":null|string,'
                        '"related_terms":[{"type":"root|word|phrase","text":"...","reason":"..."}],'
                        '"searches":[{"mode":"root|exact","query":"...","reason":"..."}]}. '
                        "Prefer a small, focused set of strong candidates over a broad noisy set. "
                        "When you return an Arabic root query, write the root letters without spaces or separators "
                        "(example: صلو, not ص ل و). "
                        "If the intent is broad or has multiple plausible Quranic themes, choose needs_clarification "
                        "and ask exactly one focused question that mentions the most likely candidate themes or terms. "
                        "Do not ask a generic clarification question."
                    ),
                },
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            temperature=0.05,
            stage="plan_search",
        )
        return parse_search_plan(content, quran_terms, answer_language)

    def synthesize_answer(
        self,
        messages: list[ResearchAgentMessage],
        ayahs: list[ResearchAgentAyah],
        related_terms: list[ResearchRelatedTerm],
        searches: list[ResearchSearchItem],
        answer_language: str,
    ) -> str:
        payload = {
            "conversation": [dump_model(message) for message in messages],
            "answer_language": answer_language,
            "related_terms": [dump_model(term) for term in related_terms],
            "searches": [dump_model(search) for search in searches],
            "ayahs": [
                {
                    "surah": ayah.surah,
                    "surah_id": ayah.surah_id,
                    "ayah": ayah.ayah,
                    "text": ayah.text,
                    "matched_terms": ayah.matched_terms,
                }
                for ayah in ayahs
            ],
        }
        return self._chat(
            [
                {
                    "role": "system",
                    "content": (
                        QURAN_ONLY_ANSWER_RULES
                    ),
                },
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            temperature=0.15,
            stage="synthesize_strict",
        )

    def finalize_answer(
        self,
        messages: list[ResearchAgentMessage],
        ayahs: list[ResearchAgentAyah],
        related_terms: list[ResearchRelatedTerm],
        searches: list[ResearchSearchItem],
        answer_language: str,
        focus_ayah_id: int | None = None,
    ) -> AnswerReview:
        payload: dict[str, Any] = {
            "conversation": [dump_model(message) for message in messages],
            "answer_language": answer_language,
            "related_terms": [dump_model(term) for term in related_terms],
            "searches": [dump_model(search) for search in searches],
            "ayahs": build_ayah_payload(ayahs, window=CONTEXT_WINDOW, focus_ayah_id=focus_ayah_id),
        }
        if focus_ayah_id is not None:
            payload["focus_ayah_id"] = focus_ayah_id
        content = self._chat(
            [
                {
                    "role": "system",
                    "content": (
                        "You are the final answer stage of a Quran research tool. "
                        + QURAN_ONLY_ANSWER_RULES
                        + " "
                        + QURAN_CONTEXT_RULE
                        + " Return strict JSON only with this shape: "
                        '{"answer":"...","keep_ayah_ids":[1,2],"discard_ayah_ids":[3]}. '
                        "The answer and the kept ayahs must stay aligned. "
                        "Keep only the ayahs the answer relies on; discard ayahs that are off-topic, misleading, "
                        "or driven by a weak root match."
                    ),
                },
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            temperature=0.1,
            stage="finalize_strict",
        )
        try:
            review = parse_answer_review(content, ayahs, "")
            if review.answer.strip():
                return review
        except ResearchProviderResponseError:
            pass
        fallback_answer = self.synthesize_answer(messages, ayahs, related_terms, searches, answer_language)
        return AnswerReview(answer=fallback_answer, keep_ayah_ids=[ayah.ayah_id for ayah in ayahs])

def infer_model_capabilities(name: str, *, is_cloud: bool = False) -> list[str]:
    lowered = name.lower()
    capabilities: list[str] = []
    if "embed" in lowered:
        capabilities.append("embedding")
    else:
        capabilities.append("chat")
    if is_cloud or "cloud" in lowered:
        capabilities.append("cloud")
    return capabilities


def make_model_item(
    name: str,
    *,
    size: int | None = None,
    modified_at: str | None = None,
    digest: str | None = None,
    is_cloud: bool | None = None,
    capabilities: list[str] | None = None,
) -> OllamaModelItem:
    cleaned_name = (name or "").strip()
    inferred_is_cloud = bool(is_cloud) or ("cloud" in cleaned_name.lower())
    model_capabilities = capabilities or infer_model_capabilities(cleaned_name, is_cloud=inferred_is_cloud)
    normalized_capabilities = sorted({item for item in model_capabilities if item})
    return OllamaModelItem(
        name=cleaned_name,
        size=size,
        modified_at=modified_at,
        digest=digest,
        is_cloud=inferred_is_cloud,
        capabilities=normalized_capabilities,
    )


def build_model_items_from_tags_payload(models: Any) -> list[OllamaModelItem]:
    if not isinstance(models, list):
        return []

    items: list[OllamaModelItem] = []
    for model in models:
        if not isinstance(model, dict):
            continue
        name = str(model.get("name") or "").strip()
        if not name:
            continue
        items.append(
            make_model_item(
                name,
                size=int(model.get("size") or 0) or None,
                modified_at=str(model.get("modified_at") or "") or None,
                digest=str(model.get("digest") or "") or None,
            )
        )
    return items


def merge_model_catalogs(*catalogs: list[OllamaModelItem]) -> list[OllamaModelItem]:
    merged: dict[str, OllamaModelItem] = {}
    for catalog in catalogs:
        for item in catalog:
            if not item.name:
                continue
            existing = merged.get(item.name)
            if existing is None:
                merged[item.name] = item
                continue
            merged[item.name] = OllamaModelItem(
                name=item.name,
                size=item.size if item.size is not None else existing.size,
                modified_at=item.modified_at or existing.modified_at,
                digest=item.digest or existing.digest,
                is_cloud=existing.is_cloud or item.is_cloud,
                capabilities=sorted(set(existing.capabilities).union(item.capabilities)),
            )
    return list(merged.values())


def sort_model_catalog(models: list[OllamaModelItem]) -> list[OllamaModelItem]:
    return sorted(
        models,
        key=lambda item: (
            0 if item.is_cloud else 1,
            0 if "chat" in item.capabilities else 1,
            item.name.lower(),
        ),
    )


def parse_public_cloud_library_slugs(html: str) -> list[str]:
    slugs = re.findall(r'href="/library/([a-zA-Z0-9._-]+)"', html)
    ordered_unique: list[str] = []
    seen: set[str] = set()
    for slug in slugs:
        if slug in seen:
            continue
        seen.add(slug)
        ordered_unique.append(slug)
    return ordered_unique


def parse_public_cloud_model_tags(slug: str, html: str) -> list[OllamaModelItem]:
    matches = re.findall(rf"\b{re.escape(slug)}:[a-zA-Z0-9._-]*cloud\b", html)
    if not matches and re.search(rf"\bollama run {re.escape(slug)}:cloud\b", html):
        matches = [f"{slug}:cloud"]
    ordered_unique: list[str] = []
    seen: set[str] = set()
    for model_name in matches:
        if model_name in seen:
            continue
        seen.add(model_name)
        ordered_unique.append(model_name)
    return [make_model_item(model_name, is_cloud=True, capabilities=["chat", "cloud"]) for model_name in ordered_unique]


def fetch_public_ollama_cloud_catalog(timeout: float = 10.0) -> list[OllamaModelItem]:
    index_request = request.Request(PUBLIC_OLLAMA_CLOUD_CATALOG_URL, headers={"Accept": "text/html"}, method="GET")
    with request.urlopen(index_request, timeout=timeout) as response:
        index_html = response.read().decode("utf-8", errors="replace")

    items: list[OllamaModelItem] = []
    for slug in parse_public_cloud_library_slugs(index_html):
        library_request = request.Request(f"{PUBLIC_OLLAMA_LIBRARY_URL}{slug}", headers={"Accept": "text/html"}, method="GET")
        with request.urlopen(library_request, timeout=timeout) as response:
            library_html = response.read().decode("utf-8", errors="replace")
        items.extend(parse_public_cloud_model_tags(slug, library_html))
    return sort_model_catalog(merge_model_catalogs(items))


_public_ollama_cloud_catalog_lock = threading.Lock()
_public_ollama_cloud_refresh_in_progress = False


def _refresh_public_ollama_cloud_catalog(timeout: float) -> None:
    global _public_ollama_cloud_catalog_cache, _public_ollama_cloud_refresh_in_progress
    try:
        catalog = fetch_public_ollama_cloud_catalog(timeout=timeout)
        _public_ollama_cloud_catalog_cache = (time.time(), catalog)
    except (error.HTTPError, error.URLError, TimeoutError, OSError):
        pass  # keep the previous (stale) cache on failure
    finally:
        with _public_ollama_cloud_catalog_lock:
            _public_ollama_cloud_refresh_in_progress = False


def get_public_ollama_cloud_catalog(timeout: float = 10.0) -> list[OllamaModelItem]:
    """Stale-while-revalidate: never block the request on the ollama.com scrape.

    Returns whatever is cached immediately (empty on a cold start) and refreshes
    in a background thread when the cache is missing or older than the TTL.
    """
    global _public_ollama_cloud_refresh_in_progress

    cached = _public_ollama_cloud_catalog_cache
    now = time.time()
    is_fresh = bool(cached) and now - cached[0] < PUBLIC_OLLAMA_CLOUD_CACHE_TTL_SECONDS

    if not is_fresh:
        with _public_ollama_cloud_catalog_lock:
            if not _public_ollama_cloud_refresh_in_progress:
                _public_ollama_cloud_refresh_in_progress = True
                threading.Thread(
                    target=_refresh_public_ollama_cloud_catalog,
                    args=(timeout,),
                    daemon=True,
                ).start()

    return cached[1] if cached else []


_provider_override: ResearchLlmProvider | None = None


def set_llm_provider_for_tests(provider: ResearchLlmProvider | None) -> None:
    global _provider_override
    _provider_override = provider


MAX_PROVIDER_ERROR_CHARS = 200


def _bounded_provider_error(message: str) -> str:
    """Collapse whitespace and cap a provider error so a reflected upstream body
    (or client-supplied host) can't turn a 5xx detail into an exfiltration oracle."""
    collapsed = " ".join(message.split())
    if len(collapsed) <= MAX_PROVIDER_ERROR_CHARS:
        return collapsed
    return collapsed[: MAX_PROVIDER_ERROR_CHARS - 1] + "…"


def _host_allowed(host: str, allowed: set[str]) -> bool:
    return any(host == entry or host.endswith("." + entry) for entry in allowed)


def _validate_client_base_url(raw: str) -> str:
    """Validate a client-supplied Ollama base URL override.

    Only https:// URLs whose host is on the allowlist are honored — this closes
    the SSRF surface (internal/metadata endpoints) opened by the override header.
    The server's own env base URL bypasses this and is never validated here.
    """
    candidate = raw.strip().rstrip("/")
    parsed = urlsplit(candidate)
    if parsed.scheme != "https":
        raise ResearchProviderUnavailable("Custom Ollama base URL must use https://.")
    host = (parsed.hostname or "").lower()
    if not host or not _host_allowed(host, config.get_ollama_allowed_hosts()):
        raise ResearchProviderUnavailable("The requested Ollama host is not allowed.")
    return candidate


def build_provider_runtime(
    provider: str, api_key: str | None, model: str | None, thinking: str | None = None
) -> ResearchRuntimeSettings:
    """A reader's own AI provider (llm_providers.PROVIDERS): its fixed address,
    the reader's key only (never the server's), the model they chose."""
    from src.app.services import llm_providers

    spec = llm_providers.provider_spec(provider)
    if spec is None:
        raise ResearchProviderUnavailable("Unknown AI provider.")
    key = (api_key or "").strip()
    if not key:
        raise ResearchProviderUnavailable(f"Connect {spec.name} in Settings: its key is missing.")
    level = llm_providers.normalize_thinking(thinking)
    if spec.dialect == "ollama":
        runtime = build_runtime_settings(api_key=key, chat_model=model, base_url=spec.base_url)
        runtime.thinking = level
        return runtime
    return ResearchRuntimeSettings(
        provider_name=spec.id,
        base_url=spec.base_url,
        chat_model=(model or "").strip(),
        embed_model="",
        timeout=config.get_llm_timeout_seconds(),
        api_key=key,
        thinking=level,
    )


def build_runtime_settings(
    *,
    api_key: str | None = None,
    chat_model: str | None = None,
    embed_model: str | None = None,
    base_url: str | None = None,
    timeout: float | None = None,
) -> ResearchRuntimeSettings:
    # A non-empty client `base_url` is an explicit override: validate it against
    # the allowlist and NEVER attach the server key to that client-directed
    # endpoint (only a client-supplied key is honored). An absent/blank override
    # falls back to the trusted server env config, which may carry the server key.
    client_override = bool(base_url and base_url.strip())
    if client_override:
        resolved_base_url = _validate_client_base_url(base_url)  # type: ignore[arg-type]
        resolved_api_key = (api_key or "").strip()
    else:
        resolved_base_url = config.get_ollama_base_url().strip().rstrip("/")
        resolved_api_key = (api_key if api_key is not None else config.get_ollama_api_key()).strip()
    return ResearchRuntimeSettings(
        provider_name=config.get_llm_provider(),
        base_url=resolved_base_url,
        chat_model=(chat_model or config.get_llm_chat_model()).strip(),
        embed_model=(embed_model or config.get_llm_embed_model()).strip(),
        timeout=timeout if timeout is not None else config.get_llm_timeout_seconds(),
        api_key=resolved_api_key,
    )


def get_llm_provider(settings: ResearchRuntimeSettings | None = None) -> ResearchLlmProvider:
    if _provider_override is not None:
        return _provider_override

    runtime = settings or build_runtime_settings()
    provider_name = runtime.provider_name
    from src.app.services import llm_providers

    spec = llm_providers.provider_spec(provider_name)
    if spec is not None and spec.dialect == "openai":
        return llm_providers.make_openai_compatible_provider(runtime)
    if provider_name in {"ollama", "local"}:
        if runtime.base_url.startswith("https://") and not runtime.api_key:
            raise ResearchProviderUnavailable("Ollama cloud API key is required for direct access to ollama.com.")
        return OllamaResearchLlmProvider(runtime)
    if provider_name in {"none", "disabled", "off"}:
        raise ResearchProviderUnavailable("Research agent LLM provider is disabled.")
    raise ResearchProviderUnavailable(f"Unsupported research agent LLM provider: {provider_name}")


def build_limits_info() -> ResearchLimitsInfo:
    return ResearchLimitsInfo(
        summary="Ollama cloud usage and concurrency limits vary by plan, and remaining quota is not exposed by a public API.",
        plan_reference_url="https://ollama.com/cloud",
        notes=[
            "Free is intended for light cloud usage.",
            "Pro increases cloud usage and concurrent cloud model capacity.",
            "Max increases usage further and allows heavier sustained workloads.",
            "Official docs describe hourly or weekly cloud limits depending on the surface, so treat this panel as guidance rather than exact live quota.",
        ],
    )


def get_research_agent_settings(runtime: ResearchRuntimeSettings | None = None) -> ResearchAgentSettingsResponse:
    provider = get_llm_provider(runtime)
    return ResearchAgentSettingsResponse(
        provider=provider.provider_info(),
        available_models=provider.list_models(),
        limits=build_limits_info(),
    )


def dump_model(model: Any) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


def parse_json_object(text: str) -> dict[str, Any]:
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match:
            raise ResearchProviderResponseError("Provider response did not contain a JSON object.") from None
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            raise ResearchProviderResponseError("Provider response contained invalid JSON.") from exc

    if not isinstance(parsed, dict):
        raise ResearchProviderResponseError("Provider response JSON must be an object.")
    return parsed


def parse_search_plan(text: str, fallback_terms: list[QuranTermCandidate], answer_language: str = "english") -> SearchPlan:
    try:
        parsed = parse_json_object(text)
    except ResearchProviderResponseError:
        # Malformed LLM output must not surface as a 502 — degrade to a
        # deterministic search plan built from the retrieved term candidates.
        parsed = {}
    status = "needs_clarification" if parsed.get("status") == "needs_clarification" else "search"
    clarifying_question = coerce_optional_text(parsed.get("clarifying_question"))

    related_terms = []
    for item in coerce_list(parsed.get("related_terms")):
        if not isinstance(item, dict):
            continue
        term_type = coerce_term_type(item.get("type"))
        term_text = coerce_optional_text(item.get("text"))
        if not term_text:
            continue
        related_terms.append(
            ResearchRelatedTerm(
                type=term_type,
                text=term_text,
                reason=coerce_optional_text(item.get("reason")),
            )
        )

    searches = []
    for item in coerce_list(parsed.get("searches")):
        if not isinstance(item, dict):
            continue
        query = coerce_optional_text(item.get("query"))
        if not query:
            continue
        searches.append(
            ResearchSearchItem(
                mode=coerce_search_mode(item.get("mode"), query),
                query=query,
                reason=coerce_optional_text(item.get("reason")),
            )
        )

    clarification_terms = related_terms or [
        ResearchRelatedTerm(type=coerce_term_type(term.type), text=term.text, root_id=term.root_id)
        for term in fallback_terms[:4]
    ]

    if status == "needs_clarification":
        if question_is_generic_for_terms(clarifying_question, clarification_terms):
            clarifying_question = build_contextual_clarifying_question(clarification_terms, answer_language)
        if clarifying_question:
            return SearchPlan(
                status=status,
                clarifying_question=clarifying_question,
                related_terms=related_terms,
                searches=[],
            )

    if not related_terms:
        related_terms = [
            ResearchRelatedTerm(type=coerce_term_type(term.type), text=term.text, root_id=term.root_id)
            for term in fallback_terms[:8]
        ]

    if not searches:
        searches = [
            ResearchSearchItem(
                mode="root" if term.type == "root" else "exact",
                query=term.text,
                reason="Fallback from Quran term candidates.",
            )
            for term in fallback_terms[:6]
        ]

    return SearchPlan(status="search", related_terms=dedupe_related_terms(related_terms), searches=dedupe_searches(searches))


def parse_candidate_expansion(text: str, fallback_terms: list[QuranTermCandidate]) -> CandidateExpansion:
    try:
        parsed = parse_json_object(text)
    except ResearchProviderResponseError:
        # Malformed LLM output → fall back to deterministic candidates below.
        parsed = {}

    related_terms = []
    for item in coerce_list(parsed.get("related_terms")):
        if not isinstance(item, dict):
            continue
        term_text = coerce_optional_text(item.get("text"))
        if not term_text:
            continue
        related_terms.append(
            ResearchRelatedTerm(
                type=coerce_term_type(item.get("type")),
                text=term_text,
                reason=coerce_optional_text(item.get("reason")),
            )
        )

    searches = []
    for item in coerce_list(parsed.get("searches")):
        if not isinstance(item, dict):
            continue
        query = coerce_optional_text(item.get("query"))
        if not query:
            continue
        searches.append(
            ResearchSearchItem(
                mode=coerce_search_mode(item.get("mode"), query),
                query=query,
                reason=coerce_optional_text(item.get("reason")),
            )
        )

    if not related_terms:
        related_terms = [
            ResearchRelatedTerm(type=coerce_term_type(term.type), text=term.text, root_id=term.root_id)
            for term in fallback_terms[:12]
        ]
    if not searches:
        searches = [
            ResearchSearchItem(mode="root" if term.type == "root" else "exact", query=term.text, reason="Fallback candidate.")
            for term in fallback_terms[:10]
        ]

    return CandidateExpansion(
        related_terms=dedupe_related_terms(related_terms),
        searches=dedupe_searches(searches),
    )


def parse_answer_review(text: str, ayahs: list[ResearchAgentAyah], fallback_answer: str) -> AnswerReview:
    parsed = parse_json_object(text)
    answer = coerce_optional_text(parsed.get("answer")) or fallback_answer
    ayah_ids = {ayah.ayah_id for ayah in ayahs}

    keep_ayah_ids = [int(value) for value in coerce_list(parsed.get("keep_ayah_ids")) if isinstance(value, int) and value in ayah_ids]
    discard_ayah_ids = [int(value) for value in coerce_list(parsed.get("discard_ayah_ids")) if isinstance(value, int) and value in ayah_ids]

    if not keep_ayah_ids:
        keep_ayah_ids = [ayah.ayah_id for ayah in ayahs]

    return AnswerReview(
        answer=answer,
        keep_ayah_ids=list(dict.fromkeys(keep_ayah_ids)),
        discard_ayah_ids=list(dict.fromkeys(discard_ayah_ids)),
    )


def coerce_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def coerce_optional_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None


def question_is_generic_for_terms(question: str | None, terms: list[ResearchRelatedTerm]) -> bool:
    if not question:
        return True

    normalized_question = quran_service.normalize_query_search(question)
    if not normalized_question:
        return True

    term_texts = [
        quran_service.normalize_query_search(term.text)
        for term in terms
        if isinstance(term.text, str) and term.text.strip()
    ]
    term_texts = [term_text for term_text in term_texts if term_text]
    if not term_texts:
        return False

    return not any(term_text in normalized_question for term_text in term_texts[:3])


def build_contextual_clarifying_question(terms: list[ResearchRelatedTerm], answer_language: str) -> str | None:
    labels = []
    seen = set()
    for term in terms:
        label = term.text.strip()
        if not label or label in seen:
            continue
        labels.append(label)
        seen.add(label)
        if len(labels) >= 3:
            break

    if len(labels) >= 2:
        if answer_language == "arabic":
            return f"هل تقصد في سؤالك معنى يتعلق بـ {labels[0]} أم بـ {labels[1]}؟"
        if answer_language == "french":
            return f"Parlez-vous plutot de {labels[0]} ou de {labels[1]} ?"
        return f"Are you asking more about {labels[0]} or about {labels[1]}?"

    if len(labels) == 1:
        if answer_language == "arabic":
            return f"هل تريد توجيه البحث حول {labels[0]} نفسه أم حول معنى مرتبط به في الآيات؟"
        if answer_language == "french":
            return f"Souhaitez-vous centrer la recherche sur {labels[0]} lui-meme ou sur un sens voisin dans les ayahs ?"
        return f"Do you want the search centered on {labels[0]} itself, or on a nearby meaning in the ayahs?"

    return None


def coerce_term_type(value: Any) -> str:
    if value in {"root", "word", "phrase"}:
        return value
    return "word"


def coerce_search_mode(value: Any, query: str) -> str:
    if value == "root":
        return "root"
    if value == "exact":
        return "exact"
    return "exact" if " " in query.strip() else "root"


def dedupe_related_terms(terms: Iterable[ResearchRelatedTerm]) -> list[ResearchRelatedTerm]:
    seen = set()
    deduped = []
    for term in terms:
        key = (term.type, term.text)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(term)
    return deduped[:12]


def dedupe_searches(searches: Iterable[ResearchSearchItem]) -> list[ResearchSearchItem]:
    seen = set()
    deduped = []
    for search in searches:
        query = search.query.strip()
        if not query or len(query) > config.MAX_QUERY_LENGTH:
            continue
        key = (search.mode, query)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(ResearchSearchItem(mode=search.mode, query=query, reason=search.reason))
    return deduped[:8]


def normalize_root_query(query: str) -> str:
    """Normalize root-style queries such as r-h-m or ص ل و."""
    query = query.strip()
    if not query:
        return query

    if SPACED_ARABIC_ROOT_RE.fullmatch(query):
        return quran_service.normalize_query_search(re.sub(r"[\s\-_/,،]+", "", query))

    if not quran_service.contains_latin_text(query):
        return query

    compact = re.sub(r"[^A-Za-z0-9']", "", query)
    return compact or query


def resolve_search_query(cursor: sqlite3.Cursor, search: ResearchSearchItem, mushaf: int) -> str:
    """Translate planner-produced Latin searches into concrete Arabic Quran queries when possible."""
    query = search.query.strip()
    if search.mode == "root":
        normalized_query = normalize_root_query(query)
        if not quran_service.contains_latin_text(normalized_query):
            return normalized_query
        suggestions = quran_service.build_root_suggestions_by_latin(cursor, normalized_query, mushaf, 5)
        for suggestion in suggestions:
            if suggestion.get("type") == "root" and suggestion.get("text"):
                return str(suggestion["text"])
        return normalized_query

    if not query or not quran_service.contains_latin_text(query):
        return query

    if " " in query:
        resolved_tokens = []
        for token in query.split():
            token_suggestions = quran_service.build_word_suggestions_by_latin(cursor, token, mushaf, 3, False)
            resolved_tokens.append(str(token_suggestions[0]["text"]) if token_suggestions else token)
        return " ".join(resolved_tokens).strip()

    suggestions = quran_service.build_word_suggestions_by_latin(cursor, query, mushaf, 5, False)
    for suggestion in suggestions:
        if suggestion.get("type") == "word" and suggestion.get("text"):
            return str(suggestion["text"])
    return query


def latest_user_message(messages: list[ResearchAgentMessage]) -> str:
    for message in reversed(messages):
        if message.role == "user":
            return message.content.strip()
    raise ValueError("Research agent requests must include at least one user message.")


def _clip_context_text(text: str) -> str:
    return text if len(text) <= CONTEXT_AYAH_CHARS else text[:CONTEXT_AYAH_CHARS].rstrip() + " …"


def build_ayah_payload(
    ayahs: list[ResearchAgentAyah],
    *,
    window: int,
    focus_ayah_id: int | None = None,
) -> list[dict[str, Any]]:
    """Final-stage ayah entries, each with its surah context and neighbouring ayahs.

    Neighbours come straight from the Quran DB (same mushaf, same surah), so the
    model reads every ayah in its passage, from the Quran and nothing else.
    """
    entries: list[dict[str, Any]] = []
    for ayah in ayahs:
        entry: dict[str, Any] = {
            "ayah_id": ayah.ayah_id,
            "surah": ayah.surah,
            "surah_id": ayah.surah_id,
            "ayah": ayah.ayah,
            "text": ayah.text,
            "matched_terms": ayah.matched_terms,
        }
        span = FOCUS_CONTEXT_WINDOW if ayah.ayah_id == focus_ayah_id else window
        context = quran_service.get_ayah_context(ayah.mushaf_id, ayah.surah_id, ayah.ayah, before=span, after=span)
        if context is not None:
            surah = context["surah"]
            entry["context"] = {
                "surah": {
                    "name": surah["name_arabic"],
                    "name_english": surah["name_english"],
                    "type": surah["type"],
                    "ayah_count": surah["ayah_count"],
                },
                "position": f"{ayah.ayah}/{surah['ayah_count']}",
                "before": [{"ayah": n["ayah"], "text": _clip_context_text(n["text"])} for n in context["before"]],
                "after": [{"ayah": n["ayah"], "text": _clip_context_text(n["text"])} for n in context["after"]],
            }
        entries.append(entry)
    return entries


def resolve_focus_ayah(req: ResearchAgentRequest) -> ResearchAgentAyah | None:
    if req.focus is None:
        return None
    verse = quran_service.get_ayah_verse(req.mushaf, req.focus.surah, req.focus.ayah)
    return ResearchAgentAyah(**verse, matched_terms=[]) if verse else None


def detect_answer_language(query: str, requested_language: str) -> str:
    requested_language = requested_language.strip().lower()
    if requested_language and requested_language != "auto":
        return requested_language
    if re.search(r"[\u0600-\u06FF]", query):
        return "arabic"
    if re.search(r"\b(le|la|les|des|une|pourquoi|comment|dans|avec|est-ce)\b", query, flags=re.IGNORECASE):
        return "french"
    return "english"


def retrieve_quran_terms(query: str, mushaf: int, limit: int = 30) -> list[QuranTermCandidate]:
    """Quranic vocabulary (roots and words) matching the question, from the Quran database only."""
    return dedupe_quran_term_candidates(retrieve_quran_terms_from_quran_db(query, mushaf, limit))[:limit]


def retrieve_quran_terms_from_quran_db(query: str, mushaf: int, limit: int) -> list[QuranTermCandidate]:
    if limit <= 0:
        return []
    cursor = quran_service.get_db().cursor()
    tokens = quran_service.normalize_query_search(query).split()
    tokens = [token for token in tokens if len(token) >= 2][:8]
    candidates: list[QuranTermCandidate] = []

    for token in tokens:
        cursor.execute(
            """
            SELECT root_text, id
            FROM roots
            WHERE root_simple LIKE ?
            ORDER BY LENGTH(root_simple), root_text
            LIMIT ?
            """,
            (f"{token}%", max(1, limit // 2)),
        )
        candidates.extend(
            QuranTermCandidate(type="root", text=row["root_text"], root_id=row["id"], score=0.4)
            for row in cursor.fetchall()
        )
        for item in quran_service.build_root_suggestions_by_surface_query(cursor, token, mushaf, max(1, limit // 3)):
            candidates.append(QuranTermCandidate(type="root", text=item["text"], score=0.38))

        cursor.execute(
            """
            SELECT DISTINCT wo.word_text
            FROM word_occurrences wo
            JOIN ayahs a ON a.id = wo.ayah_id
            WHERE a.mushaf_id = ? AND wo.word_simple LIKE ?
            ORDER BY LENGTH(wo.word_simple), wo.word_text
            LIMIT ?
            """,
            (mushaf, f"{token}%", max(1, limit // 2)),
        )
        candidates.extend(QuranTermCandidate(type="word", text=row["word_text"], score=0.3) for row in cursor.fetchall())

    return candidates


def dedupe_quran_term_candidates(candidates: Iterable[QuranTermCandidate]) -> list[QuranTermCandidate]:
    best_by_key: dict[tuple[str, str], QuranTermCandidate] = {}
    for candidate in candidates:
        key = (candidate.type, candidate.text)
        current = best_by_key.get(key)
        if current is None or candidate.score > current.score:
            best_by_key[key] = candidate
    return sorted(best_by_key.values(), key=lambda item: item.score, reverse=True)


def execute_searches(searches: list[ResearchSearchItem], mushaf: int, max_results: int) -> tuple[list[ResearchSearchItem], list[ResearchAgentAyah]]:
    cursor = quran_service.get_db().cursor()
    executed_searches: list[ResearchSearchItem] = []
    ayahs_by_id: dict[int, ResearchAgentAyah] = {}

    for search in searches:
        query = resolve_search_query(cursor, search, mushaf)
        if not query:
            continue
        q_simple = quran_service.build_exact_query_simple(query) if search.mode == "exact" else quran_service.normalize_query_search(query)
        results, _did_you_mean = quran_service.build_paginated_search_results(
            cursor,
            query,
            q_simple,
            search.mode,
            mushaf,
            page_size=max_results,
        )
        result_count = sum(result["total_verses"] for result in results)
        executed_searches.append(
            ResearchSearchItem(
                mode=search.mode,
                query=query,
                reason=search.reason if query == search.query.strip() else f"{search.reason or 'Resolved from transliteration.'} -> {query}",
                result_count=result_count,
            )
        )

        for result in results:
            for verse in result["verses"]:
                existing = ayahs_by_id.get(verse["ayah_id"])
                if existing is not None:
                    if query not in existing.matched_terms:
                        existing.matched_terms.append(query)
                    existing.highlights = sorted(set(existing.highlights).union(verse.get("highlights", [])))
                    continue
                ayahs_by_id[verse["ayah_id"]] = ResearchAgentAyah(
                    ayah_id=verse["ayah_id"],
                    mushaf_id=verse["mushaf_id"],
                    surah=verse["surah"],
                    surah_id=verse["surah_id"],
                    ayah=verse["ayah"],
                    text=verse["text"],
                    global_index=verse["global_index"],
                    highlights=verse.get("highlights", []),
                    matched_terms=[query],
                )
                if len(ayahs_by_id) >= max_results:
                    return executed_searches, sorted(ayahs_by_id.values(), key=lambda item: item.global_index)

    return executed_searches, sorted(ayahs_by_id.values(), key=lambda item: item.global_index)[:max_results]


def filter_ayahs_by_review(ayahs: list[ResearchAgentAyah], review: AnswerReview) -> list[ResearchAgentAyah]:
    if not ayahs:
        return []

    keep_ids = set(review.keep_ayah_ids)
    discard_ids = set(review.discard_ayah_ids)

    # No review signal at all → keep the full evidence set.
    if not keep_ids and not discard_ids:
        return ayahs

    if keep_ids:
        filtered = [ayah for ayah in ayahs if ayah.ayah_id in keep_ids and ayah.ayah_id not in discard_ids]
    else:
        # Only discards were provided — keep everything not explicitly discarded
        # (the old code silently ignored a discard-only review and kept all).
        filtered = [ayah for ayah in ayahs if ayah.ayah_id not in discard_ids]

    # Never end with zero evidence: an over-aggressive keep list falls back to all.
    return filtered or ayahs


def build_no_results_answer(answer_language: str) -> str:
    if answer_language == "arabic":
        return "لم أجد آيات مطابقة للعبارات والجذور المقترحة. يمكن تضييق السؤال أو ذكر معنى أقرب."
    if answer_language == "french":
        return "Je n'ai pas trouvé d'ayah correspondant aux termes proposés. Une précision sur l'intention aiderait la recherche."
    return "I could not find matching ayahs for the proposed terms. Narrowing the intent would help the research."


def with_focus_note(messages: list[ResearchAgentMessage], focus: ResearchAgentAyah) -> list[ResearchAgentMessage]:
    """Append the focus ayah (reference + DB text) to the latest user message so
    every stage — retrieval, planning, final answer — knows which ayah is asked about."""
    note = f"\n\n[الآية المقصودة: سورة {focus.surah}، الآية {focus.ayah}: {focus.text}]"
    updated = list(messages)
    for index in range(len(updated) - 1, -1, -1):
        if updated[index].role == "user":
            updated[index] = ResearchAgentMessage(role="user", content=updated[index].content + note)
            break
    return updated


def merge_focus_ayah(focus: ResearchAgentAyah | None, ayahs: list[ResearchAgentAyah], max_results: int) -> list[ResearchAgentAyah]:
    """The focus ayah leads the evidence; search hits follow, without duplicates."""
    if focus is None:
        return ayahs
    others = [ayah for ayah in ayahs if ayah.ayah_id != focus.ayah_id]
    return [focus, *others][: max(1, max_results)]


def run_research_agent(req: ResearchAgentRequest, runtime: ResearchRuntimeSettings | None = None) -> ResearchAgentResponse:
    focus_ayah = resolve_focus_ayah(req)
    if req.focus is not None and focus_ayah is None:
        raise ValueError("The requested focus ayah does not exist in this mushaf.")
    messages = with_focus_note(req.messages, focus_ayah) if focus_ayah else req.messages
    user_query = latest_user_message(messages)
    answer_language = detect_answer_language(latest_user_message(req.messages), req.answer_language)
    provider = get_llm_provider(runtime)
    provider_info = provider.provider_info()

    # Search terms come from the question and the Quran's own vocabulary; no other source is read.
    quran_terms = retrieve_quran_terms(user_query, req.mushaf)
    expanded_candidates = provider.expand_search_candidates(messages, quran_terms, answer_language)
    plan = provider.create_search_plan(messages, quran_terms, expanded_candidates, answer_language)
    if not plan.related_terms:
        plan.related_terms = expanded_candidates.related_terms

    # A focus ayah is a precise question: never bounce it back for clarification.
    if plan.status == "needs_clarification" and plan.clarifying_question and focus_ayah is None:
        return ResearchAgentResponse(
            status="needs_clarification",
            mode="strict",
            clarifying_question=plan.clarifying_question,
            provider=provider_info,
            usage=provider.usage_summary(),
            related_terms=plan.related_terms,
        )

    searches = dedupe_searches(plan.searches)
    if not searches:
        searches = dedupe_searches(expanded_candidates.searches)
    if not searches:
        searches = dedupe_searches(
            ResearchSearchItem(mode="root" if term.type == "root" else "exact", query=term.text)
            for term in quran_terms[:6]
        )

    executed_searches, ayahs = execute_searches(searches, req.mushaf, req.max_results)
    ayahs = merge_focus_ayah(focus_ayah, ayahs, req.max_results)
    if not ayahs:
        return ResearchAgentResponse(
            status="no_results",
            mode="strict",
            answer=build_no_results_answer(answer_language),
            provider=provider_info,
            usage=provider.usage_summary(),
            related_terms=plan.related_terms,
            searches=executed_searches,
            ayahs=[],
        )

    # Only pass focus_ayah_id when set, so provider overrides without it keep working.
    focus_kwargs = {"focus_ayah_id": focus_ayah.ayah_id} if focus_ayah else {}
    review = provider.finalize_answer(
        messages, ayahs, plan.related_terms, executed_searches, answer_language, **focus_kwargs
    )

    kept = filter_ayahs_by_review(ayahs, review)
    ayahs = merge_focus_ayah(focus_ayah, kept, len(kept) + 1) if focus_ayah else kept
    return ResearchAgentResponse(
        status="answered",
        mode="strict",
        answer=review.answer,
        provider=provider_info,
        usage=provider.usage_summary(),
        related_terms=plan.related_terms,
        searches=executed_searches,
        ayahs=ayahs,
    )
