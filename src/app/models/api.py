from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    timestamp: float


class MushafItem(BaseModel):
    id: int
    name: str
    description: Optional[str] = None


class SuggestionItem(BaseModel):
    type: Literal["word", "root", "phrase"]
    text: str
    root_id: Optional[int] = None


class BatchSuggestRequest(BaseModel):
    queries: List[str]
    mushaf: int = 1
    mode: Literal["root", "exact"] = "root"
    with_chakl: bool = False


class DidYouMeanSuggestion(BaseModel):
    text: str
    confidence: float


class SearchVerse(BaseModel):
    ayah_id: int
    mushaf_id: int
    surah: str
    surah_id: int
    ayah: int
    text: str
    global_index: int
    highlights: List[int] = Field(default_factory=list)


class LegacySearchResult(BaseModel):
    root: str
    root_id: Optional[int] = None
    total_occurrences: int
    total_verses: int
    verses: List[SearchVerse]
    search_type: str
    match_type: Optional[Literal["word", "phrase"]] = None


class LegacySearchResponse(BaseModel):
    found: bool
    message: Optional[str] = None
    results: List[LegacySearchResult]
    did_you_mean: Optional[DidYouMeanSuggestion] = None


class PaginatedSearchResult(BaseModel):
    result_key: str
    root: str
    root_id: Optional[int] = None
    search_type: str
    match_type: Optional[Literal["word", "phrase"]] = None
    page: int
    page_size: int
    total_pages: int
    total_occurrences: int
    total_verses: int
    verses: List[SearchVerse]


class PaginatedSearchResponse(BaseModel):
    found: bool
    message: Optional[str] = None
    page_size: Optional[int] = None
    results: List[PaginatedSearchResult]
    did_you_mean: Optional[DidYouMeanSuggestion] = None


class SearchResultPageResponse(BaseModel):
    found: bool
    result: PaginatedSearchResult


class ReaderAyah(BaseModel):
    ayah_id: int
    ayah: int
    text: str
    global_index: int
    is_center: bool


class AyahReaderResponse(BaseModel):
    found: bool
    mushaf_id: Optional[int] = None
    surah_id: Optional[int] = None
    surah: Optional[str] = None
    center_ayah_id: Optional[int] = None
    start_ayah: Optional[int] = None
    end_ayah: Optional[int] = None
    has_previous: Optional[bool] = None
    has_next: Optional[bool] = None
    ayahs: List[ReaderAyah]


class AyahReaderMoreResponse(BaseModel):
    found: bool
    surah_id: Optional[int] = None
    direction: Optional[Literal["before", "after"]] = None
    has_more: Optional[bool] = None
    ayahs: List[ReaderAyah]


class QuranPageSurah(BaseModel):
    id: int
    name: str


class QuranPageAyah(BaseModel):
    ayah_id: int
    mushaf_id: int
    surah_id: int
    surah: str
    ayah: int
    text: str
    global_index: int
    page: str | int
    line_start: Optional[int] = None
    line_end: Optional[int] = None
    is_selected: bool


class QuranPageResponse(BaseModel):
    found: bool
    mushaf_id: Optional[int] = None
    page: Optional[int] = None
    min_page: Optional[int] = None
    max_page: Optional[int] = None
    total_pages: Optional[int] = None
    page_count: Optional[int] = None
    has_previous: Optional[bool] = None
    has_next: Optional[bool] = None
    selected_ayah_id: Optional[int] = None
    surahs: List[QuranPageSurah] = Field(default_factory=list)
    ayahs: List[QuranPageAyah]
