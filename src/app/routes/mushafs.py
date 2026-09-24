import time

from fastapi import APIRouter, Query

from src.app.models.api import MushafItem, ReciterItem, SurahListItem
from src.app.services import quran_service, reciter_service

router = APIRouter(prefix="/api", tags=["catalog"])

# The mushaf name IS the riwāyah (in Arabic). Map to the normalized english key
# used by ReciterItem.riwayah so the UI can flag a reciter/mushaf mismatch.
_RIWAYAH_BY_NAME = {
    "حفص": "hafs",
    "ورش": "warsh",
    "قالون": "qaloun",
    "شعبة": "shuba",
    "الدوري": "douri",
    "السوسي": "sousi",
}


def _riwayah_for_mushaf(name: str) -> str:
    return _RIWAYAH_BY_NAME.get((name or "").strip(), "hafs")


@router.get("/mushafs", response_model=list[MushafItem])
def get_mushafs() -> list[MushafItem]:
    start = time.time()
    cursor = quran_service.get_db().cursor()
    cursor.execute("SELECT id, name, description FROM mushafs ORDER BY id")
    mushafs = [
        MushafItem(
            id=row["id"],
            name=row["name"],
            description=row["description"],
            riwayah=_riwayah_for_mushaf(row["name"]),
        )
        for row in cursor.fetchall()
    ]
    quran_service.logger.info("GET /api/mushafs - %.1fms", (time.time() - start) * 1000)
    return mushafs


@router.get("/surahs", response_model=list[SurahListItem])
def get_surahs(
    mushaf: int = Query(1, description="Mushaf ID — ayah counts follow its numbering (e.g. al-Baqarah: Hafs 286, Qaloun 285)"),
) -> list[SurahListItem]:
    start = time.time()
    cursor = quran_service.get_db().cursor()
    cursor.execute(
        """
        SELECT
            s.id AS id,
            s.name_arabic AS name,
            s.name_english AS name_english,
            s.type AS type,
            COUNT(a.id) AS ayah_count
        FROM surahs s
        LEFT JOIN ayahs a ON a.surah_id = s.id AND a.mushaf_id = ?
        GROUP BY s.id, s.name_arabic, s.name_english, s.type
        ORDER BY s.id
        """,
        (mushaf,),
    )
    surahs = [
        SurahListItem(
            id=row["id"],
            name=row["name"],
            name_english=row["name_english"],
            type=row["type"],
            ayah_count=row["ayah_count"],
        )
        for row in cursor.fetchall()
    ]
    quran_service.logger.info("GET /api/surahs - %.1fms - %s surahs", (time.time() - start) * 1000, len(surahs))
    return surahs


@router.get("/reciters", response_model=list[ReciterItem])
def get_reciters() -> list[ReciterItem]:
    start = time.time()
    reciters = [ReciterItem(**reciter) for reciter in reciter_service.list_reciters()]
    quran_service.logger.info("GET /api/reciters - %.1fms - %s reciters", (time.time() - start) * 1000, len(reciters))
    return reciters
