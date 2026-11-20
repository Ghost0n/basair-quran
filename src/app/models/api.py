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
    # Moderates community content (appointed by an admin).
    is_moderator: bool = False
    name: Optional[str] = None
    avatar: Optional[str] = None
    onboarded: bool = False


class AuthSessionResponse(BaseModel):
    enabled: bool = False
    authenticated: bool = False
    user: Optional[AuthUserInfo] = None
    # Set only for native clients (bearer flow); the web app uses the cookie.
    token: Optional[str] = None
    # Who holds the credentials: "local" (email + password here) or "keycloak"
    # (docs/keycloak.md: sign in and sign up on Keycloak's page).
    provider: Literal["local", "keycloak"] = "local"
    # Keycloak only: where «دخول» / «إنشاء حساب» send the browser (append `return_to`),
    # the account console (password, 2FA, linked accounts), and — after sign-out —
    # Keycloak's end-session URL to visit so its session ends too.
    login_url: Optional[str] = None
    signup_url: Optional[str] = None
    account_url: Optional[str] = None
    logout_url: Optional[str] = None


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
    # Legacy, accepted and ignored: every answer comes from the Quran alone
    # (the experimental explanatory reading was removed).
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


# Sections of an answer from the former explanatory reading: no longer produced,
# kept so the response shape (and answers saved back then) stay valid.
class TafssirStructuredAnswer(BaseModel):
    summary: Optional[str] = None
    linguistic_analysis: Optional[str] = None
    ayah_connections: Optional[str] = None
    corpus_insight: Optional[str] = None
    limits_and_cautions: Optional[str] = None


class ResearchProviderInfo(BaseModel):
    # "ollama" (the server's own, or Ollama Cloud), or a reader's provider
    # (src/app/services/llm_providers.py).
    provider: Literal["ollama", "openrouter", "openai", "anthropic", "gemini", "mistral", "deepseek", "groq", "xai"]
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


class AiProviderItem(BaseModel):
    """An AI provider a reader can connect (Settings → «الذكاء الاصطناعي»)."""

    id: str
    name: str
    # Where to get a key.
    key_url: str
    # Offers a sign-in that hands back a key (OpenRouter).
    signin: bool = False
    # Model names to preselect, in order (substring match).
    prefer: List[str] = Field(default_factory=list)
    # The thinking levels the study can ask of it (`X-QBasair-LLM-Thinking`);
    # empty: the model decides (its own default).
    thinking: List[Literal["off", "low", "medium", "high"]] = Field(default_factory=list)


class OpenRouterKeyRequest(BaseModel):
    code: str = Field(min_length=1, max_length=512)
    code_verifier: str = Field(min_length=43, max_length=128)


class OpenRouterKeyResponse(BaseModel):
    key: str


class ResearchAgentSettingsResponse(BaseModel):
    provider: ResearchProviderInfo
    available_models: List[OllamaModelItem] = Field(default_factory=list)
    limits: ResearchLimitsInfo


class ResearchAgentResponse(BaseModel):
    status: Literal["needs_clarification", "answered", "no_results"]
    # Always "strict"; `disclaimer` and `tafssir` stay null (legacy fields).
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
    """Deterministic pre-publication checks (blocking); the agent checks a queued post later."""

    publishable: bool
    checks: List[AuditCheck]


# ---------------------------------------------------------------------------
# Community — publishing, feed, likes, comments, reports, moderation
# (docs/community-guidelines.md, docs/ai-audit-agent.md)
# ---------------------------------------------------------------------------

PostStatus = Literal["queued", "pending_review", "published", "changes_requested", "rejected", "withdrawn", "removed"]
# The state of a new version of a published post, while it is reviewed.
ReviewState = Literal["queued", "pending_review", "changes_requested"]
GuidelineRule = Literal[
    "misattribution",
    "ruling_as_fact",
    "unlabelled_ai",
    "disrespect",
    "sectarian_attack",
    "integrity",
    "spam_promo",
    "personal_data",
    "off_topic",
    "harassment",
    "other",
]
MAX_COMMENT_CHARS = 2000


class PublishRequest(BaseModel):
    visibility: Literal["public", "unlisted"] = "public"
    # The author confirms they read the community guidelines.
    accept_guidelines: bool = False


class PublishResult(BaseModel):
    """`blocked`: the deterministic audit failed (nothing is queued); `queued`: the
    next moderation batch checks it (docs/community-moderation-design.md)."""

    status: Literal["blocked", "queued"]
    post_id: Optional[str] = None
    audit: DocumentAudit


class AuditIssue(BaseModel):
    """One finding of the moderation agent, written in the author's interface language."""

    target: str
    rule: GuidelineRule
    severity: Literal["low", "medium", "high"]
    quote: Optional[str] = None
    explanation: str
    suggestion: Optional[str] = None


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
    # A new version under review while this one stays published.
    review_state: Optional[ReviewState] = None
    # Hidden from readers by reports until a moderator decides (its author and staff still see it).
    hidden: bool = False


class PostReview(BaseModel):
    """One check of a post or comment: the deterministic audit, the agent or a person."""

    stage: Literal["deterministic", "agent", "human"]
    verdict: str
    confidence: Optional[float] = None
    issues: List[Dict[str, Any]] = Field(default_factory=list)
    # The language the agent wrote its reasons in (the author's interface language).
    language: Optional[str] = None
    note: Optional[str] = None
    created_at: int


class PostDetail(PostSummary):
    document: Dict[str, Any]
    board: Optional[Dict[str, Any]] = None
    # Reviews are shown to the author and moderators only.
    reviews: List[PostReview] = Field(default_factory=list)
    # The new version under review (its document), for its author and moderators.
    candidate: Optional[Dict[str, Any]] = None


class FeedPage(BaseModel):
    posts: List[PostSummary]
    next_cursor: Optional[str] = None


class CommentCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=MAX_COMMENT_CHARS)


class CommentItem(BaseModel):
    """`pending`: waiting for its check (shown to its author only); `hidden`: shown
    to others as «تعليق مخفي», without author or text."""

    id: int
    post_id: str
    author_name: str
    body: str
    is_mine: bool = False
    status: Literal["visible", "pending", "hidden"] = "visible"
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


# --- Moderation (docs/community-moderation-design.md) ------------------------

TrustLevel = Literal["unverified", "verified"]
QueueReason = Literal["first_post", "unsure", "declined", "reported"]


class AuthorStanding(BaseModel):
    user_id: int
    level: TrustLevel
    # Declines a moderator upheld; three make the author suspicious.
    upheld_declines: int = 0
    suspicious: bool = False
    banned: bool = False
    # Unix time, or -1 for a permanent ban.
    banned_until: Optional[int] = None
    ban_reason: Optional[str] = None
    is_staff: bool = False
    name: Optional[str] = None


class ModerationDecision(BaseModel):
    """`decline` (the author may edit and resubmit) and `remove` need a reason, shown to the author."""

    decision: Literal["approve", "decline", "remove", "restore"]
    note: Optional[str] = Field(None, max_length=1000)


class ModerationQueueItem(BaseModel):
    id: int
    item_type: Literal["post", "comment"]
    item_id: str
    reason: QueueReason
    opened_at: int
    checks: List[PostReview] = Field(default_factory=list)
    reports: List[ReportItem] = Field(default_factory=list)
    post: Optional[PostDetail] = None
    comment: Optional[CommentItem] = None
    post_title: Optional[str] = None
    author: AuthorStanding
    # The viewer's own content: shown, never decided by them.
    is_mine: bool = False


class AppealCreate(BaseModel):
    """Contest the latest decision on one's post, comment or ban (`target_id` unused for a ban)."""

    target_type: Literal["post", "comment", "ban"]
    target_id: str = Field("", max_length=64)
    message: str = Field(..., min_length=1, max_length=2000)


class AppealItem(BaseModel):
    id: int
    user_id: int
    target_type: Literal["post", "comment", "user"]
    target_id: str
    message: str
    status: Literal["open", "upheld", "overturned"]
    created_at: int
    decision: Optional[str] = None
    decision_reason: Optional[str] = None
    decided_by: Optional[int] = None
    note: Optional[str] = None


class AppealDecision(BaseModel):
    outcome: Literal["uphold", "overturn"]
    note: Optional[str] = Field(None, max_length=1000)


class ModerationQueue(BaseModel):
    items: List[ModerationQueueItem]
    appeals: List[AppealItem]


class BanRequest(BaseModel):
    """7 or 30 days; no `days` means permanent (admins only)."""

    days: Optional[Literal[7, 30]] = None
    reason: str = Field(..., min_length=1, max_length=1000)


class UnbanRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=1000)


class ModerationUser(AuthorStanding):
    history: List[Dict[str, Any]] = Field(default_factory=list)


class ModerationAction(BaseModel):
    id: int
    actor_id: int
    action: str
    target_type: str
    target_id: str
    subject_user_id: Optional[int] = None
    reason: Optional[str] = None
    created_at: int


class TeamMember(BaseModel):
    user_id: int
    email: str
    name: Optional[str] = None
    role: Literal["admin", "moderator"]
    actions: int = 0


class RoleChange(BaseModel):
    email: str = Field(..., min_length=3, max_length=200)
    role: Literal["moderator", "user"]


class ModerationHealth(BaseModel):
    worker: Literal["embedded", "external", "off"]
    interval_seconds: int
    backlog: Dict[str, int]
    last_batch: Optional[Dict[str, Any]] = None
    today: Dict[str, int]


class ModerationRun(BaseModel):
    kind: str
    checked: int = 0
    errors: int = 0
    budget_reached: bool = False
    skipped: Optional[str] = None


# --- Feedback centre (docs/feedback-centre.md) -------------------------------

FeedbackKind = Literal["contact", "bug", "help", "feature", "error"]
FeedbackStatus = Literal["new", "in_progress", "resolved", "closed"]


class FeedbackCreate(BaseModel):
    """`error` carries the diagnostic bundle (`detail`); the others a message."""

    kind: FeedbackKind
    message: str = Field("", max_length=4000)
    # How to answer a guest (optional; signed-in people are answered in the app).
    email: Optional[str] = Field(None, max_length=200)
    detail: Optional[Dict[str, Any]] = None
    url: Optional[str] = Field(None, max_length=500)
    language: Optional[str] = Field(None, max_length=12)


class FeedbackItem(BaseModel):
    id: int
    kind: FeedbackKind
    status: FeedbackStatus
    message: str
    created_at: int
    updated_at: int
    # Staff only:
    user_id: Optional[int] = None
    email: Optional[str] = None
    detail: Optional[Dict[str, Any]] = None
    url: Optional[str] = None
    user_agent: Optional[str] = None
    language: Optional[str] = None
    assigned_to: Optional[int] = None
    staff_note: Optional[str] = None


class FeedbackPage(BaseModel):
    items: List[FeedbackItem]
    next_before: Optional[int] = None
    counts: Dict[str, int]


class FeedbackUpdate(BaseModel):
    status: Optional[FeedbackStatus] = None
    staff_note: Optional[str] = Field(None, max_length=2000)
    assigned_to: Optional[int] = None


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

# The Home screen's sections a reader can hide (account preference
# `home_hidden`). Listed as hidden, so a section added later shows by default.
# `index`, `saved`, `study` and `community` were shortcuts to screens the
# navigation bar already opens: no longer shown, still accepted so a stored
# list stays valid.
HomeSectionId = Literal[
    "greeting",
    "verse",
    "continue",
    "recent_pages",
    "recent_searches",
    "search",
    "index",
    "saved",
    "study",
    "community",
]

# How many recent pages and searches Home keeps (account preferences
# `recent_pages` / `recent_searches`).
RECENTS_LIMIT = 10


class RecentPage(BaseModel):
    """A place recently read: consecutive page turns count as one place, at the page reached."""

    page: int = Field(ge=1, le=1000)
    mushaf_id: int = 1
    surah: Optional[Annotated[str, StringConstraints(max_length=80)]] = None
    at: int = 0


class ReadingSeries(BaseModel):
    """An unbroken run of page turns in the reader: where it began, the page it
    reached last, and how many turns it holds."""

    id: Annotated[str, StringConstraints(min_length=1, max_length=40)]
    mushaf_id: int = 1
    start: int = Field(ge=1, le=1000)
    end: int = Field(ge=1, le=1000)
    turns: int = Field(0, ge=0)
    # The surah (name and number) at the start of the page it reached.
    surah: Optional[Annotated[str, StringConstraints(max_length=80)]] = None
    surah_id: Optional[int] = Field(None, ge=1, le=114)
    updated_at: int = 0


# How many page-turn series the reading progress keeps.
READING_SERIES_LIMIT = 12


class ReadingProgress(BaseModel):
    """«تابع القراءة»: the last page of the longest series of page turns.
    Emptied when a series reaches the mushaf's last page, or by the reader
    (Settings), which stamps `reset_at`."""

    series: List[ReadingSeries] = Field(default_factory=list, max_length=READING_SERIES_LIMIT)
    reset_at: Optional[int] = None


class RecentSearch(BaseModel):
    """A search recently run, to run again from Home."""

    query: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    mode: Literal["exact", "root"] = "exact"
    at: int = 0


class UserPreferences(BaseModel):
    mushaf_edition: MushafEditionId = DEFAULT_MUSHAF_EDITION
    # Deprecated since `mushaf_edition`: kept for API compatibility, not read by
    # the web client (the edition decides the riwāyah and the renderer).
    riwayah: int = 2  # Ḥafṣ (mushaf id 2)
    mushaf_font: str = "amiri-quran"
    # "auto" = the interface language's own digits; the others are a choice.
    numerals: Literal["auto", "arabic-indic", "latin", "persian"] = "auto"
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
    # Home sections the reader hid (Settings «الرئيسية»); empty = all shown.
    home_hidden: List[HomeSectionId] = Field(default_factory=list)
    # The last places read and searches run, newest first (≤ RECENTS_LIMIT each).
    recent_pages: List[RecentPage] = Field(default_factory=list)
    recent_searches: List[RecentSearch] = Field(default_factory=list)
    # «تابع القراءة»: page-turn series (see ReadingProgress).
    reading_progress: ReadingProgress = Field(default_factory=ReadingProgress)


class ResearchDefaultsUpdate(BaseModel):
    default_mode: Optional[Literal["strict", "tafssir"]] = None
    depth: Optional[Literal["fast", "balanced", "deep"]] = None


class UserPreferencesUpdate(BaseModel):
    mushaf_edition: Optional[MushafEditionId] = None
    riwayah: Optional[int] = None
    mushaf_font: Optional[str] = None
    numerals: Optional[Literal["auto", "arabic-indic", "latin", "persian"]] = None
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
    home_hidden: Optional[List[HomeSectionId]] = Field(None, max_length=10)
    recent_pages: Optional[List[RecentPage]] = Field(None, max_length=RECENTS_LIMIT)
    recent_searches: Optional[List[RecentSearch]] = Field(None, max_length=RECENTS_LIMIT)
    reading_progress: Optional[ReadingProgress] = None


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


class ReciterDurations(BaseModel):
    """Every verse's audio duration for one reciter's surah (seconds; None = not
    measured yet). ``complete`` once all are known — the response is then
    immutable and cacheable for a year."""

    reciter_id: str
    surah: int
    durations: list[float | None]
    complete: bool


class ReciterItem(BaseModel):
    id: str
    name: str
    name_english: str
    riwayah: str
    style: str
    # The verse-by-verse files (everyayah); empty for a reciter heard only
    # from prepared surahs.
    audio_base: str
    # Surahs prepared as one continuous recording (GET /api/recitations/{id}/{surah});
    # the others play verse by verse from audio_base.
    surahs: list[int] = Field(default_factory=list)
    # Where the prepared recordings come from (shown with the reciter).
    attribution: list[str] = Field(default_factory=list)


class RecitationVerse(BaseModel):
    ayah: int
    start_ms: int
    end_ms: int


class SurahRecitation(BaseModel):
    """One prepared surah: a single recording and where each verse sits in it."""

    reciter_id: str
    surah: int
    audio_url: str
    duration_ms: int
    bytes: int
    attribution: str
    verses: list[RecitationVerse]


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
