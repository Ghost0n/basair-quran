from src.app.routes.auth import router as auth_router
from src.app.routes.community import router as community_router
from src.app.routes.companions import router as companions_router
from src.app.routes.health import router as health_router
from src.app.routes.mushafs import router as mushafs_router
from src.app.routes.reader import router as reader_router
from src.app.routes.research import router as research_router
from src.app.routes.search import router as search_router

__all__ = [
    "auth_router",
    "community_router",
    "companions_router",
    "health_router",
    "mushafs_router",
    "reader_router",
    "research_router",
    "search_router",
]
