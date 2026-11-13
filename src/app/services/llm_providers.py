"""The AI providers a reader can connect the study to (Settings → «الذكاء الاصطناعي»).

Every provider's address is known here: the reader only brings a key (or
signs in, for OpenRouter) and picks a model — never a hostname. A request
names its provider (`X-QBasair-LLM-Provider`) and the server talks to that
provider's fixed address only, with the reader's own key only (the server's
key is never attached to someone else's account), so a client can't point
the server anywhere else.

All but Ollama speak the OpenAI chat-completions dialect, so one client
(`OpenAICompatibleResearchLlmProvider`) covers them; it reuses every step of
the research agent (they all go through `_chat`). Retrieval embeddings stay
on our side: a connected provider is used for chat only.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib import error, request

from src.app.core import config


@dataclass(frozen=True)
class ProviderSpec:
    id: str
    name: str
    base_url: str
    # "openai": chat completions + /models; "ollama": Ollama's own API.
    dialect: str
    # Where the reader gets a key.
    key_url: str
    # The provider offers a sign-in that hands us a key (OAuth PKCE).
    signin: bool = False
    # Model names to preselect, in order (substring match on the listed models).
    prefer: tuple[str, ...] = ()


PROVIDERS: dict[str, ProviderSpec] = {
    spec.id: spec
    for spec in (
        ProviderSpec(
            "openrouter", "OpenRouter", "https://openrouter.ai/api/v1", "openai", "https://openrouter.ai/keys",
            signin=True, prefer=("anthropic/claude-sonnet", "openai/gpt-4o-mini", "google/gemini-2.5-flash"),
        ),
        ProviderSpec("openai", "OpenAI", "https://api.openai.com/v1", "openai", "https://platform.openai.com/api-keys",
                     prefer=("gpt-4.1-mini", "gpt-4o-mini", "gpt-4o")),
        ProviderSpec("anthropic", "Anthropic (Claude)", "https://api.anthropic.com/v1", "openai",
                     "https://console.anthropic.com/settings/keys", prefer=("claude-sonnet", "claude-haiku")),
        ProviderSpec("gemini", "Google Gemini", "https://generativelanguage.googleapis.com/v1beta/openai", "openai",
                     "https://aistudio.google.com/apikey", prefer=("gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash")),
        ProviderSpec("mistral", "Mistral", "https://api.mistral.ai/v1", "openai", "https://console.mistral.ai/api-keys",
                     prefer=("mistral-large-latest", "mistral-medium", "mistral-small-latest")),
        ProviderSpec("deepseek", "DeepSeek", "https://api.deepseek.com/v1", "openai", "https://platform.deepseek.com/api_keys",
                     prefer=("deepseek-chat",)),
        ProviderSpec("groq", "Groq", "https://api.groq.com/openai/v1", "openai", "https://console.groq.com/keys",
                     prefer=("llama-3.3-70b", "llama-3.1-70b")),
        ProviderSpec("xai", "xAI (Grok)", "https://api.x.ai/v1", "openai", "https://console.x.ai", prefer=("grok-3-mini", "grok-3", "grok")),
        ProviderSpec("ollama", "Ollama Cloud", "https://ollama.com", "ollama", "https://ollama.com/settings/keys",
                     prefer=("gpt-oss", "qwen3", "deepseek")),
    )
}

OPENROUTER_KEY_EXCHANGE_URL = "https://openrouter.ai/api/v1/auth/keys"

# Listed models that can't hold a conversation (images, speech, embeddings, moderation).
_NOT_CHAT = ("embed", "whisper", "tts", "dall-e", "moderation", "audio", "image", "transcribe", "realtime", "search")


def provider_spec(provider_id: str) -> ProviderSpec | None:
    return PROVIDERS.get((provider_id or "").strip().lower())


def _headers(spec: ProviderSpec, api_key: str) -> dict[str, str]:
    headers = {"Content-Type": "application/json", "Accept": "application/json", "Authorization": f"Bearer {api_key}"}
    if spec.id == "anthropic":
        # Anthropic's own endpoints (the model list) read these.
        headers["x-api-key"] = api_key
        headers["anthropic-version"] = "2023-06-01"
    if spec.id == "openrouter":
        headers["X-Title"] = "Basair"
        public = config.get_public_url()
        if public:
            headers["HTTP-Referer"] = public
    return headers


def chat_model_names(payload: Any) -> list[str]:
    """Model ids from a `/models` answer, chat models only, without Gemini's "models/" prefix."""
    rows = payload.get("data") if isinstance(payload, dict) else payload
    names: list[str] = []
    for row in rows if isinstance(rows, list) else []:
        name = str((row or {}).get("id") or "").strip() if isinstance(row, dict) else ""
        if name.startswith("models/"):
            name = name[len("models/"):]
        if name and not any(word in name.lower() for word in _NOT_CHAT) and name not in names:
            names.append(name)
    return sorted(names)


def preferred_model(spec: ProviderSpec, names: list[str]) -> str | None:
    for wanted in spec.prefer:
        for name in names:
            if wanted in name:
                return name
    return names[0] if names else None


def exchange_openrouter_code(code: str, verifier: str, timeout: float = 20.0) -> str:
    """OpenRouter's sign-in (PKCE): the code it sent back, for the reader's own key."""
    from src.app.services.research_agent_service import ResearchProviderUnavailable, _bounded_provider_error

    body = json.dumps({"code": code, "code_verifier": verifier, "code_challenge_method": "S256"}).encode("utf-8")
    req = request.Request(
        OPENROUTER_KEY_EXCHANGE_URL, data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with request.urlopen(req, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise ResearchProviderUnavailable(_bounded_provider_error(f"OpenRouter sign-in failed with HTTP {exc.code}: {detail}")) from exc
    except (error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        raise ResearchProviderUnavailable(_bounded_provider_error(f"OpenRouter is unavailable: {exc}")) from exc
    key = payload.get("key") if isinstance(payload, dict) else None
    if not isinstance(key, str) or not key:
        raise ResearchProviderUnavailable("OpenRouter did not return a key.")
    return key


def make_openai_compatible_provider(runtime: Any) -> Any:
    """The research agent over an OpenAI-compatible provider (imported lazily:
    research_agent_service imports this module the same way)."""
    from src.app.services import research_agent_service as agent

    class OpenAICompatibleResearchLlmProvider(agent.OllamaResearchLlmProvider):
        def __init__(self, settings: Any) -> None:
            super().__init__(settings)
            self.spec = provider_spec(settings.provider_name)
            assert self.spec is not None

        def _request(self, method: str, path: str, payload: dict[str, Any] | None, *, stage: str, model: str = "") -> dict[str, Any]:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
            req = request.Request(f"{self.spec.base_url}{path}", data=body, headers=_headers(self.spec, self.api_key), method=method)
            name = self.spec.name
            try:
                with request.urlopen(req, timeout=self.timeout) as response:
                    parsed = json.loads(response.read().decode("utf-8"))
            except error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                raise agent.ResearchProviderUnavailable(
                    agent._bounded_provider_error(f"{name} request failed with HTTP {exc.code}: {detail}")
                ) from exc
            except (error.URLError, TimeoutError, OSError) as exc:
                raise agent.ResearchProviderUnavailable(agent._bounded_provider_error(f"{name} is unavailable: {exc}")) from exc
            except json.JSONDecodeError as exc:
                raise agent.ResearchProviderResponseError(f"{name} returned invalid JSON.") from exc
            if not isinstance(parsed, dict):
                raise agent.ResearchProviderResponseError(f"{name} returned an unexpected answer.")
            if stage != "models":
                usage = parsed.get("usage") or {}
                self.usage.add_step(
                    stage,
                    model,
                    {"prompt_eval_count": usage.get("prompt_tokens") or 0, "eval_count": usage.get("completion_tokens") or 0},
                )
            return parsed

        def _chat(self, messages: list[dict[str, str]], *, temperature: float = 0.1, stage: str = "chat") -> str:
            if not self.chat_model:
                raise agent.ResearchProviderUnavailable(f"Choose a {self.spec.name} model in Settings.")
            payload: dict[str, Any] = {"model": self.chat_model, "messages": messages, "temperature": temperature}
            try:
                response = self._request("POST", "/chat/completions", payload, stage=stage, model=self.chat_model)
            except agent.ResearchProviderUnavailable as exc:
                # Some reasoning models only take their default temperature.
                if "temperature" not in str(exc).lower():
                    raise
                payload.pop("temperature")
                response = self._request("POST", "/chat/completions", payload, stage=stage, model=self.chat_model)
            choices = response.get("choices") or []
            content = (choices[0].get("message") or {}).get("content") if choices and isinstance(choices[0], dict) else None
            if isinstance(content, list):  # content parts
                content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
            if not isinstance(content, str) or not content.strip():
                raise agent.ResearchProviderResponseError(f"{self.spec.name} returned an empty answer.")
            return content.strip()

        def list_models(self) -> list[Any]:
            names = chat_model_names(self._request("GET", "/models", None, stage="models"))
            if self.chat_model and self.chat_model not in names:
                names.insert(0, self.chat_model)
            return [agent.make_model_item(name, is_cloud=True, capabilities=["completion"]) for name in names]

        def provider_info(self) -> Any:
            return agent.ResearchProviderInfo(
                provider=self.spec.id,
                transport="cloud_api",
                base_url=self.spec.base_url,
                chat_model=self.chat_model,
                authenticated=bool(self.api_key),
            )

    return OpenAICompatibleResearchLlmProvider(runtime)
