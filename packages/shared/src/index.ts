export type SearchMode = "root" | "exact";

export interface MushafItem {
  id: number;
  name: string;
  description?: string | null;
  /** Normalized riwāyah key (matches ReciterItem.riwayah). */
  riwayah?: string;
}

export type DevicePlatform = "web" | "ios" | "android" | "desktop";

export interface AuthLoginRequest {
  email: string;
  password: string;
  device_label?: string | null;
  platform?: DevicePlatform;
}

export interface AuthSignupRequest {
  email: string;
  password: string;
  name?: string | null;
  /** Optional invite code — accepted and echoed, not enforced yet. */
  invite_code?: string | null;
  device_label?: string | null;
  platform?: DevicePlatform;
}

export interface AuthProfileUpdate {
  name?: string | null;
  /** A calligraphic medallion character/index — NOT an image URL. */
  avatar?: string | null;
  onboarded?: boolean | null;
}

export interface AuthUserInfo {
  id: number;
  email: string;
  is_admin: boolean;
  name?: string | null;
  avatar?: string | null;
  onboarded: boolean;
}

export interface AuthSessionResponse {
  enabled: boolean;
  authenticated: boolean;
  user?: AuthUserInfo | null;
  /** Set only for native (bearer) clients; the web app uses the httpOnly cookie. */
  token?: string | null;
}

export interface AuthOkResponse {
  ok: boolean;
}

export interface DeviceInfo {
  id: number;
  device_label?: string | null;
  platform?: string | null;
  created_at: number;
  last_seen_at: number;
  is_current: boolean;
}

export interface GuestMergeRequest {
  notebook_ids?: number[];
  session_ids?: string[];
  root_ids?: number[];
  include_preferences?: boolean;
}

export interface GuestMergeResult {
  merged: boolean;
  notebook_moved: number;
  sessions_moved: number;
  roots_moved: number;
  preferences_moved: boolean;
  undo_token?: string | null;
}

export interface GuestMergeUndoRequest {
  undo_token: string;
}

export interface SuggestionItem {
  type: "word" | "root" | "phrase";
  text: string;
  root_id?: number | null;
}

export interface DidYouMeanSuggestion {
  text: string;
  confidence: number;
}

export interface SearchVerse {
  ayah_id: number;
  mushaf_id: number;
  surah: string;
  surah_id: number;
  ayah: number;
  text: string;
  global_index: number;
  highlights: number[];
}

export interface PaginatedSearchResult {
  result_key: string;
  root: string;
  root_id?: number | null;
  search_type: string;
  match_type?: "word" | "phrase";
  page: number;
  page_size: number;
  total_pages: number;
  total_occurrences: number;
  total_verses: number;
  total_surahs: number;
  verses: SearchVerse[];
}

export interface PaginatedSearchResponse {
  found: boolean;
  message?: string;
  page_size?: number;
  did_you_mean?: DidYouMeanSuggestion;
  results: PaginatedSearchResult[];
}

export interface SearchResultPageResponse {
  found: boolean;
  result: PaginatedSearchResult;
}

export interface ResearchAgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ResearchRelatedTerm {
  type: "root" | "word" | "phrase";
  text: string;
  root_id?: number | null;
  reason?: string | null;
}

export interface ResearchSearchItem {
  mode: SearchMode;
  query: string;
  reason?: string | null;
  result_count: number;
}

export interface ResearchAgentAyah extends SearchVerse {
  matched_terms: string[];
}

export type TafssirDepth = "fast" | "balanced" | "deep";

export interface TafssirStructuredAnswer {
  summary?: string | null;
  linguistic_analysis?: string | null;
  ayah_connections?: string | null;
  corpus_insight?: string | null;
  limits_and_cautions?: string | null;
}

export interface ResearchProviderInfo {
  provider: "ollama";
  transport: "cloud_api" | "local_api";
  base_url: string;
  chat_model: string;
  embed_model?: string | null;
  authenticated: boolean;
}

export interface ResearchUsageStep {
  stage: string;
  model: string;
  total_duration_ns: number;
  load_duration_ns: number;
  prompt_eval_count: number;
  eval_count: number;
}

export interface ResearchUsageSummary {
  request_count: number;
  total_duration_ns: number;
  load_duration_ns: number;
  prompt_eval_count: number;
  eval_count: number;
  steps: ResearchUsageStep[];
}

export interface ResearchLimitsInfo {
  summary: string;
  plan_reference_url?: string | null;
  notes: string[];
}

export interface OllamaModelItem {
  name: string;
  size?: number | null;
  modified_at?: string | null;
  digest?: string | null;
  is_cloud: boolean;
  capabilities: string[];
}

export interface ResearchAgentSettingsResponse {
  provider: ResearchProviderInfo;
  available_models: OllamaModelItem[];
  limits: ResearchLimitsInfo;
}

export interface ResearchAgentRequest {
  messages: ResearchAgentMessage[];
  mushaf: number;
  max_results?: number;
  answer_language?: string;
  response_mode?: "strict" | "tafssir";
  tafssir_depth?: TafssirDepth;
  /** Centre the research on one ayah: always kept, read with its neighbours and surah. */
  focus?: ResearchFocusAyah | null;
}

/** Counts per scope; `surah` / `page` are null when that scope wasn't requested. */
export interface TextCountScopes {
  quran: number;
  surah?: number | null;
  page?: number | null;
}

export interface TextCountLetter extends TextCountScopes {
  letter: string;
  in_selection: number;
}

/** GET /api/text-count — a selected word/phrase and its letters, counted on the rasm. */
export interface TextCountResponse {
  text: string;
  word_count: number;
  phrase: TextCountScopes;
  letters: TextCountLetter[];
}

// ---------------------------------------------------------------------------
// Research documents — the shareable research format (spec §5)
// ---------------------------------------------------------------------------

export type ResearchSectionKind = "text" | "ayahs" | "note" | "question" | "ai_answer";

/** A quoted ayah; `text` is verified against the Quran DB (empty = filled by the server). */
export interface AyahRef {
  mushaf_id: number;
  surah_id: number;
  ayah: number;
  ayah_id?: number | null;
  text: string;
}

export interface ResearchSection {
  id: string;
  kind: ResearchSectionKind;
  title?: string | null;
  /** A markdown subset, rendered as text (never HTML). */
  body: string;
  ayahs: AyahRef[];
}

export interface ResearchReference {
  kind: "ayah" | "tafsir" | "book" | "url";
  label: string;
  locator?: string | null;
}

export interface ResearchProvenance {
  mode?: "strict" | "tafssir" | null;
  ai_sections: string[];
  created_from: "studio" | "board" | "manual";
  source_id?: string | null;
}

export interface ResearchDocumentSave {
  title: string;
  summary?: string | null;
  language?: string;
  tags: string[];
  theme_ids: number[];
  sections: ResearchSection[];
  references: ResearchReference[];
  provenance: ResearchProvenance;
  /** Private until community publishing ships. */
  visibility?: "private";
}

export interface QuoteIssue {
  section_id: string;
  surah_id: number;
  ayah: number;
  problem: "not_found" | "text_mismatch";
  expected?: string | null;
}

export interface QuoteVerification {
  ok: boolean;
  checked: number;
  issues: QuoteIssue[];
}

export interface ResearchDocument extends ResearchDocumentSave {
  id: string;
  v: 1;
  version: number;
  created_at: number;
  updated_at: number;
  verification?: QuoteVerification | null;
}

export interface ResearchDocumentSummary {
  id: string;
  title: string;
  summary?: string | null;
  mode?: "strict" | "tafssir" | null;
  created_from: string;
  section_count: number;
  ayah_count: number;
  visibility: string;
  version: number;
  created_at: number;
  updated_at: number;
}

export interface AuditCheck {
  rule: string;
  passed: boolean;
  detail?: string | null;
}

export interface DocumentAudit {
  publishable: boolean;
  checks: AuditCheck[];
}

// ---------------------------------------------------------------------------
// Community — publishing, feed, likes, comments, reports, moderation
// ---------------------------------------------------------------------------

export type PostStatus = "pending_review" | "published" | "changes_requested" | "rejected" | "withdrawn" | "removed";
export type GuidelineRule =
  | "misattribution"
  | "ruling_as_fact"
  | "unlabelled_ai"
  | "disrespect"
  | "sectarian_attack"
  | "integrity"
  | "spam_promo"
  | "personal_data"
  | "other";

export interface PublishRequest {
  visibility: "public" | "unlisted";
  accept_guidelines: boolean;
}

export interface AuditIssue {
  section_id: string;
  rule: GuidelineRule;
  severity: "low" | "medium" | "high";
  quote?: string | null;
  explanation_ar: string;
  suggestion_ar?: string | null;
}

export interface AiAudit {
  verdict: "pass" | "review" | "reject";
  issues: AuditIssue[];
  model?: string | null;
  fallback_reason?: string | null;
}

export interface PublishResult {
  status: "blocked" | "pending_review" | "published";
  post_id?: string | null;
  audit: DocumentAudit;
  ai_audit?: AiAudit | null;
}

export interface PostSummary {
  id: string;
  title: string;
  summary?: string | null;
  author_name: string;
  /** Filters the feed to this author's posts (`FeedQuery.author`). */
  author_id?: number | null;
  visibility: "public" | "unlisted";
  status: PostStatus;
  mode?: "strict" | "tafssir" | null;
  created_from: string;
  has_board: boolean;
  ayah_count: number;
  tags: string[];
  surah_ids: number[];
  reading_minutes: number;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  /** A private bookmark — only the viewer sees it. */
  saved_by_me: boolean;
  is_mine: boolean;
  published_at?: number | null;
  updated_at: number;
  excerpt?: { surah_id: number; ayah: number; text: string } | null;
}

export interface PostReview {
  stage: "deterministic" | "ai" | "human";
  verdict: string;
  issues: Record<string, unknown>[];
  note?: string | null;
  created_at: number;
}

/** A read-only copy of the theme board a post's document came from. */
export interface PostBoardSnapshot {
  theme: { name: string; color: ThemeColor };
  board: ThemeBoard;
  ayahs: Record<string, { surah_id: number; surah: string; ayah: number; text: string }>;
}

export interface PostDetail extends PostSummary {
  document: Omit<ResearchDocumentSave, "visibility"> & { id: string; version: number };
  board?: PostBoardSnapshot | null;
  reviews: PostReview[];
}

export interface FeedPage {
  posts: PostSummary[];
  next_cursor?: string | null;
}

export interface CommentItem {
  id: number;
  post_id: string;
  author_name: string;
  body: string;
  is_mine: boolean;
  status: "visible" | "hidden";
  created_at: number;
}

export interface LikeResult {
  liked: boolean;
  like_count: number;
}

export interface SaveResult {
  saved: boolean;
}

export interface TagCount {
  tag: string;
  count: number;
}

/** `GET /api/community/feed` filters. `sort=top` ranks by engagement decayed by age. */
export interface FeedQuery {
  cursor?: string | null;
  limit?: number;
  sort?: "latest" | "top";
  q?: string;
  surah?: number | null;
  tag?: string | null;
  mode?: "strict" | "tafssir" | null;
  board?: boolean;
  author?: number | null;
  /** The viewer's saved posts (needs an account when auth is enabled). */
  saved?: boolean;
}

export interface ReportCreate {
  target_type: "post" | "comment";
  target_id: string;
  rule: GuidelineRule;
  note?: string | null;
}

export interface ReportItem {
  id: number;
  target_type: "post" | "comment";
  target_id: string;
  rule: string;
  note?: string | null;
  status: "open" | "resolved";
  created_at: number;
  target_preview?: string | null;
}

export interface ModerationDecision {
  decision: "publish" | "reject" | "request_changes" | "remove";
  note?: string | null;
}

export interface ModerationQueue {
  posts: PostDetail[];
  reports: ReportItem[];
}

/** GET /api/ayah-reader — an ayah with its neighbours in the same surah. */
export interface ReaderAyah {
  ayah_id: number;
  ayah: number;
  text: string;
  global_index: number;
  is_center: boolean;
}

export interface AyahReaderResponse {
  found: boolean;
  mushaf_id?: number | null;
  surah_id?: number | null;
  surah?: string | null;
  center_ayah_id?: number | null;
  start_ayah?: number | null;
  end_ayah?: number | null;
  has_previous?: boolean | null;
  has_next?: boolean | null;
  ayahs: ReaderAyah[];
}

export interface ResearchFocusAyah {
  surah: number;
  ayah: number;
}

export interface ResearchAgentResponse {
  status: "needs_clarification" | "answered" | "no_results";
  mode: "strict" | "tafssir";
  answer?: string | null;
  clarifying_question?: string | null;
  disclaimer?: string | null;
  tafssir?: TafssirStructuredAnswer | null;
  provider?: ResearchProviderInfo | null;
  usage?: ResearchUsageSummary | null;
  related_terms: ResearchRelatedTerm[];
  searches: ResearchSearchItem[];
  ayahs: ResearchAgentAyah[];
}

export interface QuranPageSurah {
  id: number;
  name: string;
}

export interface SurahListItem {
  id: number;
  name: string;
  name_english?: string | null;
  type?: string | null;
  ayah_count: number;
}

export interface NotebookItem {
  id: number;
  ayah_id: number;
  mushaf_id: number;
  surah_id?: number | null;
  surah?: string | null;
  ayah?: number | null;
  text?: string | null;
  note?: string | null;
  collection?: string | null;
  /** Themes (مواضيع) this saved ayah is highlighted with. */
  theme_ids: number[];
  created_at: number;
}

/** Fixed highlight palette — legible on both themes and on glyph pages. */
export type ThemeColor = "gold" | "sand" | "green" | "teal" | "blue" | "violet" | "rose" | "grey";

/** A theme (موضوع): a named highlight colour grouping saved ayahs by subject. */
export interface ThemeSummary {
  id: number;
  name: string;
  color: ThemeColor;
  description?: string | null;
  item_count: number;
  created_at: number;
  updated_at: number;
}

export interface ThemeDetail extends ThemeSummary {
  /**
   * The theme's boards, as versioned JSON (the server stores it opaquely):
   * v2 = a set of named boards (ThemeBoardSet); v1 = one legacy ThemeBoard,
   * read as a set of one. Null until a board is created.
   */
  board?: ThemeBoardSet | ThemeBoard | null;
}

export interface ThemeCreate {
  name: string;
  color?: ThemeColor;
  description?: string | null;
}

export interface ThemeUpdate {
  name?: string;
  color?: ThemeColor;
  description?: string | null;
}

export type ThemeBoardNodeType = "ayah" | "note" | "heading" | "shape";

export interface ThemeBoardNode {
  id: string;
  type: ThemeBoardNodeType;
  x: number;
  y: number;
  w?: number;
  h?: number;
  /**
   * ayah: { ayah_id, expanded? } · note: { text } · heading: { text } ·
   * shape: { shape: "rect" | "ellipse" | "diamond", text? }. Any node may carry
   * `style: { color, bg, border, borderColor, size, font }` (see board-style.ts).
   */
  data: Record<string, unknown>;
}

export interface ThemeBoardEdge {
  id: string;
  source: string;
  target: string;
  label?: string | null;
}

export interface ThemeBoard {
  v: 1;
  nodes: ThemeBoardNode[];
  edges: ThemeBoardEdge[];
  viewport?: { x: number; y: number; zoom: number } | null;
  /** Ayah node ids the researcher hid from the board (they stay saved in the theme). */
  hidden?: string[];
}

/** One named board of a theme (a theme can have several, or none). */
export interface ThemeBoardEntry {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  board: ThemeBoard;
}

export interface ThemeBoardSet {
  v: 2;
  boards: ThemeBoardEntry[];
}

export interface NotebookItemCreate {
  ayah_id: number;
  mushaf_id?: number;
  surah_id?: number | null;
  surah?: string | null;
  ayah?: number | null;
  text?: string | null;
  note?: string | null;
  collection?: string | null;
  theme_ids?: number[];
}

export interface ResearchSessionSummary {
  id: string;
  title: string;
  mode: "strict" | "tafssir";
  message_count: number;
  created_at: number;
  updated_at: number;
}

/**
 * One persisted Studio message. Versioned so the restore path can evolve the
 * shape without breaking older stored sessions (`v` absent ⇒ legacy role+content
 * only). Assistant messages keep the full research `response` so evidence cards
 * rebuild on restore instead of being lost to the round-trip.
 */
export interface StoredMessage {
  v?: 1;
  role: "user" | "assistant";
  content: string;
  response?: ResearchAgentResponse;
}

export interface ResearchSessionDetail extends ResearchSessionSummary {
  messages: StoredMessage[];
}

export interface ResearchSessionSave {
  id: string;
  title: string;
  mode: "strict" | "tafssir";
  messages: StoredMessage[];
}

export interface FollowedRoot {
  id: number;
  root_text: string;
  root_id?: number | null;
  occurrences?: number | null;
  created_at: number;
}

export interface FollowedRootCreate {
  root_text: string;
  root_id?: number | null;
  occurrences?: number | null;
}

export interface DeleteResult {
  deleted: boolean;
}

export interface MorphologyWord {
  position: number;
  text: string;
  root?: string | null;
  lemma?: string | null;
  pos: string;
  pos_label: string;
  case?: string | null;
  case_label?: string | null;
  features: string[];
}

export interface MorphologyResponse {
  found: boolean;
  surah: number;
  ayah: number;
  words: MorphologyWord[];
}

export type NumeralScript = "arabic-indic" | "latin" | "persian";

/** How pages/ayahs are arranged in the reader (orthogonal to mushaf_render). */
export type ReaderLayout = "auto" | "single" | "spread" | "scroll" | "ayah";

export interface ResearchDefaults {
  default_mode: "strict" | "tafssir";
  depth: "fast" | "balanced" | "deep";
}

/** Last reading position — powers the personalized Home ayah hero. */
export interface ReadingPosition {
  ayah_id: number;
  mushaf_id: number;
  surah?: number | null;
  ayah?: number | null;
  page?: number | null;
  updated_at?: number | null;
}

/** A bookmarked muṣḥaf page — surfaced on Home to reopen the reader there. */
export interface SavedPageEntry {
  page: number;
  mushaf_id: number;
  surah?: string | null;
  surah_id?: number | null;
  saved_at?: number | null;
}

/** Mushaf editions the reader offers (v1: the Madani mushaf only). */
export type MushafEditionId = "madani-hafs";

export interface UserPreferences {
  /** The reader's mushaf edition — fixes the riwāyah and how it is drawn. */
  mushaf_edition: MushafEditionId;
  /** @deprecated since `mushaf_edition`; kept for API compatibility. */
  riwayah: number;
  mushaf_font: string;
  numerals: NumeralScript;
  ui_language: string;
  theme: "dark" | "light" | "system";
  font_size: number;
  reciter: string;
  /** @deprecated since `mushaf_edition`; kept for API compatibility. */
  mushaf_render: "authentic" | "simple";
  reader_layout: ReaderLayout;
  research: ResearchDefaults;
  last_position?: ReadingPosition | null;
  saved_pages?: SavedPageEntry[] | null;
  /** Translations of meanings shown under each ayah (keys from `GET /api/translations`, ≤3). */
  translations?: string[];
}

export interface RootDistributionSurah {
  surah_id: number;
  surah: string;
  count: number;
}

export interface RootDistributionResponse {
  found: boolean;
  root: string;
  total: number;
  surah_count: number;
  surahs: RootDistributionSurah[];
}

/** GET /api/reciters/{id}/durations/{surah}: every verse's audio duration,
 *  measured once on the server and shared by every user (null = not measured
 *  yet). Immutable once `complete`. */
export interface ReciterDurations {
  reciter_id: string;
  surah: number;
  durations: (number | null)[];
  complete: boolean;
}

export interface ReciterItem {
  id: string;
  name: string;
  name_english: string;
  riwayah: string;
  style: string;
  audio_base: string;
}

export interface UserPreferencesUpdate {
  mushaf_edition?: MushafEditionId;
  riwayah?: number;
  mushaf_font?: string;
  numerals?: NumeralScript;
  ui_language?: string;
  theme?: "dark" | "light" | "system";
  font_size?: number;
  reciter?: string;
  mushaf_render?: "authentic" | "simple";
  reader_layout?: ReaderLayout;
  research?: Partial<ResearchDefaults>;
  last_position?: ReadingPosition | null;
  saved_pages?: SavedPageEntry[] | null;
  translations?: string[];
}

/** An installed translation of the Quran's meanings, with its provenance. */
export interface TranslationInfo {
  /** `quranenc:<key>` or `tanzil:<id>`. */
  key: string;
  /** ISO 639-1 code (`ber` for Tamazight). */
  language: string;
  kind: "translation" | "transliteration";
  name: string;
  translator: string;
  description?: string;
  source: "quranenc" | "tanzil";
  source_url: string;
  terms: string;
  version?: string;
  direction: "ltr" | "rtl";
  ayah_count: number;
}

export interface TranslationMeta {
  key: string;
  language: string;
  kind: string;
  name: string;
  translator: string;
  source: string;
  source_url: string;
  direction: string;
}

export interface TranslatedAyah {
  surah: number;
  ayah: number;
  texts: { key: string; text: string; footnotes?: string | null }[];
}

export interface TranslationAyahsResponse {
  translations: TranslationMeta[];
  ayahs: TranslatedAyah[];
}

export interface QuranPageAyah {
  ayah_id: number;
  mushaf_id: number;
  surah_id: number;
  surah: string;
  ayah: number;
  text: string;
  global_index: number;
  page: string | number;
  juz?: number | null;
  line_start?: number | null;
  line_end?: number | null;
  is_selected: boolean;
}

export interface QuranPageResponse {
  found: boolean;
  mushaf_id?: number;
  page?: number;
  min_page?: number;
  max_page?: number;
  total_pages?: number;
  page_count?: number;
  has_previous?: boolean;
  has_next?: boolean;
  selected_ayah_id?: number | null;
  juz?: number | null;
  juz_secondary?: number | null;
  surahs?: QuranPageSurah[];
  ayahs: QuranPageAyah[];
}

// ---- Authentic Madani (QCF) page layout — Hafs only ----

export type MushafLineType = "ayah" | "surah_name" | "basmalah";

export interface MushafLayoutGlyph {
  glyph: string; // QCF private-use glyph string, rendered with the page font
  surah: number;
  ayah: number;
  word_position: number;
  ayah_id: number;
  word_key: string; // "surah:ayah:word_position"
  text?: string | null;
  is_selected?: boolean;
}

export interface MushafLayoutLine {
  line_number: number;
  line_type: MushafLineType;
  is_centered?: boolean;
  surah_number?: number | null;
  surah_name?: string | null;
  glyph?: string | null; // basmalah line-level glyph
  font_family?: string | null;
  words?: MushafLayoutGlyph[];
}

export interface MushafPageLayoutResponse {
  found: boolean;
  fallback?: "reader" | null; // present when authentic layout is unavailable
  mushaf_id?: number;
  page?: number;
  min_page?: number;
  max_page?: number;
  has_previous?: boolean;
  has_next?: boolean;
  selected_ayah_id?: number | null;
  layout_id?: string | null;
  font_base_path?: string | null;
  surahs?: QuranPageSurah[];
  lines?: MushafLayoutLine[];
}
