import sqlite3

import pytest

from src.app.core import config
from src.app.models.api import ResearchAgentAyah, ResearchRelatedTerm, ResearchSearchItem, TafssirStructuredAnswer
from src.app.services import quran_service, research_agent_service


class StubResearchProvider(research_agent_service.ResearchLlmProvider):
    def __init__(self, plan, answer="Answer from ayahs only.", tafssir_answer="Experimental tafssir answer."):
        self.plan = plan
        self.answer = answer
        self.tafssir_answer = tafssir_answer
        self.planning_chunks = []
        self.expansion_chunks = []
        self.answer_ayahs = []
        self.tafssir_chunks = []

    def expand_search_candidates(self, messages, source_chunks, quran_terms, answer_language):
        self.expansion_chunks = source_chunks
        return research_agent_service.CandidateExpansion(
            related_terms=self.plan.related_terms,
            searches=self.plan.searches,
        )

    def create_search_plan(self, messages, source_chunks, quran_terms, expanded_candidates, answer_language):
        self.planning_chunks = source_chunks
        return self.plan

    def synthesize_answer(self, messages, ayahs, related_terms, searches, answer_language):
        self.answer_ayahs = ayahs
        return self.answer

    def synthesize_tafssir_answer(self, messages, ayahs, related_terms, searches, source_chunks, answer_language):
        self.answer_ayahs = ayahs
        self.tafssir_chunks = source_chunks
        return self.tafssir_answer


@pytest.fixture(autouse=True)
def reset_research_provider():
    research_agent_service.set_llm_provider_for_tests(None)
    yield
    research_agent_service.set_llm_provider_for_tests(None)


def test_research_agent_answers_from_stubbed_search_plan(api_client):
    provider = StubResearchProvider(
        research_agent_service.SearchPlan(
            status="search",
            related_terms=[ResearchRelatedTerm(type="root", text="shared-root-a")],
            searches=[ResearchSearchItem(mode="root", query="shared", reason="fixture root")],
        )
    )
    research_agent_service.set_llm_provider_for_tests(provider)

    response = api_client.post(
        "/api/research-agent",
        json={"messages": [{"role": "user", "content": "Where is this shared idea?"}], "mushaf": 1, "max_results": 3},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "answered"
    assert body["mode"] == "strict"
    assert body["answer"] == "Answer from ayahs only."
    assert body["searches"][0]["result_count"] == 12
    assert len(body["ayahs"]) == 3
    assert body["ayahs"][0]["matched_terms"] == ["shared-root-a"]
    assert provider.answer_ayahs[0].text == "shared verse 1"


def test_research_agent_returns_clarifying_question_before_search(api_client):
    provider = StubResearchProvider(
        research_agent_service.SearchPlan(
            status="needs_clarification",
            clarifying_question="Do you mean the linguistic or ethical angle?",
            related_terms=[ResearchRelatedTerm(type="word", text="shared")],
        )
    )
    research_agent_service.set_llm_provider_for_tests(provider)

    response = api_client.post(
        "/api/research-agent",
        json={"messages": [{"role": "user", "content": "Tell me about this broad topic"}], "mushaf": 1},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "needs_clarification"
    assert body["mode"] == "strict"
    assert body["clarifying_question"] == "Do you mean the linguistic or ethical angle?"
    assert body["ayahs"] == []
    assert body["searches"] == []


def test_research_agent_returns_no_results_for_empty_search(api_client):
    provider = StubResearchProvider(
        research_agent_service.SearchPlan(
            status="search",
            related_terms=[ResearchRelatedTerm(type="word", text="missing")],
            searches=[ResearchSearchItem(mode="exact", query="missing")],
        )
    )
    research_agent_service.set_llm_provider_for_tests(provider)

    response = api_client.post(
        "/api/research-agent",
        json={"messages": [{"role": "user", "content": "Find a missing term"}], "mushaf": 1},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "no_results"
    assert body["mode"] == "strict"
    assert body["ayahs"] == []
    assert body["searches"][0]["result_count"] == 0


def test_research_agent_returns_503_when_provider_is_disabled(api_client, monkeypatch):
    monkeypatch.setenv("QBASAIR_LLM_PROVIDER", "disabled")

    response = api_client.post(
        "/api/research-agent",
        json={"messages": [{"role": "user", "content": "Any question"}], "mushaf": 1},
    )

    assert response.status_code == 503


def test_research_agent_settings_returns_provider_and_limits(api_client):
    research_agent_service.set_llm_provider_for_tests(StubResearchProvider(research_agent_service.SearchPlan(status="search")))

    response = api_client.get("/api/research-agent/settings")

    assert response.status_code == 200
    body = response.json()
    assert body["provider"]["provider"] == "ollama"
    assert "transport" in body["provider"]
    assert "available_models" in body
    assert "limits" in body
    assert isinstance(body["limits"]["notes"], list)


def test_parse_public_cloud_library_slugs_preserves_unique_order():
    html = """
    <a href="/library/gemma4">Gemma 4</a>
    <a href="/library/qwen3">Qwen 3</a>
    <a href="/library/gemma4">Gemma 4</a>
    """

    assert research_agent_service.parse_public_cloud_library_slugs(html) == ["gemma4", "qwen3"]


def test_parse_public_cloud_model_tags_extracts_cloud_variants():
    html = """
    <a href="/library/gemma4:31b-cloud">gemma4:31b-cloud</a>
    <a href="/library/gemma4:12b-cloud">gemma4:12b-cloud</a>
    <code>ollama run gemma4:31b-cloud</code>
    """

    items = research_agent_service.parse_public_cloud_model_tags("gemma4", html)

    assert [item.name for item in items] == ["gemma4:31b-cloud", "gemma4:12b-cloud"]
    assert all(item.is_cloud for item in items)
    assert all("chat" in item.capabilities for item in items)


def test_merge_model_catalogs_keeps_unique_names_and_combines_capabilities():
    merged = research_agent_service.merge_model_catalogs(
        [research_agent_service.make_model_item("gemma4:31b-cloud", capabilities=["chat"])],
        [research_agent_service.make_model_item("gemma4:31b-cloud", is_cloud=True, capabilities=["cloud"])],
    )

    assert len(merged) == 1
    assert merged[0].name == "gemma4:31b-cloud"
    assert merged[0].is_cloud is True
    assert sorted(merged[0].capabilities) == ["chat", "cloud"]


def create_minimal_research_index(path):
    connection = sqlite3.connect(path)
    cursor = connection.cursor()
    cursor.executescript(
        """
        CREATE TABLE source_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_path TEXT NOT NULL,
            title TEXT NOT NULL,
            source_type TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            indexed_at REAL NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE TABLE source_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            content_simple TEXT NOT NULL,
            token_count INTEGER NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE VIRTUAL TABLE source_chunks_fts USING fts5(content, content_simple, title, source_path);
        CREATE TABLE quran_terms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mushaf_id INTEGER NOT NULL,
            term_type TEXT NOT NULL,
            text TEXT NOT NULL,
            normalized TEXT NOT NULL,
            root_id INTEGER,
            frequency INTEGER NOT NULL DEFAULT 0,
            metadata_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE VIRTUAL TABLE quran_terms_fts USING fts5(term_type, text, normalized);
        """
    )
    cursor.execute(
        """
        INSERT INTO source_documents (
            source_path, title, source_type, content_hash, indexed_at
        ) VALUES ('lecture.txt', 'Lecture', 'txt', 'hash', 1.0)
        """
    )
    cursor.execute(
        """
        INSERT INTO source_chunks (
            document_id, chunk_index, content, content_simple, token_count
        ) VALUES (1, 0, 'FORBIDDEN_TRANSCRIPT_CLAIM shared', 'FORBIDDEN_TRANSCRIPT_CLAIM shared', 2)
        """
    )
    cursor.execute(
        """
        INSERT INTO source_chunks_fts (
            rowid, content, content_simple, title, source_path
        ) VALUES (1, 'FORBIDDEN_TRANSCRIPT_CLAIM shared', 'FORBIDDEN_TRANSCRIPT_CLAIM shared', 'Lecture', 'lecture.txt')
        """
    )
    connection.commit()
    connection.close()


def test_research_agent_keeps_source_chunks_out_of_final_answer_context(api_client, tmp_path):
    research_index_path = tmp_path / "research_agent.db"
    create_minimal_research_index(research_index_path)
    original_path = config.get_research_index_path()
    config.set_research_index_path(str(research_index_path))

    provider = StubResearchProvider(
        research_agent_service.SearchPlan(
            status="search",
            related_terms=[ResearchRelatedTerm(type="root", text="shared-root-a")],
            searches=[ResearchSearchItem(mode="root", query="shared")],
        )
    )
    research_agent_service.set_llm_provider_for_tests(provider)

    try:
        response = api_client.post(
            "/api/research-agent",
            json={"messages": [{"role": "user", "content": "FORBIDDEN_TRANSCRIPT_CLAIM"}], "mushaf": 1},
        )
    finally:
        config.set_research_index_path(original_path)

    assert response.status_code == 200
    assert provider.expansion_chunks
    assert provider.planning_chunks
    assert "FORBIDDEN_TRANSCRIPT_CLAIM" in provider.planning_chunks[0].content
    assert provider.answer_ayahs
    assert provider.tafssir_chunks == []
    assert all("FORBIDDEN_TRANSCRIPT_CLAIM" not in ayah.text for ayah in provider.answer_ayahs)


def test_research_agent_tafssir_mode_passes_source_chunks_and_disclaimer(api_client, tmp_path):
    research_index_path = tmp_path / "research_agent.db"
    create_minimal_research_index(research_index_path)
    original_path = config.get_research_index_path()
    config.set_research_index_path(str(research_index_path))

    provider = StubResearchProvider(
        research_agent_service.SearchPlan(
            status="search",
            related_terms=[ResearchRelatedTerm(type="root", text="shared-root-a")],
            searches=[ResearchSearchItem(mode="root", query="shared")],
        ),
        tafssir_answer="Experimental tafssir answer.",
    )
    research_agent_service.set_llm_provider_for_tests(provider)

    try:
        response = api_client.post(
            "/api/research-agent",
            json={
                "messages": [{"role": "user", "content": "FORBIDDEN_TRANSCRIPT_CLAIM"}],
                "mushaf": 1,
                "response_mode": "tafssir",
            },
        )
    finally:
        config.set_research_index_path(original_path)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "answered"
    assert body["mode"] == "tafssir"
    assert body["answer"] == "Experimental tafssir answer."
    assert "تجريبي" in body["disclaimer"]
    assert provider.tafssir_chunks
    assert "FORBIDDEN_TRANSCRIPT_CLAIM" in provider.tafssir_chunks[0].content


def test_research_agent_tafssir_depth_and_structured_sections(api_client, tmp_path):
    class StructuredTafssirProvider(StubResearchProvider):
        def __init__(self, plan):
            super().__init__(plan)
            self.tafssir_depth = None

        def finalize_tafssir_answer(
            self,
            messages,
            ayahs,
            related_terms,
            searches,
            source_chunks,
            answer_language,
            tafssir_depth="balanced",
        ):
            self.answer_ayahs = ayahs
            self.tafssir_chunks = source_chunks
            self.tafssir_depth = tafssir_depth
            return research_agent_service.AnswerReview(
                answer="Structured tafssir fallback string.",
                keep_ayah_ids=[ayahs[0].ayah_id],
                discard_ayah_ids=[ayahs[-1].ayah_id],
                tafssir=TafssirStructuredAnswer(
                    summary="Short structured summary.",
                    linguistic_analysis="Root-level analysis.",
                    ayah_connections="Only the kept ayah supports the answer.",
                    corpus_insight="Internal corpus shaped this reading.",
                    limits_and_cautions="Experimental, not authoritative.",
                ),
            )

    research_index_path = tmp_path / "research_agent.db"
    create_minimal_research_index(research_index_path)
    original_path = config.get_research_index_path()
    config.set_research_index_path(str(research_index_path))
    provider = StructuredTafssirProvider(
        research_agent_service.SearchPlan(
            status="search",
            related_terms=[ResearchRelatedTerm(type="root", text="shared-root-a")],
            searches=[ResearchSearchItem(mode="root", query="shared")],
        )
    )
    research_agent_service.set_llm_provider_for_tests(provider)

    try:
        response = api_client.post(
            "/api/research-agent",
            json={
                "messages": [{"role": "user", "content": "shared tafssir question"}],
                "mushaf": 1,
                "response_mode": "tafssir",
                "tafssir_depth": "deep",
                "max_results": 3,
            },
        )
    finally:
        config.set_research_index_path(original_path)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "answered"
    assert body["tafssir"]["summary"] == "Short structured summary."
    assert body["tafssir"]["linguistic_analysis"] == "Root-level analysis."
    assert provider.tafssir_depth == "deep"
    assert len(body["ayahs"]) == 1
    assert body["ayahs"][0]["ayah_id"] == provider.answer_ayahs[0].ayah_id


def test_research_agent_rejects_invalid_tafssir_depth(api_client):
    response = api_client.post(
        "/api/research-agent",
        json={
            "messages": [{"role": "user", "content": "Where is this shared idea?"}],
            "mushaf": 1,
            "response_mode": "tafssir",
            "tafssir_depth": "max",
        },
    )

    assert response.status_code == 422


def test_research_agent_strict_mode_ignores_valid_tafssir_depth(api_client):
    provider = StubResearchProvider(
        research_agent_service.SearchPlan(
            status="search",
            related_terms=[ResearchRelatedTerm(type="root", text="shared-root-a")],
            searches=[ResearchSearchItem(mode="root", query="shared")],
        )
    )
    research_agent_service.set_llm_provider_for_tests(provider)

    response = api_client.post(
        "/api/research-agent",
        json={
            "messages": [{"role": "user", "content": "Where is this shared idea?"}],
            "mushaf": 1,
            "response_mode": "strict",
            "tafssir_depth": "deep",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "strict"
    assert body["answer"] == "Answer from ayahs only."
    assert "tafssir" not in body


def test_parse_answer_review_reads_structured_tafssir_payload():
    ayah = ResearchAgentAyah(
        ayah_id=11,
        mushaf_id=1,
        surah="Fixture",
        surah_id=1,
        ayah=1,
        text="fixture ayah",
        global_index=1,
        highlights=[],
        matched_terms=["fixture"],
    )

    review = research_agent_service.parse_answer_review(
        """
        {
          "answer": "Plain answer.",
          "tafssir": {
            "summary": "Summary.",
            "linguistic_analysis": "Language.",
            "ayah_connections": "Connections.",
            "corpus_insight": "Corpus-shaped insight.",
            "limits_and_cautions": "Caution."
          },
          "keep_ayah_ids": [11],
          "discard_ayah_ids": []
        }
        """,
        [ayah],
        "",
    )

    assert review.answer == "Plain answer."
    assert review.tafssir is not None
    assert review.tafssir.summary == "Summary."
    assert review.tafssir.corpus_insight == "Corpus-shaped insight."


def test_execute_searches_resolves_transliterated_root_queries(monkeypatch):
    captured_queries = []

    class DummyCursor:
        pass

    monkeypatch.setattr(quran_service, "get_db", lambda: type("DummyDb", (), {"cursor": lambda self: DummyCursor()})())
    monkeypatch.setattr(
        quran_service,
        "build_root_suggestions_by_latin",
        lambda cursor, query, mushaf, limit: [{"type": "root", "text": "رحم"}] if query == "rhm" else [],
    )

    def fake_build_paginated_search_results(cursor, q, q_simple, mode, mushaf, page_size):
        captured_queries.append((q, q_simple, mode, mushaf, page_size))
        return ([], None)

    monkeypatch.setattr(quran_service, "build_paginated_search_results", fake_build_paginated_search_results)

    searches, ayahs = research_agent_service.execute_searches(
        [ResearchSearchItem(mode="root", query="r-h-m", reason="planner root")],
        mushaf=1,
        max_results=5,
    )

    assert ayahs == []
    assert captured_queries == [("رحم", "رحم", "root", 1, 5)]
    assert searches[0].query == "رحم"


def test_execute_searches_compacts_spaced_arabic_root_queries(monkeypatch):
    captured_queries = []

    class DummyCursor:
        pass

    monkeypatch.setattr(quran_service, "get_db", lambda: type("DummyDb", (), {"cursor": lambda self: DummyCursor()})())

    def fake_build_paginated_search_results(cursor, q, q_simple, mode, mushaf, page_size):
        captured_queries.append((q, q_simple, mode, mushaf, page_size))
        return ([], None)

    monkeypatch.setattr(quran_service, "build_paginated_search_results", fake_build_paginated_search_results)

    searches, ayahs = research_agent_service.execute_searches(
        [ResearchSearchItem(mode="root", query="\u0635 \u0644 \u0648", reason="planner root")],
        mushaf=1,
        max_results=5,
    )

    assert ayahs == []
    assert captured_queries == [("\u0635\u0644\u0648", "\u0635\u0644\u0648", "root", 1, 5)]
    assert searches[0].query == "\u0635\u0644\u0648"


def test_parse_search_plan_rewrites_generic_clarification_using_candidate_terms():
    plan = research_agent_service.parse_search_plan(
        """
        {
          "status": "needs_clarification",
          "clarifying_question": "Could you please clarify your intent?",
          "related_terms": [
            {"type": "word", "text": "\u0627\u0644\u0635\u0644\u0627\u0629"},
            {"type": "word", "text": "\u0627\u0644\u0632\u0643\u0627\u0629"}
          ],
          "searches": []
        }
        """,
        fallback_terms=[],
        answer_language="arabic",
    )

    assert plan.status == "needs_clarification"
    assert plan.clarifying_question is not None
    assert "\u0627\u0644\u0635\u0644\u0627\u0629" in plan.clarifying_question
    assert "\u0627\u0644\u0632\u0643\u0627\u0629" in plan.clarifying_question


def test_research_agent_filters_displayed_ayahs_from_final_review(api_client):
    class PruningProvider(StubResearchProvider):
        def finalize_answer(self, messages, ayahs, related_terms, searches, answer_language):
            self.answer_ayahs = ayahs
            return research_agent_service.AnswerReview(
                answer="Filtered answer.",
                keep_ayah_ids=[ayahs[-1].ayah_id],
                discard_ayah_ids=[ayahs[0].ayah_id],
            )

    provider = PruningProvider(
        research_agent_service.SearchPlan(
            status="search",
            related_terms=[ResearchRelatedTerm(type="root", text="shared-root-a")],
            searches=[ResearchSearchItem(mode="root", query="shared", reason="fixture root")],
        )
    )
    research_agent_service.set_llm_provider_for_tests(provider)

    response = api_client.post(
        "/api/research-agent",
        json={"messages": [{"role": "user", "content": "Where is this shared idea?"}], "mushaf": 1, "max_results": 3},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "answered"
    assert body["answer"] == "Filtered answer."
    assert len(body["ayahs"]) == 1
    assert body["ayahs"][0]["ayah_id"] == provider.answer_ayahs[-1].ayah_id


# --- SSRF / server-key-exfil closure (T1.3) -------------------------------


def test_client_base_url_override_never_carries_server_key(monkeypatch):
    """A client base_url override must not inherit the server's Ollama key."""
    monkeypatch.setenv("OLLAMA_API_KEY", "server-secret-key")

    runtime = research_agent_service.build_runtime_settings(
        api_key=None, base_url="https://ollama.com"
    )

    assert runtime.base_url == "https://ollama.com"
    assert runtime.api_key == ""  # server key withheld from the override endpoint


def test_client_base_url_override_honors_client_key(monkeypatch):
    monkeypatch.setenv("OLLAMA_API_KEY", "server-secret-key")

    runtime = research_agent_service.build_runtime_settings(
        api_key="client-key", base_url="https://ollama.com"
    )

    assert runtime.api_key == "client-key"


def test_no_override_still_uses_server_key(monkeypatch):
    """The trusted env path (no client override) keeps the server key."""
    monkeypatch.setenv("OLLAMA_API_KEY", "server-secret-key")
    monkeypatch.setenv("QBASAIR_OLLAMA_BASE_URL", "https://ollama.com")

    runtime = research_agent_service.build_runtime_settings(api_key=None, base_url=None)

    assert runtime.api_key == "server-secret-key"


def test_client_base_url_override_rejects_http_and_non_allowlisted():
    for bad in (
        "http://ollama.com",  # non-https
        "https://169.254.169.254/latest/meta-data",  # SSRF to metadata
        "https://evil.example.com",  # not allowlisted
        "https://notollama.com",  # not a suffix match
    ):
        with pytest.raises(research_agent_service.ResearchProviderUnavailable):
            research_agent_service.build_runtime_settings(base_url=bad)


def test_client_base_url_override_allows_extra_allowlisted_host(monkeypatch):
    monkeypatch.setenv("QBASAIR_OLLAMA_ALLOWED_HOSTS", "my-ollama.internal")

    runtime = research_agent_service.build_runtime_settings(
        base_url="https://my-ollama.internal", api_key="k"
    )

    assert runtime.base_url == "https://my-ollama.internal"


def test_bounded_provider_error_caps_reflected_body():
    huge = "leaked-secret " * 200
    bounded = research_agent_service._bounded_provider_error(
        f"Ollama request failed with HTTP 500: {huge}"
    )
    assert len(bounded) <= research_agent_service.MAX_PROVIDER_ERROR_CHARS
