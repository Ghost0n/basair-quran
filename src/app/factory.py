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


def create_app() -> FastAPI:
    def require_authenticated_session(request: Request) -> None:
        user_id = request.session.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Authentication required.")

        try:
            resolved_user_id = int(user_id)
        except (TypeError, ValueError):
            request.session.clear()
            raise HTTPException(status_code=401, detail="Authentication required.")

        user = auth_service.get_user_by_id(resolved_user_id)
        if user is None or not user.is_active:
            request.session.clear()
            raise HTTPException(status_code=401, detail="Authentication required.")

        request.state.auth_user = user

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
    app.include_router(auth_router)
    app.include_router(health_router)
    protected_dependencies = [Depends(require_authenticated_session)] if config.is_auth_enabled() else []
    app.include_router(mushafs_router, dependencies=protected_dependencies)
    app.include_router(search_router, dependencies=protected_dependencies)
    app.include_router(research_router, dependencies=protected_dependencies)
    app.include_router(reader_router, dependencies=protected_dependencies)
    app.include_router(companions_router, dependencies=protected_dependencies)
    return app


app = create_app()
