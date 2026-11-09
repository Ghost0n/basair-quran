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
    assert provider.supports_embeddings is False


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
