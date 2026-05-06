export type SearchMode = "root" | "exact";

export interface MushafItem {
  id: number;
  name: string;
  description?: string | null;
}

export interface AuthLoginRequest {
  email: string;
  password: string;
}

export interface AuthUserInfo {
  id: number;
  email: string;
  is_admin: boolean;
}

export interface AuthSessionResponse {
  enabled: boolean;
  authenticated: boolean;
  user?: AuthUserInfo | null;
}

export interface SuggestionItem {
  type: "word" | "root" | "phrase";
  text: string;
  root_id?: number | null;
  label?: string;
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

export interface QuranPageAyah {
  ayah_id: number;
  mushaf_id: number;
  surah_id: number;
  surah: string;
  ayah: number;
  text: string;
  global_index: number;
  page: string | number;
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
  ayahs: QuranPageAyah[];
}
