import time
from typing import Optional

from fastapi import APIRouter, Query

from src.app.models.api import (
    AyahReaderMoreResponse,
    AyahReaderResponse,
    MorphologyResponse,
    MushafPageLayoutResponse,
    QuranPageResponse,
)
from src.app.services import morphology_service, quran_service

router = APIRouter(prefix="/api", tags=["reader"])


@router.get("/ayah-reader", response_model=AyahReaderResponse, response_model_exclude_none=True)
def ayah_reader(
    mushaf: int = Query(1, description="Mushaf ID"),
    ayah_id: int = Query(..., ge=1),
    before: int = Query(7, ge=0, le=50),
    after: int = Query(7, ge=0, le=50),
) -> AyahReaderResponse:
    start = time.time()
    cursor = quran_service.get_db().cursor()
    payload = quran_service.build_ayah_reader_payload(cursor, mushaf, ayah_id, before, after)
    elapsed = (time.time() - start) * 1000

    if not payload["found"]:
        quran_service.logger.info("GET /api/ayah-reader?ayah_id=%s&mushaf=%s - %.1fms - not found", ayah_id, mushaf, elapsed)
        return AyahReaderResponse(**payload)

    quran_service.logger.info(
        "GET /api/ayah-reader?ayah_id=%s&mushaf=%s - %.1fms - %s ayahs",
        ayah_id,
        mushaf,
        elapsed,
        len(payload["ayahs"]),
    )
    return AyahReaderResponse(**payload)


@router.get("/ayah-reader-more", response_model=AyahReaderMoreResponse, response_model_exclude_none=True)
def ayah_reader_more(
    mushaf: int = Query(1, description="Mushaf ID"),
    surah_id: int = Query(..., ge=1),
    anchor_ayah: int = Query(..., ge=1),
    direction: str = Query(..., pattern="^(before|after)$"),
    count: int = Query(10, ge=1, le=50),
) -> AyahReaderMoreResponse:
    start = time.time()
    cursor = quran_service.get_db().cursor()
    payload = quran_service.build_ayah_reader_more_payload(cursor, mushaf, surah_id, anchor_ayah, direction, count)
    elapsed = (time.time() - start) * 1000

    if not payload["found"]:
        quran_service.logger.info(
            "GET /api/ayah-reader-more?surah_id=%s&anchor=%s&dir=%s&mushaf=%s - %.1fms - not found",
            surah_id,
            anchor_ayah,
            direction,
            mushaf,
            elapsed,
        )
        return AyahReaderMoreResponse(**payload)

    quran_service.logger.info(
        "GET /api/ayah-reader-more?surah_id=%s&anchor=%s&dir=%s&mushaf=%s - %.1fms - %s ayahs",
        surah_id,
        anchor_ayah,
        direction,
        mushaf,
        elapsed,
        len(payload["ayahs"]),
    )
    return AyahReaderMoreResponse(**payload)


@router.get("/quran-page", response_model=QuranPageResponse, response_model_exclude_none=True)
def quran_page(
    mushaf: int = Query(1, description="Mushaf ID"),
    page: Optional[int] = Query(None, ge=1),
    ayah_id: Optional[int] = Query(None, ge=1),
    selected_ayah_id: Optional[int] = Query(None, ge=1),
    surah: Optional[int] = Query(None, ge=1, le=114, description="Jump to this surah"),
    ayah: Optional[int] = Query(None, ge=1, description="Jump to this ayah within the surah"),
    juz: Optional[int] = Query(None, ge=1, le=30, description="Jump to the first page of this juz"),
) -> QuranPageResponse:
    start = time.time()
    cursor = quran_service.get_db().cursor()
    payload = quran_service.build_quran_page_payload(
        cursor, mushaf, page, ayah_id, selected_ayah_id, surah, ayah, juz
    )
    elapsed = (time.time() - start) * 1000

    if not payload["found"]:
        quran_service.logger.info(
            "GET /api/quran-page?mushaf=%s&page=%s&ayah_id=%s - %.1fms - not found",
            mushaf,
            page,
            ayah_id,
            elapsed,
        )
        return QuranPageResponse(**payload)

    quran_service.logger.info(
        "GET /api/quran-page?mushaf=%s&page=%s&ayah_id=%s - %.1fms - page %s, %s ayahs",
        mushaf,
        page,
        ayah_id,
        elapsed,
        payload["page"],
        len(payload["ayahs"]),
    )
    return QuranPageResponse(**payload)


@router.get("/mushaf-page-layout", response_model=MushafPageLayoutResponse, response_model_exclude_none=True)
def mushaf_page_layout(
    mushaf: int = Query(2, description="Mushaf ID — the authentic Madani layout is Hafs-only"),
    page: Optional[int] = Query(None, ge=1, le=604),
    selected_ayah_id: Optional[int] = Query(None, ge=1),
) -> MushafPageLayoutResponse:
    start = time.time()
    cursor = quran_service.get_db().cursor()
    payload = quran_service.build_mushaf_page_layout(cursor, mushaf, page, selected_ayah_id)
    elapsed = (time.time() - start) * 1000

    status = (
        "fallback:reader" if payload.get("fallback")
        else (f"page {payload['page']}, {len(payload['lines'])} lines" if payload["found"] else "not found")
    )
    quran_service.logger.info(
        "GET /api/mushaf-page-layout?mushaf=%s&page=%s - %.1fms - %s", mushaf, page, elapsed, status
    )
    return MushafPageLayoutResponse(**payload)


@router.get("/morphology", response_model=MorphologyResponse, response_model_exclude_none=True)
def morphology(
    surah: int = Query(..., ge=1, le=114, description="Surah number"),
    ayah: int = Query(..., ge=1, description="Ayah number within the surah"),
    mushaf: int | None = Query(
        None,
        ge=1,
        description="Mushaf ID of the displayed verse. The server reads that riwāyah's "
        "ayah text itself and matches it by skeleton, so the lookup is correct across "
        "riwāyāt with different ayah numbering (preferred over `text`).",
    ),
    text: str | None = Query(
        None,
        description="Deprecated: the displayed ayah text (long URLs — use `mushaf`).",
    ),
) -> MorphologyResponse:
    start = time.time()
    if text is None and mushaf is not None:
        text = quran_service.get_ayah_text(mushaf, surah, ayah)
    payload = morphology_service.get_ayah_morphology(surah, ayah, text)
    quran_service.logger.info(
        "GET /api/morphology?surah=%s&ayah=%s - %.1fms - %s words",
        surah,
        ayah,
        (time.time() - start) * 1000,
        len(payload["words"]),
    )
    return MorphologyResponse(**payload)
