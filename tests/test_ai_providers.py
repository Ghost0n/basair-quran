"""A reader's own AI provider (Settings → «الذكاء الاصطناعي», docs/ai-connections.md):
fixed addresses, the reader's key only, models listed from the provider, and
OpenRouter's sign-in. No network: urlopen is replaced by a recorder."""

from __future__ import annotations

import io
import json
from urllib import error

import pytest

from src.app.services import llm_providers, research_agent_service


class Recorder:
    """Answers urlopen by URL suffix; keeps every request it was asked."""

    def __init__(self, answers):
        self.answers = answers
        self.requests = []

    def __call__(self, req, timeout=None):
        body = json.loads(req.data.decode("utf-8")) if req.data else None
        self.requests.append({"url": req.full_url, "method": req.get_method(), "headers": {k.lower(): v for k, v in req.header_items()}, "body": body})
        for suffix, answer in self.answers.items():
            if req.full_url.endswith(suffix):
                if callable(answer):
                    answer = answer(body)
                if isinstance(answer, Exception):
                    raise answer
                return io.BytesIO(json.dumps(answer).encode("utf-8"))
        raise AssertionError(f"unexpected request {req.full_url}")


@pytest.fixture()
def network(monkeypatch):
    def install(answers):
        recorder = Recorder(answers)
        monkeypatch.setattr(llm_providers.request, "urlopen", recorder)
        return recorder

    return install


def test_providers_are_listed_without_their_addresses(api_client):
    providers = api_client.get("/api/ai/providers").json()
    ids = [item["id"] for item in providers]
    assert ids == ["openrouter", "openai", "anthropic", "gemini", "mistral", "deepseek", "groq", "xai", "ollama"]
    openrouter = providers[0]
    assert openrouter["signin"] is True and openrouter["key_url"].startswith("https://openrouter.ai/")
    assert all("base_url" not in item for item in providers)


def test_settings_list_the_providers_chat_models_from_its_own_address(api_client, network):
    recorder = network(
        {"/models": {"data": [{"id": "gpt-4o-mini"}, {"id": "text-embedding-3-small"}, {"id": "whisper-1"}, {"id": "gpt-4.1-mini"}]}}
    )
    response = api_client.get(
        "/api/research-agent/settings",
        headers={"X-QBasair-LLM-Provider": "openai", "X-QBasair-LLM-Key": "sk-reader", "X-QBasair-LLM-Model": "gpt-4.1-mini"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["provider"]["provider"] == "openai" and body["provider"]["base_url"] == "https://api.openai.com/v1"
    assert [item["name"] for item in body["available_models"]] == ["gpt-4.1-mini", "gpt-4o-mini"]
    sent = recorder.requests[0]
    assert sent["url"] == "https://api.openai.com/v1/models"
    assert sent["headers"]["authorization"] == "Bearer sk-reader"


def test_a_provider_needs_a_known_id_and_the_readers_key(api_client, network):
    network({})
    unknown = api_client.get("/api/research-agent/settings", headers={"X-QBasair-LLM-Provider": "evil.example", "X-QBasair-LLM-Key": "k"})
    assert unknown.status_code == 503
    no_key = api_client.get("/api/research-agent/settings", headers={"X-QBasair-LLM-Provider": "openai"})
    assert no_key.status_code == 503 and "key" in no_key.json()["detail"]


def test_chat_goes_to_the_providers_chat_completions_and_retries_without_temperature(network):
    def answer(body):
        if "temperature" in body:
            return error.HTTPError("u", 400, "bad", {}, io.BytesIO(b'{"error":"temperature is not supported"}'))
        return {"choices": [{"message": {"content": '{"ok": true}'}}], "usage": {"prompt_tokens": 12, "completion_tokens": 3}}

    recorder = network({"/chat/completions": answer})
    runtime = research_agent_service.build_provider_runtime("anthropic", "sk-ant", "claude-sonnet-4")
    provider = research_agent_service.get_llm_provider(runtime)
    assert provider.complete_json("system", "user", stage="audit") == '{"ok": true}'
    first, second = recorder.requests
    assert first["url"] == "https://api.anthropic.com/v1/chat/completions"
    assert first["headers"]["x-api-key"] == "sk-ant" and first["headers"]["anthropic-version"]
    assert "temperature" not in second["body"]
    usage = provider.usage_summary()
    assert usage.prompt_eval_count == 12 and usage.eval_count == 3


def test_gemini_model_names_lose_their_prefix():
    assert llm_providers.chat_model_names({"data": [{"id": "models/gemini-2.5-flash"}, {"id": "models/text-embedding-004"}]}) == [
        "gemini-2.5-flash"
    ]
    spec = llm_providers.provider_spec("gemini")
    assert llm_providers.preferred_model(spec, ["gemini-1.5-flash", "gemini-2.5-flash"]) == "gemini-2.5-flash"


def test_ollama_cloud_keeps_its_own_api(monkeypatch):
    runtime = research_agent_service.build_provider_runtime("ollama", "ollama-key", "gpt-oss:120b")
    assert runtime.provider_name == "ollama" and runtime.base_url == "https://ollama.com" and runtime.api_key == "ollama-key"


def test_openrouter_sign_in_exchanges_the_code_for_the_readers_key(api_client, network):
    recorder = network({"/auth/keys": {"key": "sk-or-reader"}})
    response = api_client.post("/api/ai/openrouter/key", json={"code": "abc", "code_verifier": "v" * 43})
    assert response.status_code == 200 and response.json() == {"key": "sk-or-reader"}
    assert recorder.requests[0]["url"] == "https://openrouter.ai/api/v1/auth/keys"
    assert recorder.requests[0]["body"] == {"code": "abc", "code_verifier": "v" * 43, "code_challenge_method": "S256"}
    assert api_client.post("/api/ai/openrouter/key", json={"code": "abc", "code_verifier": "short"}).status_code == 422


def _ok(body):
    return {"choices": [{"message": {"content": '{"ok": true}'}}]}


@pytest.mark.parametrize(
    ("provider", "level", "fields"),
    [
        ("openrouter", "high", {"reasoning": {"effort": "high"}}),
        ("openrouter", "off", {"reasoning": {"enabled": False}}),
        ("openai", "medium", {"reasoning_effort": "medium"}),
        ("gemini", "off", {"reasoning_effort": "none"}),
        ("anthropic", "low", {"thinking": {"type": "enabled", "budget_tokens": 2048}, "max_tokens": 2048 + 4096}),
    ],
)
def test_the_readers_thinking_level_is_asked_the_providers_own_way(network, provider, level, fields):
    recorder = network({"/chat/completions": _ok})
    runtime = research_agent_service.build_provider_runtime(provider, "k", "m", level)
    research_agent_service.get_llm_provider(runtime).complete_json("system", "user", stage="audit")
    body = recorder.requests[0]["body"]
    assert {key: body[key] for key in fields} == fields


def test_no_thinking_level_or_one_the_provider_lacks_sends_nothing(network):
    recorder = network({"/chat/completions": _ok})
    for provider, level in (("openai", None), ("openai", "nonsense"), ("mistral", "high"), ("xai", "medium")):
        runtime = research_agent_service.build_provider_runtime(provider, "k", "m", level)
        research_agent_service.get_llm_provider(runtime).complete_json("system", "user", stage="audit")
    for sent in recorder.requests:
        assert not {"reasoning", "reasoning_effort", "thinking"} & set(sent["body"])


def test_a_model_that_cannot_think_is_asked_again_without_it(network):
    def answer(body):
        if "reasoning_effort" in body:
            return error.HTTPError("u", 400, "bad", {}, io.BytesIO(b'{"error":"reasoning_effort is not supported with this model"}'))
        return _ok(body)

    recorder = network({"/chat/completions": answer})
    runtime = research_agent_service.build_provider_runtime("openai", "k", "gpt-4.1-mini", "high")
    assert research_agent_service.get_llm_provider(runtime).complete_json("s", "u", stage="audit") == '{"ok": true}'
    assert len(recorder.requests) == 2 and "reasoning_effort" not in recorder.requests[1]["body"]


def test_claude_thinking_drops_the_temperature_it_refuses(network):
    def answer(body):
        if "thinking" in body and "temperature" in body:
            return error.HTTPError("u", 400, "bad", {}, io.BytesIO(b'{"error":"temperature may only be set to 1 when thinking is enabled"}'))
        return _ok(body)

    recorder = network({"/chat/completions": answer})
    runtime = research_agent_service.build_provider_runtime("anthropic", "k", "claude-sonnet-4", "medium")
    research_agent_service.get_llm_provider(runtime).complete_json("s", "u", stage="audit")
    assert "thinking" in recorder.requests[-1]["body"] and "temperature" not in recorder.requests[-1]["body"]


def test_ollama_cloud_thinks_by_level_for_gpt_oss_and_on_or_off_otherwise(monkeypatch):
    sent = []

    def post(self, path, payload, **_):
        sent.append(dict(payload))
        return {"message": {"content": "ok"}}

    monkeypatch.setattr(research_agent_service.OllamaResearchLlmProvider, "_post_json", post)
    for model, level in (("gpt-oss:120b", "high"), ("qwen3:32b", "high"), ("qwen3:32b", "off")):
        runtime = research_agent_service.build_provider_runtime("ollama", "k", model, level)
        research_agent_service.get_llm_provider(runtime).complete_json("s", "u", stage="audit")
    assert [item["think"] for item in sent] == ["high", True, False]


def test_the_thinking_header_reaches_the_provider(api_client, monkeypatch):
    providers = {item["id"]: item for item in api_client.get("/api/ai/providers").json()}
    assert providers["openai"]["thinking"] == ["low", "medium", "high"]
    assert providers["mistral"]["thinking"] == []
    seen = []

    def settings(runtime):
        seen.append(runtime)
        raise research_agent_service.ResearchProviderUnavailable("stop")

    monkeypatch.setattr(research_agent_service, "get_research_agent_settings", settings)
    headers = {"X-QBasair-LLM-Provider": "openai", "X-QBasair-LLM-Key": "k", "X-QBasair-LLM-Model": "gpt-5"}
    api_client.get("/api/research-agent/settings", headers={**headers, "X-QBasair-LLM-Thinking": "low"})
    api_client.get("/api/research-agent/settings", headers={**headers, "X-QBasair-LLM-Thinking": "extreme"})
    assert [runtime.thinking for runtime in seen] == ["low", ""]