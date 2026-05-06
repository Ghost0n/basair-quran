from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    timestamp: float


class AuthLoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=8, max_length=256)


class AuthUserInfo(BaseModel):
    id: int
    email: str
    is_admin: bool = False


class AuthSessionResponse(BaseModel):
    enabled: bool = False
    authenticated: bool = False
    user: Optional[AuthUserInfo] = None


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


class ResearchAgentMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=4000)


class ResearchAgentRequest(BaseModel):
    messages: List[ResearchAgentMessage] = Field(..., min_length=1, max_length=12)
    mushaf: int = 1
    max_results: int = Field(8, ge=1, le=20)
    answer_language: str = Field("auto", max_length=32)
    response_mode: Literal["strict", "tafssir"] = "strict"
    tafssir_depth: Literal["fast", "balanced", "deep"] = "balanced"


class ResearchRelatedTerm(BaseModel):
    type: Literal["root", "word", "phrase"]
    text: str
    root_id: Optional[int] = None
    reason: Optional[str] = None


class ResearchSearchItem(BaseModel):
    mode: Literal["root", "exact"]
    query: str
    reason: Optional[str] = None
    result_count: int = 0


class ResearchAgentAyah(SearchVerse):
    matched_terms: List[str] = Field(default_factory=list)


class TafssirStructuredAnswer(BaseModel):
    summary: Optional[str] = None
    linguistic_analysis: Optional[str] = None
    ayah_connections: Optional[str] = None
    corpus_insight: Optional[str] = None
    limits_and_cautions: Optional[str] = None


class ResearchProviderInfo(BaseModel):
    provider: Literal["ollama"]
    transport: Literal["cloud_api", "local_api"]
    base_url: str
    chat_model: str
    embed_model: Optional[str] = None
    authenticated: bool = False


class ResearchUsageStep(BaseModel):
    stage: str
    model: str
    total_duration_ns: int = 0
    load_duration_ns: int = 0
    prompt_eval_count: int = 0
    eval_count: int = 0


class ResearchUsageSummary(BaseModel):
    request_count: int = 0
    total_duration_ns: int = 0
    load_duration_ns: int = 0
    prompt_eval_count: int = 0
    eval_count: int = 0
    steps: List[ResearchUsageStep] = Field(default_factory=list)


class ResearchLimitsInfo(BaseModel):
    summary: str
    plan_reference_url: Optional[str] = None
    notes: List[str] = Field(default_factory=list)


class OllamaModelItem(BaseModel):
    name: str
    size: Optional[int] = None
    modified_at: Optional[str] = None
    digest: Optional[str] = None
    is_cloud: bool = False
    capabilities: List[str] = Field(default_factory=list)


class ResearchAgentSettingsResponse(BaseModel):
    provider: ResearchProviderInfo
    available_models: List[OllamaModelItem] = Field(default_factory=list)
    limits: ResearchLimitsInfo


class ResearchAgentResponse(BaseModel):
    status: Literal["needs_clarification", "answered", "no_results"]
    mode: Literal["strict", "tafssir"] = "strict"
    answer: Optional[str] = None
    clarifying_question: Optional[str] = None
    disclaimer: Optional[str] = None
    tafssir: Optional[TafssirStructuredAnswer] = None
    provider: Optional[ResearchProviderInfo] = None
    usage: Optional[ResearchUsageSummary] = None
    related_terms: List[ResearchRelatedTerm] = Field(default_factory=list)
    searches: List[ResearchSearchItem] = Field(default_factory=list)
    ayahs: List[ResearchAgentAyah] = Field(default_factory=list)
