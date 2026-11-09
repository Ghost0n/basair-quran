"""The AI providers a reader can connect the study to (docs/ai-connections.md)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from src.app.models.api import AiProviderItem, OpenRouterKeyRequest, OpenRouterKeyResponse
from src.app.services import llm_providers, research_agent_service

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.get("/providers", response_model=list[AiProviderItem])
def get_providers() -> list[AiProviderItem]:
    """Every provider, with where to get a key and whether it offers a sign-in.
    Their addresses stay on the server: a reader never types one."""
    return [
        AiProviderItem(id=spec.id, name=spec.name, key_url=spec.key_url, signin=spec.signin, prefer=list(spec.prefer))
        for spec in llm_providers.PROVIDERS.values()
    ]


@router.post("/openrouter/key", response_model=OpenRouterKeyResponse)
def openrouter_key(req: OpenRouterKeyRequest) -> OpenRouterKeyResponse:
    """OpenRouter's sign-in (OAuth PKCE): the code it sent back and the
    verifier the browser kept, exchanged for the reader's own key. The key is
    returned to the reader's device only; the server keeps nothing."""
    try:
        return OpenRouterKeyResponse(key=llm_providers.exchange_openrouter_code(req.code, req.code_verifier))
    except research_agent_service.ResearchProviderUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
