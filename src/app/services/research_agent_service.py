from __future__ import annotations

from dataclasses import dataclass, field
import json
import math
from pathlib import Path
import re
import sqlite3
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
    TafssirStructuredAnswer,
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


TAFSSIR_DISCLAIMER_AR = (
    "وضع التفسير التجريبي مخصص للتجربة فقط، وقد ينتج عنه أخطاء أو فهم غير دقيق. "
    "لا تعتمد عليه بوصفه تفسيراً معتمداً."
)


@dataclass
class SourceChunk:
    id: int
    title: str
    source_path: str
    content: str
    score: float


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
    tafssir: TafssirStructuredAnswer | None = None


@dataclass
class ResearchRuntimeSettings:
    provider_name: str
    base_url: str
    chat_model: str
    embed_model: str
    timeout: float
    api_key: str = ""


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


class ResearchLlmProvider:
    """Interface for research-agent LLM providers."""

    supports_embeddings = False

    def expand_search_candidates(
        self,
        messages: list[ResearchAgentMessage],
        source_chunks: list[SourceChunk],
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
        source_chunks: list[SourceChunk],
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

    def synthesize_tafssir_answer(
        self,
        messages: list[ResearchAgentMessage],
        ayahs: list[ResearchAgentAyah],
        related_terms: list[ResearchRelatedTerm],
        searches: list[ResearchSearchItem],
        source_chunks: list[SourceChunk],
        answer_language: str,
    ) -> str:
        raise NotImplementedError

    def embed_text(self, text: str) -> list[float]:
        raise ResearchProviderUnavailable("The configured provider does not support embeddings.")

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
    ) -> AnswerReview:
        return AnswerReview(
            answer=self.synthesize_answer(messages, ayahs, related_terms, searches, answer_language),
            keep_ayah_ids=[ayah.ayah_id for ayah in ayahs],
        )

    def finalize_tafssir_answer(
        self,
        messages: list[ResearchAgentMessage],
        ayahs: list[ResearchAgentAyah],
        related_terms: list[ResearchRelatedTerm],
        searches: list[ResearchSearchItem],
        source_chunks: list[SourceChunk],
        answer_language: str,
        tafssir_depth: str = "balanced",
    ) -> AnswerReview:
        return AnswerReview(
            answer=self.synthesize_tafssir_answer(messages, ayahs, related_terms, searches, source_chunks, answer_language),
            keep_ayah_ids=[ayah.ayah_id for ayah in ayahs],
        )


class OllamaResearchLlmProvider(ResearchLlmProvider):
    supports_embeddings = True

    def __init__(self, settings: ResearchRuntimeSettings | None = None) -> None:
        runtime = settings or build_runtime_settings()
        self.base_url = runtime.base_url
        self.chat_model = runtime.chat_model
        self.embed_model = runtime.embed_model
        self.timeout = runtime.timeout
        self.api_key = runtime.api_key
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

    def _chat(self, messages: list[dict[str, str]], *, temperature: float = 0.1, stage: str = "chat") -> str:
        payload = {
            "model": self.chat_model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": temperature},
        }
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
        source_chunks: list[SourceChunk],
        quran_terms: list[QuranTermCandidate],
        answer_language: str,
    ) -> CandidateExpansion:
        payload = {
            "conversation": [dump_model(message) for message in messages],
            "retrieved_source_chunks": [
                {
                    "title": chunk.title,
                    "content": chunk.content[:1800],
                }
                for chunk in source_chunks[:6]
            ],
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
                        "You are the first stage of a Quran research planner. "
                        "Be permissive and exploratory. Use the user's wording as the highest priority, and use "
                        "retrieved source chunks only to understand possible Quranic vocabulary and themes. "
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
        source_chunks: list[SourceChunk],
        quran_terms: list[QuranTermCandidate],
        expanded_candidates: CandidateExpansion,
        answer_language: str,
    ) -> SearchPlan:
        payload = {
            "conversation": [dump_model(message) for message in messages],
            "retrieved_source_chunks": [
                {
                    "title": chunk.title,
                    "content": chunk.content[:1800],
                }
                for chunk in source_chunks[:6]
            ],
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
                        "from the user's question first, then the retrieved source chunks, then the broad candidate list. "
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
                        "Answer the user using only the ayahs provided in the JSON payload. "
                        "Do not cite or use transcript/book/source-corpus content. "
                        "If the ayahs are insufficient, say that clearly. Keep the response concise and comprehensive."
                    ),
                },
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            temperature=0.15,
            stage="synthesize_strict",
        )

    def synthesize_tafssir_answer(
        self,
        messages: list[ResearchAgentMessage],
        ayahs: list[ResearchAgentAyah],
        related_terms: list[ResearchRelatedTerm],
        searches: list[ResearchSearchItem],
        source_chunks: list[SourceChunk],
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
            "source_chunks": [
                {
                    "title": chunk.title,
                    "content": chunk.content[:1400],
                }
                for chunk in source_chunks[:5]
            ],
        }
        return self._chat(
            [
                {
                    "role": "system",
                    "content": (
                        "You are producing an experimental Quran interpretation note. "
                        "Use the ayahs as the primary evidence and the source chunks only as a secondary interpretive aid. "
                        "Do not present the corpus as authoritative revelation or definitive tafsir. "
                        "Explain one plausible reading connected to the user's question, mention uncertainty when needed, "
                        "and keep the answer grounded in the retrieved ayahs."
                    ),
                },
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            temperature=0.2,
            stage="synthesize_tafssir",
        )

    def finalize_answer(
        self,
        messages: list[ResearchAgentMessage],
        ayahs: list[ResearchAgentAyah],
        related_terms: list[ResearchRelatedTerm],
        searches: list[ResearchSearchItem],
        answer_language: str,
    ) -> AnswerReview:
        payload = {
            "conversation": [dump_model(message) for message in messages],
            "answer_language": answer_language,
            "related_terms": [dump_model(term) for term in related_terms],
            "searches": [dump_model(search) for search in searches],
            "ayahs": [
                {
                    "ayah_id": ayah.ayah_id,
                    "surah": ayah.surah,
                    "ayah": ayah.ayah,
                    "text": ayah.text,
                    "matched_terms": ayah.matched_terms,
                }
                for ayah in ayahs
            ],
        }
        content = self._chat(
            [
                {
                    "role": "system",
                    "content": (
                        "You are the final strict Quran answer stage. Use only the ayahs in the payload. "
                        "Return strict JSON only with this shape: "
                        '{"answer":"...","keep_ayah_ids":[1,2],"discard_ayah_ids":[3]}. '
                        "The answer and the kept ayahs must stay aligned. "
                        "Discard ayahs that are off-topic, misleading, or driven by a weak root match."
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

    def finalize_tafssir_answer(
        self,
        messages: list[ResearchAgentMessage],
        ayahs: list[ResearchAgentAyah],
        related_terms: list[ResearchRelatedTerm],
        searches: list[ResearchSearchItem],
        source_chunks: list[SourceChunk],
        answer_language: str,
        tafssir_depth: str = "balanced",
    ) -> AnswerReview:
        depth_profile = tafssir_depth_profile(tafssir_depth)
        chunk_count = int(depth_profile["chunk_count"])
        chunk_chars = int(depth_profile["chunk_chars"])
        payload = {
            "conversation": [dump_model(message) for message in messages],
            "answer_language": answer_language,
            "tafssir_depth": tafssir_depth,
            "related_terms": [dump_model(term) for term in related_terms],
            "searches": [dump_model(search) for search in searches],
            "ayahs": [
                {
                    "ayah_id": ayah.ayah_id,
                    "surah": ayah.surah,
                    "ayah": ayah.ayah,
                    "text": ayah.text,
                    "matched_terms": ayah.matched_terms,
                }
                for ayah in ayahs
            ],
            "source_chunks": [
                {
                    "title": chunk.title,
                    "content": chunk.content[:chunk_chars],
                }
                for chunk in source_chunks[:chunk_count]
            ],
        }
        content = self._chat(
            [
                {
                    "role": "system",
                    "content": (
                        "You are the final experimental tafssir stage. Use ayahs as the primary evidence and "
                        "source chunks only as a secondary interpretive aid. The corpus is internal-only: do not "
                        "quote chunks, expose source paths, or cite the corpus to the user. "
                        f"{depth_profile['guidance']} "
                        "Return strict JSON only with this shape: "
                        '{"answer":"...",'
                        '"tafssir":{"summary":"...","linguistic_analysis":"...",'
                        '"ayah_connections":"...","corpus_insight":"...","limits_and_cautions":"..."},'
                        '"keep_ayah_ids":[1,2],"discard_ayah_ids":[3]}. '
                        "The answer should be a readable plain-text synthesis of the same sections. "
                        "The tafssir fields should use concise labels implicitly: summary, linguistic analysis, "
                        "ayah connections, corpus-informed insight, and limits/cautions. "
                        "Prioritize Quranic ayahs over corpus interpretation. "
                        "The answer and the kept ayahs must stay aligned. "
                        "Discard ayahs that do not support the experimental reading you present."
                    ),
                },
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            temperature=float(depth_profile["temperature"]),
            stage="finalize_tafssir",
        )
        try:
            review = parse_answer_review(content, ayahs, "")
            if review.answer.strip():
                return review
        except ResearchProviderResponseError:
            pass
        fallback_answer = self.synthesize_tafssir_answer(
            messages,
            ayahs,
            related_terms,
            searches,
            source_chunks,
            answer_language,
        )
        return AnswerReview(answer=fallback_answer, keep_ayah_ids=[ayah.ayah_id for ayah in ayahs])

    def embed_text(self, text: str) -> list[float]:
        if not self.embed_model:
            raise ResearchProviderUnavailable("No Ollama embedding model is configured.")
        response = self._post_json("/api/embeddings", {"model": self.embed_model, "prompt": text}, stage="embedding", model=self.embed_model)
        embedding = response.get("embedding")
        if not isinstance(embedding, list):
            raise ResearchProviderResponseError("Ollama returned an invalid embedding response.")
        return [float(value) for value in embedding]


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


def get_public_ollama_cloud_catalog(timeout: float = 10.0) -> list[OllamaModelItem]:
    global _public_ollama_cloud_catalog_cache

    cached = _public_ollama_cloud_catalog_cache
    now = time.time()
    if cached and now - cached[0] < PUBLIC_OLLAMA_CLOUD_CACHE_TTL_SECONDS:
        return cached[1]

    try:
        catalog = fetch_public_ollama_cloud_catalog(timeout=timeout)
    except (error.HTTPError, error.URLError, TimeoutError, OSError):
        return cached[1] if cached else []

    _public_ollama_cloud_catalog_cache = (now, catalog)
    return catalog


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
    tafssir = parse_tafssir_structured_answer(parsed.get("tafssir"))
    ayah_ids = {ayah.ayah_id for ayah in ayahs}

    keep_ayah_ids = [int(value) for value in coerce_list(parsed.get("keep_ayah_ids")) if isinstance(value, int) and value in ayah_ids]
    discard_ayah_ids = [int(value) for value in coerce_list(parsed.get("discard_ayah_ids")) if isinstance(value, int) and value in ayah_ids]

    if not keep_ayah_ids:
        keep_ayah_ids = [ayah.ayah_id for ayah in ayahs]

    return AnswerReview(
        answer=answer,
        keep_ayah_ids=list(dict.fromkeys(keep_ayah_ids)),
        discard_ayah_ids=list(dict.fromkeys(discard_ayah_ids)),
        tafssir=tafssir,
    )


def parse_tafssir_structured_answer(value: Any) -> TafssirStructuredAnswer | None:
    if not isinstance(value, dict):
        return None
    fields = {
        "summary": coerce_optional_text(value.get("summary")),
        "linguistic_analysis": coerce_optional_text(value.get("linguistic_analysis")),
        "ayah_connections": coerce_optional_text(value.get("ayah_connections")),
        "corpus_insight": coerce_optional_text(value.get("corpus_insight")),
        "limits_and_cautions": coerce_optional_text(value.get("limits_and_cautions")),
    }
    if not any(fields.values()):
        return None
    return TafssirStructuredAnswer(**fields)


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


def is_tafssir_mode(req: ResearchAgentRequest) -> bool:
    return req.response_mode == "tafssir"


def build_research_disclaimer(req: ResearchAgentRequest) -> str | None:
    return TAFSSIR_DISCLAIMER_AR if is_tafssir_mode(req) else None


def tafssir_depth_profile(depth: str) -> dict[str, int | str | float]:
    if depth == "fast":
        return {
            "chunk_count": 3,
            "chunk_chars": 900,
            "temperature": 0.14,
            "guidance": (
                "FAST depth: produce a compact answer with short sections, minimal linguistic analysis, "
                "and only the most direct ayah relationships."
            ),
        }
    if depth == "deep":
        return {
            "chunk_count": 9,
            "chunk_chars": 1900,
            "temperature": 0.2,
            "guidance": (
                "DEEP depth: produce a richer answer with stronger linguistic analysis, explicit ayah-to-ayah "
                "relations, careful caveats, and deeper use of the internal corpus. Prefer Ibn Fares-style "
                "root meaning when relevant, but never treat the corpus as Quranic authority."
            ),
        }
    return {
        "chunk_count": 5,
        "chunk_chars": 1400,
        "temperature": 0.16,
        "guidance": (
            "BALANCED depth: produce clear sectioned analysis with moderate corpus use, enough linguistic detail, "
            "and concise caveats."
        ),
    }


def detect_answer_language(query: str, requested_language: str) -> str:
    requested_language = requested_language.strip().lower()
    if requested_language and requested_language != "auto":
        return requested_language
    if re.search(r"[\u0600-\u06FF]", query):
        return "arabic"
    if re.search(r"\b(le|la|les|des|une|pourquoi|comment|dans|avec|est-ce)\b", query, flags=re.IGNORECASE):
        return "french"
    return "english"


def build_fts_query(text: str, limit: int = 12) -> str:
    stopwords = {
        "a",
        "an",
        "and",
        "are",
        "de",
        "des",
        "du",
        "est",
        "is",
        "la",
        "le",
        "les",
        "of",
        "or",
        "the",
        "to",
        "un",
        "une",
        "what",
        "with",
    }
    tokens = []
    for token in re.findall(r"[\w\u0600-\u06FF]+", text.lower()):
        token = token.strip("_")
        if len(token) < 2 or token in stopwords:
            continue
        tokens.append(token)
    unique_tokens = list(dict.fromkeys(tokens))[:limit]
    return " OR ".join(f"{token}*" for token in unique_tokens)


def research_index_exists() -> bool:
    return Path(config.get_research_index_path()).exists()


def connect_research_index() -> sqlite3.Connection:
    connection = sqlite3.connect(config.get_research_index_path())
    connection.row_factory = sqlite3.Row
    return connection


def table_exists(cursor: sqlite3.Cursor, table_name: str) -> bool:
    cursor.execute("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?", (table_name,))
    return cursor.fetchone() is not None


def retrieve_source_chunks(query: str, provider: ResearchLlmProvider, limit: int = 6) -> list[SourceChunk]:
    if not research_index_exists():
        return []

    merged: dict[int, SourceChunk] = {}
    try:
        with connect_research_index() as connection:
            cursor = connection.cursor()
            if table_exists(cursor, "source_chunks_fts"):
                for chunk in retrieve_source_chunks_by_fts(cursor, query, limit):
                    merged[chunk.id] = chunk

            if provider.supports_embeddings and table_exists(cursor, "chunk_embeddings"):
                for chunk in retrieve_source_chunks_by_embedding(cursor, query, provider, limit):
                    current = merged.get(chunk.id)
                    merged[chunk.id] = chunk if current is None else SourceChunk(
                        id=current.id,
                        title=current.title,
                        source_path=current.source_path,
                        content=current.content,
                        score=current.score + chunk.score,
                    )

            if not merged and table_exists(cursor, "source_chunks"):
                for chunk in retrieve_source_chunks_by_like(cursor, query, limit):
                    merged[chunk.id] = chunk
    except sqlite3.Error:
        return []

    return sorted(merged.values(), key=lambda item: item.score, reverse=True)[:limit]


def retrieve_source_chunks_by_fts(cursor: sqlite3.Cursor, query: str, limit: int) -> list[SourceChunk]:
    fts_query = build_fts_query(query)
    if not fts_query:
        return []
    try:
        cursor.execute(
            """
            SELECT
                sc.id,
                sd.title,
                sd.source_path,
                sc.content,
                bm25(source_chunks_fts) AS rank
            FROM source_chunks_fts
            JOIN source_chunks sc ON sc.id = source_chunks_fts.rowid
            JOIN source_documents sd ON sd.id = sc.document_id
            WHERE source_chunks_fts MATCH ?
            ORDER BY rank
            LIMIT ?
            """,
            (fts_query, limit),
        )
    except sqlite3.Error:
        return []
    chunks = []
    for row in cursor.fetchall():
        rank = abs(float(row["rank"] or 0.0))
        chunks.append(
            SourceChunk(
                id=row["id"],
                title=row["title"] or "Untitled source",
                source_path=row["source_path"] or "",
                content=row["content"],
                score=1.0 / (1.0 + rank),
            )
        )
    return chunks


def retrieve_source_chunks_by_like(cursor: sqlite3.Cursor, query: str, limit: int) -> list[SourceChunk]:
    tokens = [token for token in re.findall(r"[\w\u0600-\u06FF]+", query) if len(token) >= 3][:4]
    if not tokens:
        return []
    clauses = " OR ".join("sc.content LIKE ?" for _ in tokens)
    params = [f"%{token}%" for token in tokens]
    cursor.execute(
        f"""
        SELECT sc.id, sd.title, sd.source_path, sc.content
        FROM source_chunks sc
        JOIN source_documents sd ON sd.id = sc.document_id
        WHERE {clauses}
        LIMIT ?
        """,
        [*params, limit],
    )
    return [
        SourceChunk(
            id=row["id"],
            title=row["title"] or "Untitled source",
            source_path=row["source_path"] or "",
            content=row["content"],
            score=0.25,
        )
        for row in cursor.fetchall()
    ]


def retrieve_source_chunks_by_embedding(
    cursor: sqlite3.Cursor,
    query: str,
    provider: ResearchLlmProvider,
    limit: int,
) -> list[SourceChunk]:
    try:
        query_embedding = provider.embed_text(query)
    except ResearchAgentError:
        return []

    cursor.execute(
        """
        SELECT
            ce.chunk_id,
            ce.embedding_json,
            sc.content,
            sd.title,
            sd.source_path
        FROM chunk_embeddings ce
        JOIN source_chunks sc ON sc.id = ce.chunk_id
        JOIN source_documents sd ON sd.id = sc.document_id
        LIMIT 5000
        """
    )
    scored = []
    for row in cursor.fetchall():
        try:
            embedding = [float(value) for value in json.loads(row["embedding_json"])]
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
        score = cosine_similarity(query_embedding, embedding)
        if score <= 0:
            continue
        scored.append(
            SourceChunk(
                id=row["chunk_id"],
                title=row["title"] or "Untitled source",
                source_path=row["source_path"] or "",
                content=row["content"],
                score=score,
            )
        )
    return sorted(scored, key=lambda item: item.score, reverse=True)[:limit]


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return dot / (left_norm * right_norm)


def retrieve_quran_terms(query: str, source_chunks: list[SourceChunk], mushaf: int, limit: int = 30) -> list[QuranTermCandidate]:
    combined_query = " ".join([query, *[chunk.content[:900] for chunk in source_chunks[:4]]])
    candidates = retrieve_quran_terms_from_research_index(combined_query, mushaf, limit)
    if len(candidates) < 6:
        candidates.extend(retrieve_quran_terms_from_quran_db(combined_query, mushaf, limit - len(candidates)))
    return dedupe_quran_term_candidates(candidates)[:limit]


def retrieve_quran_terms_from_research_index(query: str, mushaf: int, limit: int) -> list[QuranTermCandidate]:
    if not research_index_exists():
        return []
    fts_query = build_fts_query(query, limit=16)
    if not fts_query:
        return []
    try:
        with connect_research_index() as connection:
            cursor = connection.cursor()
            if not table_exists(cursor, "quran_terms_fts"):
                return []
            cursor.execute(
                """
                SELECT
                    qt.term_type,
                    qt.text,
                    qt.root_id,
                    bm25(quran_terms_fts) AS rank
                FROM quran_terms_fts
                JOIN quran_terms qt ON qt.id = quran_terms_fts.rowid
                WHERE quran_terms_fts MATCH ? AND qt.mushaf_id = ?
                ORDER BY rank
                LIMIT ?
                """,
                (fts_query, mushaf, limit),
            )
            return [
                QuranTermCandidate(
                    type=row["term_type"],
                    text=row["text"],
                    root_id=row["root_id"],
                    score=1.0 / (1.0 + abs(float(row["rank"] or 0.0))),
                )
                for row in cursor.fetchall()
            ]
    except sqlite3.Error:
        return []


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


def run_research_agent(req: ResearchAgentRequest, runtime: ResearchRuntimeSettings | None = None) -> ResearchAgentResponse:
    user_query = latest_user_message(req.messages)
    answer_language = detect_answer_language(user_query, req.answer_language)
    provider = get_llm_provider(runtime)
    disclaimer = build_research_disclaimer(req)
    provider_info = provider.provider_info()

    source_limit = int(tafssir_depth_profile(req.tafssir_depth)["chunk_count"]) if is_tafssir_mode(req) else 6
    source_chunks = retrieve_source_chunks(user_query, provider, limit=source_limit)
    quran_terms = retrieve_quran_terms(user_query, source_chunks, req.mushaf)
    expanded_candidates = provider.expand_search_candidates(req.messages, source_chunks, quran_terms, answer_language)
    plan = provider.create_search_plan(req.messages, source_chunks, quran_terms, expanded_candidates, answer_language)
    if not plan.related_terms:
        plan.related_terms = expanded_candidates.related_terms

    if plan.status == "needs_clarification" and plan.clarifying_question:
        return ResearchAgentResponse(
            status="needs_clarification",
            mode=req.response_mode,
            clarifying_question=plan.clarifying_question,
            disclaimer=disclaimer,
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
    if not ayahs:
        return ResearchAgentResponse(
            status="no_results",
            mode=req.response_mode,
            answer=build_no_results_answer(answer_language),
            disclaimer=disclaimer,
            provider=provider_info,
            usage=provider.usage_summary(),
            related_terms=plan.related_terms,
            searches=executed_searches,
            ayahs=[],
        )

    if is_tafssir_mode(req):
        review = provider.finalize_tafssir_answer(
            req.messages,
            ayahs,
            plan.related_terms,
            executed_searches,
            source_chunks,
            answer_language,
            req.tafssir_depth,
        )
    else:
        review = provider.finalize_answer(req.messages, ayahs, plan.related_terms, executed_searches, answer_language)

    ayahs = filter_ayahs_by_review(ayahs, review)
    return ResearchAgentResponse(
        status="answered",
        mode=req.response_mode,
        answer=review.answer,
        disclaimer=disclaimer,
        tafssir=review.tafssir if is_tafssir_mode(req) else None,
        provider=provider_info,
        usage=provider.usage_summary(),
        related_terms=plan.related_terms,
        searches=executed_searches,
        ayahs=ayahs,
    )
