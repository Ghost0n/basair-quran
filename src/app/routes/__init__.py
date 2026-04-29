from src.app.routes.health import router as health_router
from src.app.routes.mushafs import router as mushafs_router
from src.app.routes.reader import router as reader_router
from src.app.routes.search import router as search_router

__all__ = ["health_router", "mushafs_router", "reader_router", "search_router"]
