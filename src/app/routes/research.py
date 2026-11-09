from fastapi import APIRouter, Header, HTTPException

from src.app.models.api import ResearchAgentRequest, ResearchAgentResponse, ResearchAgentSettingsResponse
from src.app.services import research_agent_service

router = APIRouter(prefix="/api", tags=["research"])


def build_runtime_settings(
    ollama_key: str | None,
    ollama_chat_model: str | None,
    ollama_embed_model: str | None,
    ollama_base_url: str | None,
    llm_provider: str | None = None,
    llm_key: str | None = None,
    llm_model: str | None = None,
) -> research_agent_service.ResearchRuntimeSettings:
    # A reader's own provider (Settings → «الذكاء الاصطناعي»): its known address,
    # their key, their model. Otherwise the server's own model (or the older
    # Ollama override headers).
    if llm_provider and llm_provider.strip():
        return research_agent_service.build_provider_runtime(llm_provider, llm_key, llm_model)
    return research_agent_service.build_runtime_settings(
        api_key=ollama_key or None,
        chat_model=ollama_chat_model or None,
        embed_model=ollama_embed_model or None,
        base_url=ollama_base_url or None,
    )


@router.get("/research-agent/settings", response_model=ResearchAgentSettingsResponse, response_model_exclude_none=True)
def research_agent_settings(
    x_qbasair_ollama_key: str | None = Header(default=None),
    x_qbasair_ollama_chat_model: str | None = Header(default=None),
    x_qbasair_ollama_embed_model: str | None = Header(default=None),
    x_qbasair_ollama_base_url: str | None = Header(default=None),
    x_qbasair_llm_provider: str | None = Header(default=None),
    x_qbasair_llm_key: str | None = Header(default=None),
    x_qbasair_llm_model: str | None = Header(default=None),
) -> ResearchAgentSettingsResponse:
    try:
        runtime = build_runtime_settings(
            x_qbasair_ollama_key,
            x_qbasair_ollama_chat_model,
            x_qbasair_ollama_embed_model,
            x_qbasair_ollama_base_url,
            x_qbasair_llm_provider,
            x_qbasair_llm_key,
            x_qbasair_llm_model,
        )
        return research_agent_service.get_research_agent_settings(runtime)
    except research_agent_service.ResearchProviderUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except research_agent_service.ResearchProviderResponseError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/research-agent", response_model=ResearchAgentResponse, response_model_exclude_none=True)
def research_agent(
    req: ResearchAgentRequest,
    x_qbasair_ollama_key: str | None = Header(default=None),
    x_qbasair_ollama_chat_model: str | None = Header(default=None),
    x_qbasair_ollama_embed_model: str | None = Header(default=None),
    x_qbasair_ollama_base_url: str | None = Header(default=None),
    x_qbasair_llm_provider: str | None = Header(default=None),
    x_qbasair_llm_key: str | None = Header(default=None),
    x_qbasair_llm_model: str | None = Header(default=None),
) -> ResearchAgentResponse:
    try:
        runtime = build_runtime_settings(
            x_qbasair_ollama_key,
            x_qbasair_ollama_chat_model,
            x_qbasair_ollama_embed_model,
            x_qbasair_ollama_base_url,
            x_qbasair_llm_provider,
            x_qbasair_llm_key,
            x_qbasair_llm_model,
        )
        return research_agent_service.run_research_agent(req, runtime)
    except research_agent_service.ResearchProviderUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except research_agent_service.ResearchProviderResponseError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
