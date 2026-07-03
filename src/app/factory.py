from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from src.app.core import config
from src.app.routes import (
    auth_router,
    companions_router,
    health_router,
    mushafs_router,
    reader_router,
    research_router,
    search_router,
)
from src.app.services import app_data_service, auth_service, quran_service


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    quran_service.close_db_connection()
    quran_service.reset_morphology_search_index()


def _extract_token(request: Request) -> str | None:
    """Read the session token from a Bearer header (native) or cookie (web)."""
    header = request.headers.get("Authorization") or request.headers.get("authorization")
    if header and header.lower().startswith("bearer "):
        candidate = header[7:].strip()
        if candidate:
            return candidate
    return request.cookies.get(config.get_session_cookie_name()) or None


def require_authenticated_session(request: Request) -> None:
    """Hard gate — 401 unless a live session token is presented.

    Attached to the Studio/research router only: reading + search stay open to
    guests, but the LLM research surface requires an account.
    """
    resolved = auth_service.resolve_session(_extract_token(request))
    if resolved is None:
        raise HTTPException(
            status_code=401,
            detail={"code": "auth_required", "gate": "studio", "message": "Authentication required."},
        )
    request.state.auth_user = resolved.user
    request.state.session_id = resolved.session_id


def attach_optional_session(request: Request) -> None:
    """Soft auth — resolve the token if present, never 401.

    Attached to the open routers (reader, search, mushafs, companions) so an
    authenticated user's notebook/preferences resolve to *their* user_id
    instead of silently reading/writing as the guest (user_id=0).
    """
    resolved = auth_service.resolve_session(_extract_token(request))
    if resolved is not None:
        request.state.auth_user = resolved.user
        request.state.session_id = resolved.session_id


def create_app() -> FastAPI:
    app = FastAPI(
        title="Q-Basair API",
        version="1.0.0",
        summary="Search, suggestion, and Quran reader APIs for Q-Basair.",
        lifespan=lifespan,
        openapi_tags=[
            {"name": "system", "description": "Health and platform metadata."},
            {"name": "auth", "description": "Private beta session authentication endpoints."},
            {"name": "catalog", "description": "Mushaf metadata endpoints."},
            {"name": "search", "description": "Suggestion and search endpoints."},
            {"name": "reader", "description": "Reader and Quran page endpoints."},
            {"name": "research", "description": "Strict-context Quran research agent endpoints."},
        ],
    )
    app.add_middleware(
        SessionMiddleware,
        secret_key=config.get_session_secret(),
        session_cookie=config.get_session_cookie_name(),
        same_site="lax",
        https_only=config.is_session_secure(),
        max_age=60 * 60 * 24 * 14,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.get_cors_origins(),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )
    if config.is_auth_enabled():
        auth_service.ensure_auth_db()
    app_data_service.ensure_app_db()

    # Hybrid gating: reading + search are open to guests (soft auth resolves the
    # user when signed in); only the Studio/research surface is hard-gated.
    open_dependencies = [Depends(attach_optional_session)] if config.is_auth_enabled() else []
    gated_dependencies = [Depends(require_authenticated_session)] if config.is_auth_enabled() else []

    app.include_router(auth_router)
    app.include_router(health_router)
    app.include_router(mushafs_router, dependencies=open_dependencies)
    app.include_router(search_router, dependencies=open_dependencies)
    app.include_router(reader_router, dependencies=open_dependencies)
    app.include_router(companions_router, dependencies=open_dependencies)
    app.include_router(research_router, dependencies=gated_dependencies)
    return app


app = create_app()
