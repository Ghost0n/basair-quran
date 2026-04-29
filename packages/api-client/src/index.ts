import type {
  MushafItem,
  PaginatedSearchResponse,
  QuranPageResponse,
  SearchMode,
  SearchResultPageResponse,
  SuggestionItem,
} from "@q-basair/shared";

export interface QBasairApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export function createQBasairApiClient(options: QBasairApiClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      ...init,
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  return {
    getMushafs(): Promise<MushafItem[]> {
      return request<MushafItem[]>("/mushafs");
    },
    getSuggestions(query: string, mode: SearchMode, mushaf: number, withChakl = false): Promise<SuggestionItem[]> {
      return request<SuggestionItem[]>(
        `/suggest?q=${encodeURIComponent(query)}&mode=${mode}&mushaf=${mushaf}&with_chakl=${withChakl}`,
      );
    },
    getSuggestionsBatch(queries: string[], mode: SearchMode, mushaf: number, withChakl = false): Promise<SuggestionItem[]> {
      return request<SuggestionItem[]>("/suggest-batch", {
        method: "POST",
        body: JSON.stringify({
          queries,
          mode,
          mushaf,
          with_chakl: withChakl,
        }),
      });
    },
    searchV2(query: string, mode: SearchMode, mushaf: number, pageSize: number): Promise<PaginatedSearchResponse> {
      return request<PaginatedSearchResponse>(
        `/search-v2?q=${encodeURIComponent(query)}&mode=${mode}&mushaf=${mushaf}&page_size=${pageSize}`,
      );
    },
    getSearchResultPage(
      query: string,
      mode: SearchMode,
      mushaf: number,
      resultKey: string,
      page: number,
      pageSize: number,
    ): Promise<SearchResultPageResponse> {
      return request<SearchResultPageResponse>(
        `/search-result-page?q=${encodeURIComponent(query)}&mode=${mode}&mushaf=${mushaf}&result_key=${encodeURIComponent(resultKey)}&page=${page}&page_size=${pageSize}`,
      );
    },
    getQuranPage(mushaf: number, page: number, selectedAyahId?: number): Promise<QuranPageResponse> {
      const selectedAyahPart = typeof selectedAyahId === "number" ? `&selected_ayah_id=${selectedAyahId}` : "";
      return request<QuranPageResponse>(`/quran-page?mushaf=${mushaf}&page=${page}${selectedAyahPart}`);
    },
    getQuranPageForAyah(mushaf: number, ayahId: number): Promise<QuranPageResponse> {
      return request<QuranPageResponse>(`/quran-page?mushaf=${mushaf}&ayah_id=${ayahId}`);
    },
  };
}
