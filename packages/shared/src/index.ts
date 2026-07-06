export type SearchMode = "root" | "exact";

export interface MushafItem {
  id: number;
  name: string;
  description?: string | null;
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
  created_at: number;
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
}

export interface ResearchSessionSummary {
  id: string;
  title: string;
  mode: "strict" | "tafssir";
  message_count: number;
  created_at: number;
  updated_at: number;
}

export interface ResearchSessionDetail extends ResearchSessionSummary {
  messages: Array<Record<string, unknown>>;
}

export interface ResearchSessionSave {
  id: string;
  title: string;
  mode: "strict" | "tafssir";
  messages: Array<Record<string, unknown>>;
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

export interface UserPreferences {
  riwayah: number;
  mushaf_font: string;
  numerals: NumeralScript;
  ui_language: string;
  theme: "dark" | "light" | "system";
  font_size: number;
  reciter: string;
  mushaf_render: "authentic" | "simple";
  reader_layout: ReaderLayout;
  research: ResearchDefaults;
  last_position?: ReadingPosition | null;
  saved_pages?: SavedPageEntry[] | null;
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

export interface ReciterItem {
  id: string;
  name: string;
  name_english: string;
  riwayah: string;
  style: string;
  audio_base: string;
}

export interface UserPreferencesUpdate {
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
