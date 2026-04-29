export type SearchMode = "root" | "exact";

export interface MushafItem {
  id: number;
  name: string;
  description?: string | null;
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
