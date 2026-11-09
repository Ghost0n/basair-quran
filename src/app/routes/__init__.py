from src.app.routes.ai import router as ai_router
from src.app.routes.auth import router as auth_router
from src.app.routes.community import router as community_router
from src.app.routes.companions import router as companions_router
from src.app.routes.feedback import router as feedback_router
from src.app.routes.health import router as health_router
from src.app.routes.moderation import router as moderation_router
from src.app.routes.mushafs import router as mushafs_router
from src.app.routes.offline import router as offline_router
from src.app.routes.reader import router as reader_router
from src.app.routes.recitations import router as recitations_router
from src.app.routes.research import router as research_router
from src.app.routes.search import router as search_router
from src.app.routes.translations import router as translations_router

__all__ = [
    "ai_router",
    "auth_router",
    "community_router",
    "companions_router",
    "feedback_router",
    "health_router",
    "moderation_router",
    "mushafs_router",
    "offline_router",
    "reader_router",
    "recitations_router",
    "research_router",
    "search_router",
    "translations_router",
]
