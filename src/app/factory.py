from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.app.core import config
from src.app.routes import health_router, mushafs_router, reader_router, search_router
from src.app.services import quran_service


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    quran_service.close_db_connection()
    quran_service.reset_morphology_search_index()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Q-Basair API",
        version="1.0.0",
        summary="Search, suggestion, and Quran reader APIs for Q-Basair.",
        lifespan=lifespan,
        openapi_tags=[
            {"name": "system", "description": "Health and platform metadata."},
            {"name": "catalog", "description": "Mushaf metadata endpoints."},
            {"name": "search", "description": "Suggestion and search endpoints."},
            {"name": "reader", "description": "Reader and Quran page endpoints."},
        ],
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.get_cors_origins(),
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )
    app.include_router(health_router)
    app.include_router(mushafs_router)
    app.include_router(search_router)
    app.include_router(reader_router)
    return app


app = create_app()
