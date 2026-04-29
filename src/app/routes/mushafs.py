import time

from fastapi import APIRouter

from src.app.models.api import MushafItem
from src.app.services import quran_service

router = APIRouter(prefix="/api", tags=["catalog"])


@router.get("/mushafs", response_model=list[MushafItem])
def get_mushafs() -> list[MushafItem]:
    start = time.time()
    cursor = quran_service.get_db().cursor()
    cursor.execute("SELECT id, name, description FROM mushafs ORDER BY id")
    mushafs = [MushafItem(id=row["id"], name=row["name"], description=row["description"]) for row in cursor.fetchall()]
    quran_service.logger.info("GET /api/mushafs - %.1fms", (time.time() - start) * 1000)
    return mushafs
