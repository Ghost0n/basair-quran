"""Quran translations of meanings (read-only). See docs/quran-translations.md."""

from fastapi import APIRouter, HTTPException, Query, Response

from src.app.models.api import TranslationAyahsResponse, TranslationInfo
from src.app.services import translation_service

router = APIRouter(prefix="/api", tags=["translations"])


@router.get("/translations", response_model=list[TranslationInfo])
def list_translations(response: Response) -> list[TranslationInfo]:
    """Installed translations with their source, translator, version and terms (empty when none are built)."""
    response.headers["Cache-Control"] = "public, max-age=300"
    return [TranslationInfo(**item) for item in translation_service.catalogue()]


@router.get("/translations/ayahs", response_model=TranslationAyahsResponse, response_model_exclude_none=True)
def translation_ayahs(
    response: Response,
    keys: str = Query(..., max_length=260, description="Comma-separated translation keys (≤3)"),
    refs: str = Query(..., max_length=2000, description="surah:ayah or surah:start-end, comma-separated (≤400 ayahs)"),
) -> TranslationAyahsResponse:
    try:
        parsed = translation_service.parse_refs(refs)
    except translation_service.TranslationRequestError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    response.headers["Cache-Control"] = "public, max-age=3600"
    return TranslationAyahsResponse(**translation_service.ayah_texts(keys.split(","), parsed))
