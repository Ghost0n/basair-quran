import time

from fastapi import APIRouter, HTTPException, Path, Query, Response

from src.app.models.api import MushafItem, ReciterDurations, ReciterItem, SurahListItem
from src.app.services import quran_service, recitation_cache_service, reciter_service

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


@router.get("/reciters/{reciter_id}/durations/{surah}", response_model=ReciterDurations)
def get_reciter_durations(
    response: Response,
    reciter_id: str = Path(..., min_length=1, max_length=64),
    surah: int = Path(..., ge=1, le=114),
) -> ReciterDurations:
    """Verse audio durations of a reciter's surah, measured once on the server
    and shared by every user (recitation_cache_service). Never waits on the
    network: an incomplete surah returns what is known and fills in the
    background — the client asks again a moment later."""
    start = time.time()
    result = recitation_cache_service.surah_durations(reciter_id, surah)
    if result is None:
        raise HTTPException(status_code=404, detail="Unknown reciter")
    durations, complete = result
    # A complete surah never changes: browsers and any CDN keep it for a year.
    response.headers["Cache-Control"] = "public, max-age=31536000, immutable" if complete else "no-store"
    quran_service.logger.info(
        "GET /api/reciters/%s/durations/%s - %.1fms - %s",
        reciter_id,
        surah,
        (time.time() - start) * 1000,
        "complete" if complete else "filling",
    )
    return ReciterDurations(reciter_id=reciter_id, surah=surah, durations=durations, complete=complete)
