import json
from typing import Annotated, Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, StringConstraints, field_validator

# Storage caps for persisted research sessions — guests reach this endpoint, so
# an unbounded messages payload would let anyone bloat the shared app_data.db.
MAX_SESSION_MESSAGES = 500
MAX_SESSION_MESSAGES_BYTES = 512 * 1024


class HealthResponse(BaseModel):
    status: str
    timestamp: float


class ReadyResponse(BaseModel):
    """Deploy-gate readiness: DB reachable + running commit. Distinct from the
    pure-liveness `/api/health` used by the container healthcheck."""

    status: str
    db: bool
    commit: str
    timestamp: float


Platform = Literal["web", "ios", "android", "desktop"]


class AuthLoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=8, max_length=256)
    device_label: Optional[str] = Field(None, max_length=120)
    platform: Optional[Platform] = "web"


class AuthSignupRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=8, max_length=256)
    name: Optional[str] = Field(None, max_length=80)
    # Optional invite code — enforced only when QBASAIR_INVITE_CODES is set
    # (otherwise registration stays open).
    invite_code: Optional[str] = Field(None, max_length=64)
    device_label: Optional[str] = Field(None, max_length=120)
    platform: Optional[Platform] = "web"


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=10, max_length=512)
    password: str = Field(..., min_length=8, max_length=256)


class AuthOkResponse(BaseModel):
    ok: bool = True


class AuthProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=80)
    # A calligraphic medallion character/index — NOT an image URL.
    avatar: Optional[str] = Field(None, max_length=8)
    onboarded: Optional[bool] = None


class AuthUserInfo(BaseModel):
    id: int
    email: str
    is_admin: bool = False
    name: Optional[str] = None
    avatar: Optional[str] = None
    onboarded: bool = False


class AuthSessionResponse(BaseModel):
    enabled: bool = False
    authenticated: bool = False
    user: Optional[AuthUserInfo] = None
    # Set only for native clients (bearer flow); the web app uses the cookie.
    token: Optional[str] = None


class DeviceInfo(BaseModel):
    id: int
    device_label: Optional[str] = None
    platform: Optional[str] = None
    created_at: int
    last_seen_at: int
    is_current: bool = False


class GuestMergeRequest(BaseModel):
    notebook_ids: List[int] = Field(default_factory=list)
    session_ids: List[str] = Field(default_factory=list)
    root_ids: List[int] = Field(default_factory=list)
    include_preferences: bool = False


class GuestMergeResult(BaseModel):
    merged: bool = False
    notebook_moved: int = 0
    sessions_moved: int = 0
    roots_moved: int = 0
    preferences_moved: bool = False
    undo_token: Optional[str] = None


class GuestMergeUndoRequest(BaseModel):
    undo_token: str = Field(..., min_length=1, max_length=64)


class MushafItem(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    # Normalized riwāyah key (matches ReciterItem.riwayah), for reciter/mushaf
    # mismatch detection. Defaults to hafs when unknown.
    riwayah: str = "hafs"


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
    total_surahs: int = 0
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


class SurahListItem(BaseModel):
    id: int
    name: str
    name_english: Optional[str] = None
    type: Optional[str] = None
    ayah_count: int


class QuranPageAyah(BaseModel):
    ayah_id: int
    mushaf_id: int
    surah_id: int
    surah: str
    ayah: int
    text: str
    global_index: int
    page: str | int
    juz: Optional[int] = None
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
    juz: Optional[int] = None
    juz_secondary: Optional[int] = None
    surahs: List[QuranPageSurah] = Field(default_factory=list)
    ayahs: List[QuranPageAyah]


# ---- Authentic Madani (QCF) page layout — Hafs only ----

class MushafLayoutGlyph(BaseModel):
    glyph: str                       # QCF private-use glyph string for the page font
    surah: int
    ayah: int
    word_position: int               # == ayah_words.word_position (text-split tokenization)
    ayah_id: int
    word_key: str                    # "surah:ayah:word_position"
    text: Optional[str] = None       # uthmani word text (aria-label + morphology text-match)
    is_selected: bool = False


class MushafLayoutLine(BaseModel):
    line_number: int
    line_type: Literal["ayah", "surah_name", "basmalah"]
    is_centered: bool = False
    surah_number: Optional[int] = None   # surah_name lines
    surah_name: Optional[str] = None     # surah_name lines (display name)
    glyph: Optional[str] = None          # basmalah lines: the line-level glyph
    font_family: Optional[str] = None    # per-page font id for ayah/basmala glyphs
    words: List[MushafLayoutGlyph] = Field(default_factory=list)


class MushafPageLayoutResponse(BaseModel):
    found: bool
    fallback: Optional[Literal["reader"]] = None  # set when authentic layout unavailable
    mushaf_id: Optional[int] = None
    page: Optional[int] = None
    min_page: Optional[int] = None
    max_page: Optional[int] = None
    has_previous: Optional[bool] = None
    has_next: Optional[bool] = None
    selected_ayah_id: Optional[int] = None
    layout_id: Optional[str] = None
    font_base_path: Optional[str] = None          # e.g. '/fonts/qpc-hafs-v2'
    surahs: List[QuranPageSurah] = Field(default_factory=list)
    lines: List[MushafLayoutLine] = Field(default_factory=list)


class ResearchAgentMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=4000)


class TextCountScopes(BaseModel):
    quran: int
    surah: Optional[int] = None
    page: Optional[int] = None


class TextCountLetter(TextCountScopes):
    letter: str
    in_selection: int


class TextCountResponse(BaseModel):
    """Occurrences of a selected word/phrase and of its letters (reader «إحصاء»)."""

    text: str
    word_count: int
    phrase: TextCountScopes
    letters: List[TextCountLetter]


class ResearchFocusAyah(BaseModel):
    """One ayah the question is about (read in the request's mushaf)."""

    surah: int = Field(..., ge=1, le=114)
    ayah: int = Field(..., ge=1, le=286)


class ResearchAgentRequest(BaseModel):
    messages: List[ResearchAgentMessage] = Field(..., min_length=1, max_length=12)
    mushaf: int = 1
    max_results: int = Field(8, ge=1, le=20)
    answer_language: str = Field("auto", max_length=32)
    response_mode: Literal["strict", "tafssir"] = "strict"
    tafssir_depth: Literal["fast", "balanced", "deep"] = "balanced"
    # Optional: centre the research on one ayah (always kept, read in context).
    focus: Optional[ResearchFocusAyah] = None


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


# ---------------------------------------------------------------------------
# Companions — notebook, research sessions, followed roots (user-data store)
# ---------------------------------------------------------------------------


# Themes: a fixed palette keeps highlights legible on both themes and on glyph pages.
ThemeColor = Literal["gold", "sand", "green", "teal", "blue", "violet", "rose", "grey"]
# Palette order (for automatic assignment): gold, the reader's selection colour, is not first.
THEME_COLORS: tuple[str, ...] = ("green", "blue", "rose", "violet", "teal", "sand", "gold", "grey")
MAX_THEME_NAME_CHARS = 60
MAX_THEME_DESCRIPTION_CHARS = 500
MAX_THEMES_PER_USER = 200
MAX_THEMES_PER_ITEM = 12
MAX_THEME_BOARD_BYTES = 256 * 1024


class NotebookItem(BaseModel):
    id: int
    ayah_id: int
    mushaf_id: int = 1
    surah_id: Optional[int] = None
    surah: Optional[str] = None
    ayah: Optional[int] = None
    text: Optional[str] = None
    note: Optional[str] = None
    collection: Optional[str] = None
    # Themes (مواضيع) this saved ayah is highlighted with; see ThemeSummary.
    theme_ids: List[int] = Field(default_factory=list)
    created_at: int


class NotebookItemCreate(BaseModel):
    ayah_id: int = Field(..., ge=1)
    mushaf_id: int = Field(1, ge=1)
    surah_id: Optional[int] = None
    surah: Optional[str] = None
    ayah: Optional[int] = None
    text: Optional[str] = Field(None, max_length=4000)
    note: Optional[str] = Field(None, max_length=2000)
    collection: Optional[str] = Field(None, max_length=120)
    theme_ids: List[int] = Field(default_factory=list, max_length=MAX_THEMES_PER_ITEM)


class NotebookItemThemes(BaseModel):
    """Replace the themes of one saved ayah (an empty list keeps it saved, untagged)."""

    theme_ids: List[int] = Field(default_factory=list, max_length=MAX_THEMES_PER_ITEM)


class ThemeSummary(BaseModel):
    """A theme (موضوع): a named highlight colour that groups saved ayahs by subject."""

    id: int
    name: str
    color: ThemeColor
    description: Optional[str] = None
    item_count: int = 0
    created_at: int
    updated_at: int


class ThemeDetail(ThemeSummary):
    # The theme board (graph of its ayahs, notes and relations); opaque, versioned JSON.
    board: Optional[dict] = None


class ThemeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=MAX_THEME_NAME_CHARS)
    color: ThemeColor = "green"
    description: Optional[str] = Field(None, max_length=MAX_THEME_DESCRIPTION_CHARS)


class ThemeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=MAX_THEME_NAME_CHARS)
    color: Optional[ThemeColor] = None
    description: Optional[str] = Field(None, max_length=MAX_THEME_DESCRIPTION_CHARS)


class ThemeBoardSave(BaseModel):
    board: dict


class ResearchSessionSummary(BaseModel):
    id: str
    title: str
    mode: Literal["strict", "tafssir"] = "strict"
    message_count: int = 0
    created_at: int
    updated_at: int


class ResearchSessionDetail(ResearchSessionSummary):
    messages: List[Dict[str, Any]] = Field(default_factory=list)


class ResearchSessionSave(BaseModel):
    id: str = Field(..., min_length=1, max_length=120)
    title: str = Field("جلسة بحث", max_length=200)
    mode: Literal["strict", "tafssir"] = "strict"
    messages: List[Dict[str, Any]] = Field(default_factory=list, max_length=MAX_SESSION_MESSAGES)

    @field_validator("messages")
    @classmethod
    def _bound_messages_size(cls, value: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        serialized = json.dumps(value, ensure_ascii=False).encode("utf-8")
        if len(serialized) > MAX_SESSION_MESSAGES_BYTES:
            raise ValueError(
                f"Session messages exceed the {MAX_SESSION_MESSAGES_BYTES // 1024} KB limit."
            )
        return value


# ---------------------------------------------------------------------------
# Research documents — the shareable research format (docs/research-workspace-spec.md §5)
# ---------------------------------------------------------------------------

RESEARCH_DOCUMENT_VERSION = 1
MAX_DOCUMENT_SECTIONS = 60
MAX_SECTION_BODY_CHARS = 8000
MAX_SECTION_AYAHS = 40
MAX_DOCUMENT_REFERENCES = 80
MAX_DOCUMENT_BYTES = 512 * 1024
MAX_DOCUMENTS_PER_USER = 300

ResearchSectionKind = Literal["text", "ayahs", "note", "question", "ai_answer"]


class AyahRef(BaseModel):
    """A quoted ayah. `text` is what the author quotes; it is verified against the Quran DB."""

    mushaf_id: int = Field(2, ge=1)
    surah_id: int = Field(..., ge=1, le=114)
    ayah: int = Field(..., ge=1, le=286)
    ayah_id: Optional[int] = None
    text: str = Field("", max_length=4000)


class ResearchSection(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    kind: ResearchSectionKind = "text"
    title: Optional[str] = Field(None, max_length=200)
    # A markdown subset (paragraphs, **bold**, lists); rendered as text, never as HTML.
    body: str = Field("", max_length=MAX_SECTION_BODY_CHARS)
    ayahs: List[AyahRef] = Field(default_factory=list, max_length=MAX_SECTION_AYAHS)


class ResearchReference(BaseModel):
    kind: Literal["ayah", "tafsir", "book", "url"] = "book"
    label: str = Field(..., min_length=1, max_length=300)
    locator: Optional[str] = Field(None, max_length=500)


class ResearchProvenance(BaseModel):
    mode: Optional[Literal["strict", "tafssir"]] = None
    # Sections produced by the research agent (must stay labelled as AI output).
    ai_sections: List[str] = Field(default_factory=list, max_length=MAX_DOCUMENT_SECTIONS)
    created_from: Literal["studio", "board", "manual"] = "manual"
    source_id: Optional[str] = Field(None, max_length=120)


class ResearchDocumentSave(BaseModel):
    """Create/replace body. Visibility is private until community publishing ships."""

    title: str = Field(..., min_length=1, max_length=200)
    summary: Optional[str] = Field(None, max_length=1200)
    language: str = Field("ar", max_length=12)
    tags: List[str] = Field(default_factory=list, max_length=12)
    theme_ids: List[int] = Field(default_factory=list, max_length=MAX_THEMES_PER_ITEM)
    sections: List[ResearchSection] = Field(default_factory=list, max_length=MAX_DOCUMENT_SECTIONS)
    references: List[ResearchReference] = Field(default_factory=list, max_length=MAX_DOCUMENT_REFERENCES)
    provenance: ResearchProvenance = Field(default_factory=ResearchProvenance)
    visibility: Literal["private"] = "private"

    @field_validator("tags")
    @classmethod
    def _clean_tags(cls, value: List[str]) -> List[str]:
        cleaned = [tag.strip()[:40] for tag in value if tag and tag.strip()]
        return list(dict.fromkeys(cleaned))

    @field_validator("sections")
    @classmethod
    def _unique_section_ids(cls, value: List[ResearchSection]) -> List[ResearchSection]:
        ids = [section.id for section in value]
        if len(ids) != len(set(ids)):
            raise ValueError("Section ids must be unique.")
        return value


class QuoteIssue(BaseModel):
    section_id: str
    surah_id: int
    ayah: int
    problem: Literal["not_found", "text_mismatch"]
    expected: Optional[str] = None


class QuoteVerification(BaseModel):
    """Every quoted ayah checked against the Quran DB (normalized comparison)."""

    ok: bool
    checked: int
    issues: List[QuoteIssue] = Field(default_factory=list)


class ResearchDocumentSummary(BaseModel):
    id: str
    title: str
    summary: Optional[str] = None
    mode: Optional[Literal["strict", "tafssir"]] = None
    created_from: str = "manual"
    section_count: int = 0
    ayah_count: int = 0
    visibility: str = "private"
    version: int = 1
    created_at: int
    updated_at: int


class ResearchDocument(ResearchDocumentSave):
    id: str
    v: int = RESEARCH_DOCUMENT_VERSION
    version: int = 1
    created_at: int
    updated_at: int
    verification: Optional[QuoteVerification] = None


class AuditCheck(BaseModel):
    rule: str
    passed: bool
    detail: Optional[str] = None


class DocumentAudit(BaseModel):
    """Deterministic pre-publication checks (blocking). The AI audit is advisory and not wired yet."""

    publishable: bool
    checks: List[AuditCheck]


# ---------------------------------------------------------------------------
# Community — publishing, feed, likes, comments, reports, moderation
# (docs/community-guidelines.md, docs/ai-audit-agent.md)
# ---------------------------------------------------------------------------

PostStatus = Literal["pending_review", "published", "changes_requested", "rejected", "withdrawn", "removed"]
GuidelineRule = Literal[
    "misattribution",
    "ruling_as_fact",
    "unlabelled_ai",
    "disrespect",
    "sectarian_attack",
    "integrity",
    "spam_promo",
    "personal_data",
    "other",
]
MAX_COMMENT_CHARS = 2000


class PublishRequest(BaseModel):
    visibility: Literal["public", "unlisted"] = "public"
    # The author confirms they read the community guidelines.
    accept_guidelines: bool = False


class AuditIssue(BaseModel):
    section_id: str
    rule: GuidelineRule
    severity: Literal["low", "medium", "high"]
    quote: Optional[str] = None
    explanation_ar: str
    suggestion_ar: Optional[str] = None


class AiAudit(BaseModel):
    verdict: Literal["pass", "review", "reject"]
    issues: List[AuditIssue] = Field(default_factory=list)
    model: Optional[str] = None
    # Why the agent could not decide (provider unavailable, invalid output) — fail closed.
    fallback_reason: Optional[str] = None


class PublishResult(BaseModel):
    status: Literal["blocked", "pending_review", "published"]
    post_id: Optional[str] = None
    audit: DocumentAudit
    ai_audit: Optional[AiAudit] = None


class PostExcerpt(BaseModel):
    surah_id: int
    ayah: int
    text: str


class PostSummary(BaseModel):
    id: str
    title: str
    summary: Optional[str] = None
    author_name: str
    # Filters the feed to this author's posts (`GET /api/community/feed?author=`).
    author_id: Optional[int] = None
    visibility: Literal["public", "unlisted"]
    status: PostStatus
    mode: Optional[Literal["strict", "tafssir"]] = None
    created_from: str = "manual"
    has_board: bool = False
    ayah_count: int = 0
    tags: List[str] = Field(default_factory=list)
    surah_ids: List[int] = Field(default_factory=list)
    reading_minutes: int = 1
    like_count: int = 0
    comment_count: int = 0
    liked_by_me: bool = False
    # A private bookmark: only the viewer sees it; there is no public save count.
    saved_by_me: bool = False
    is_mine: bool = False
    published_at: Optional[int] = None
    updated_at: int
    excerpt: Optional[PostExcerpt] = None


class PostReview(BaseModel):
    stage: Literal["deterministic", "ai", "human"]
    verdict: str
    issues: List[Dict[str, Any]] = Field(default_factory=list)
    note: Optional[str] = None
    created_at: int


class PostDetail(PostSummary):
    document: Dict[str, Any]
    board: Optional[Dict[str, Any]] = None
    # Reviews are shown to the author and moderators only.
    reviews: List[PostReview] = Field(default_factory=list)


class FeedPage(BaseModel):
    posts: List[PostSummary]
    next_cursor: Optional[str] = None


class CommentCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=MAX_COMMENT_CHARS)


class CommentItem(BaseModel):
    id: int
    post_id: str
    author_name: str
    body: str
    is_mine: bool = False
    status: Literal["visible", "hidden"] = "visible"
    created_at: int


class LikeResult(BaseModel):
    liked: bool
    like_count: int


class SaveResult(BaseModel):
    saved: bool


class TagCount(BaseModel):
    tag: str
    count: int


class ReportCreate(BaseModel):
    target_type: Literal["post", "comment"]
    target_id: str = Field(..., min_length=1, max_length=64)
    rule: GuidelineRule = "other"
    note: Optional[str] = Field(None, max_length=500)


class ReportItem(BaseModel):
    id: int
    target_type: Literal["post", "comment"]
    target_id: str
    rule: str
    note: Optional[str] = None
    status: Literal["open", "resolved"]
    created_at: int
    target_preview: Optional[str] = None


class ModerationDecision(BaseModel):
    decision: Literal["publish", "reject", "request_changes", "remove"]
    note: Optional[str] = Field(None, max_length=1000)


class ModerationQueue(BaseModel):
    posts: List[PostDetail]
    reports: List[ReportItem]


class FollowedRoot(BaseModel):
    id: int
    root_text: str
    root_id: Optional[int] = None
    occurrences: Optional[int] = None
    created_at: int


class FollowedRootCreate(BaseModel):
    root_text: str = Field(..., min_length=1, max_length=120)
    root_id: Optional[int] = None
    occurrences: Optional[int] = None


class DeleteResult(BaseModel):
    deleted: bool


# ---------------------------------------------------------------------------
# Morphology — per-word root / lemma / part-of-speech
# ---------------------------------------------------------------------------


class MorphologyWord(BaseModel):
    position: int
    text: str
    root: Optional[str] = None
    lemma: Optional[str] = None
    pos: str
    pos_label: str
    case: Optional[str] = None
    case_label: Optional[str] = None
    features: List[str] = Field(default_factory=list)


class MorphologyResponse(BaseModel):
    found: bool
    surah: int
    ayah: int
    words: List[MorphologyWord] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# User preferences (account defaults; per-session Tweaks override on the client)
# ---------------------------------------------------------------------------


class ResearchDefaults(BaseModel):
    default_mode: Literal["strict", "tafssir"] = "strict"
    depth: Literal["fast", "balanced", "deep"] = "balanced"


class ReadingPosition(BaseModel):
    ayah_id: int
    mushaf_id: int = 1
    surah: Optional[int] = None
    ayah: Optional[int] = None
    page: Optional[int] = None
    updated_at: Optional[int] = None


class SavedPageEntry(BaseModel):
    """A bookmarked muṣḥaf page — surfaced on Home to reopen the reader there."""

    page: int
    mushaf_id: int = 1
    surah: Optional[str] = None
    surah_id: Optional[int] = None
    saved_at: Optional[int] = None


# Mushaf editions the reader offers (account preference `mushaf_edition`). An
# edition fixes the riwāyah and how it is drawn. Version 1 ships only the Madani
# mushaf (Ḥafṣ, authentic QCF pages); append ids here as editions are added.
MushafEditionId = Literal["madani-hafs"]
MUSHAF_EDITION_IDS: tuple[str, ...] = ("madani-hafs",)
DEFAULT_MUSHAF_EDITION = "madani-hafs"


class UserPreferences(BaseModel):
    mushaf_edition: MushafEditionId = DEFAULT_MUSHAF_EDITION
    # Deprecated since `mushaf_edition`: kept for API compatibility, not read by
    # the web client (the edition decides the riwāyah and the renderer).
    riwayah: int = 2  # Ḥafṣ (mushaf id 2)
    mushaf_font: str = "amiri-quran"
    numerals: Literal["arabic-indic", "latin", "persian"] = "arabic-indic"
    ui_language: str = "ar"
    theme: Literal["dark", "light", "system"] = "dark"
    font_size: int = Field(28, ge=18, le=48)
    reciter: str = ""
    # Deprecated since `mushaf_edition` (see above). "authentic" = Madani QCF
    # glyph page (Hafs only); "simple" = flowing Unicode reader.
    mushaf_render: Literal["authentic", "simple"] = "authentic"
    # Reader layout is orthogonal to mushaf_render: how pages/ayahs are arranged.
    # "auto" resolves per viewport; the others are explicit user choices.
    reader_layout: Literal["auto", "single", "spread", "scroll", "ayah"] = "auto"
    research: ResearchDefaults = Field(default_factory=ResearchDefaults)
    # Last reading position — powers the personalized Home ayah hero.
    last_position: Optional[ReadingPosition] = None
    # Bookmarked muṣḥaf pages, listed on Home to reopen the reader there.
    saved_pages: List[SavedPageEntry] = Field(default_factory=list)
    # Translations of meanings shown under each ayah (keys from GET /api/translations, ≤3).
    translations: List[str] = Field(default_factory=list, max_length=3)


class ResearchDefaultsUpdate(BaseModel):
    default_mode: Optional[Literal["strict", "tafssir"]] = None
    depth: Optional[Literal["fast", "balanced", "deep"]] = None


class UserPreferencesUpdate(BaseModel):
    mushaf_edition: Optional[MushafEditionId] = None
    riwayah: Optional[int] = None
    mushaf_font: Optional[str] = None
    numerals: Optional[Literal["arabic-indic", "latin", "persian"]] = None
    ui_language: Optional[str] = None
    theme: Optional[Literal["dark", "light", "system"]] = None
    font_size: Optional[int] = Field(None, ge=18, le=48)
    reciter: Optional[str] = None
    mushaf_render: Optional[Literal["authentic", "simple"]] = None
    reader_layout: Optional[Literal["auto", "single", "spread", "scroll", "ayah"]] = None
    research: Optional[ResearchDefaultsUpdate] = None
    last_position: Optional[ReadingPosition] = None
    saved_pages: Optional[List[SavedPageEntry]] = None
    translations: Optional[List[Annotated[str, StringConstraints(max_length=80)]]] = Field(None, max_length=3)


# ---------------------------------------------------------------------------
# Quran translations of meanings
# ---------------------------------------------------------------------------


class TranslationInfo(BaseModel):
    key: str
    language: str
    kind: Literal["translation", "transliteration"] = "translation"
    name: str
    translator: str
    description: str = ""
    source: Literal["quranenc", "tanzil"]
    source_url: str
    terms: str
    version: str = ""
    direction: Literal["ltr", "rtl"] = "ltr"
    ayah_count: int


class TranslationMeta(BaseModel):
    key: str
    language: str
    kind: str
    name: str
    translator: str
    source: str
    source_url: str
    direction: str


class TranslatedText(BaseModel):
    key: str
    text: str
    footnotes: Optional[str] = None


class TranslatedAyah(BaseModel):
    surah: int
    ayah: int
    texts: List[TranslatedText]


class TranslationAyahsResponse(BaseModel):
    translations: List[TranslationMeta]
    ayahs: List[TranslatedAyah]


# ---------------------------------------------------------------------------
# Reciters (recitation room)
# ---------------------------------------------------------------------------


class ReciterItem(BaseModel):
    id: str
    name: str
    name_english: str
    riwayah: str
    style: str
    audio_base: str


# ---------------------------------------------------------------------------
# Root distribution (Concordance heatmap)
# ---------------------------------------------------------------------------


class RootDistributionSurah(BaseModel):
    surah_id: int
    surah: str
    count: int


class RootDistributionResponse(BaseModel):
    found: bool
    root: str
    total: int = 0
    surah_count: int = 0
    surahs: List[RootDistributionSurah] = Field(default_factory=list)
