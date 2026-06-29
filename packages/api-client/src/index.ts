import type {
  AuthLoginRequest,
  AuthSessionResponse,
  DeleteResult,
  FollowedRoot,
  FollowedRootCreate,
  MorphologyResponse,
  MushafItem,
  NotebookItem,
  NotebookItemCreate,
  ReciterItem,
  RootDistributionResponse,
  ResearchAgentSettingsResponse,
  PaginatedSearchResponse,
  QuranPageResponse,
  ResearchAgentRequest,
  ResearchAgentResponse,
  ResearchSessionDetail,
  ResearchSessionSave,
  ResearchSessionSummary,
  SearchMode,
  SearchResultPageResponse,
  SuggestionItem,
  SurahListItem,
  UserPreferences,
  UserPreferencesUpdate,
} from "@q-basair/shared";

export interface QBasairApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  headers?: HeadersInit;
  suppressAuthRedirect?: boolean;
}

function formatErrorDetail(detail: unknown): string {
  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object") {
          const entry = item as { loc?: unknown; msg?: unknown; type?: unknown };
          const location = Array.isArray(entry.loc) ? entry.loc.join(" > ") : "";
          const message = typeof entry.msg === "string" ? entry.msg : JSON.stringify(item);
          return location ? `${location}: ${message}` : message;
        }
        return String(item);
      })
      .join("; ");
  }

  if (detail && typeof detail === "object") {
    return JSON.stringify(detail);
  }

  return String(detail ?? "");
}

export function createQBasairApiClient(options: QBasairApiClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  async function request<T>(path: string, init?: RequestInit, options?: RequestOptions): Promise<T> {
    const mergedHeaders = {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    };

    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      credentials: init?.credentials ?? "include",
      headers: mergedHeaders,
    });

    if (!response.ok) {
      let errorDetail = "";
      try {
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          const payload = (await response.json()) as { detail?: unknown };
          const formattedDetail = formatErrorDetail(payload.detail);
          errorDetail = formattedDetail ? ` - ${formattedDetail}` : "";
        } else {
          const text = (await response.text()).trim();
          errorDetail = text ? ` - ${text}` : "";
        }
      } catch {
        errorDetail = "";
      }

      if (
        response.status === 401 &&
        typeof window !== "undefined" &&
        !options?.suppressAuthRedirect &&
        !path.startsWith("/auth/login") &&
        !path.startsWith("/auth/session")
      ) {
        const nextPath = `${window.location.pathname}${window.location.search}`;
        window.location.assign(`/login?next=${encodeURIComponent(nextPath)}`);
      }

      throw new Error(`API request failed: ${response.status} ${response.statusText}${errorDetail}`);
    }

    return (await response.json()) as T;
  }

  return {
    getAuthSession(options?: RequestOptions): Promise<AuthSessionResponse> {
      return request<AuthSessionResponse>("/auth/session", { method: "GET" }, options);
    },
    login(req: AuthLoginRequest, options?: RequestOptions): Promise<AuthSessionResponse> {
      return request<AuthSessionResponse>(
        "/auth/login",
        {
          method: "POST",
          headers: options?.headers,
          body: JSON.stringify(req),
        },
        options,
      );
    },
    logout(options?: RequestOptions): Promise<AuthSessionResponse> {
      return request<AuthSessionResponse>(
        "/auth/logout",
        {
          method: "POST",
          headers: options?.headers,
        },
        options,
      );
    },
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
    researchAgent(req: ResearchAgentRequest, options?: RequestOptions): Promise<ResearchAgentResponse> {
      return request<ResearchAgentResponse>(
        "/research-agent",
        {
          method: "POST",
          headers: options?.headers,
          body: JSON.stringify(req),
        },
        options,
      );
    },
    getResearchAgentSettings(options?: RequestOptions): Promise<ResearchAgentSettingsResponse> {
      return request<ResearchAgentSettingsResponse>(
        "/research-agent/settings",
        {
          headers: options?.headers,
        },
        options,
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
    getQuranPageForSurah(mushaf: number, surah: number, ayah?: number): Promise<QuranPageResponse> {
      const ayahPart = typeof ayah === "number" ? `&ayah=${ayah}` : "";
      return request<QuranPageResponse>(`/quran-page?mushaf=${mushaf}&surah=${surah}${ayahPart}`);
    },
    getQuranPageForJuz(mushaf: number, juz: number): Promise<QuranPageResponse> {
      return request<QuranPageResponse>(`/quran-page?mushaf=${mushaf}&juz=${juz}`);
    },
    getSurahs(): Promise<SurahListItem[]> {
      return request<SurahListItem[]>("/surahs");
    },
    getMorphology(surah: number, ayah: number): Promise<MorphologyResponse> {
      return request<MorphologyResponse>(`/morphology?surah=${surah}&ayah=${ayah}`);
    },
    getReciters(): Promise<ReciterItem[]> {
      return request<ReciterItem[]>("/reciters");
    },
    getRootDistribution(root: string, mushaf = 1): Promise<RootDistributionResponse> {
      return request<RootDistributionResponse>(
        `/root-distribution?root=${encodeURIComponent(root)}&mushaf=${mushaf}`,
      );
    },
    getNotebook(): Promise<NotebookItem[]> {
      return request<NotebookItem[]>("/notebook");
    },
    addNotebookItem(item: NotebookItemCreate): Promise<NotebookItem> {
      return request<NotebookItem>("/notebook", { method: "POST", body: JSON.stringify(item) });
    },
    deleteNotebookItem(itemId: number): Promise<DeleteResult> {
      return request<DeleteResult>(`/notebook/${itemId}`, { method: "DELETE" });
    },
    getSessions(): Promise<ResearchSessionSummary[]> {
      return request<ResearchSessionSummary[]>("/sessions");
    },
    getSession(sessionId: string): Promise<ResearchSessionDetail> {
      return request<ResearchSessionDetail>(`/sessions/${encodeURIComponent(sessionId)}`);
    },
    saveSession(session: ResearchSessionSave): Promise<ResearchSessionDetail> {
      return request<ResearchSessionDetail>("/sessions", { method: "POST", body: JSON.stringify(session) });
    },
    deleteSession(sessionId: string): Promise<DeleteResult> {
      return request<DeleteResult>(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
    },
    getRoots(): Promise<FollowedRoot[]> {
      return request<FollowedRoot[]>("/roots");
    },
    followRoot(root: FollowedRootCreate): Promise<FollowedRoot> {
      return request<FollowedRoot>("/roots", { method: "POST", body: JSON.stringify(root) });
    },
    unfollowRoot(rootId: number): Promise<DeleteResult> {
      return request<DeleteResult>(`/roots/${rootId}`, { method: "DELETE" });
    },
    getPreferences(): Promise<UserPreferences> {
      return request<UserPreferences>("/user/preferences");
    },
    updatePreferences(patch: UserPreferencesUpdate): Promise<UserPreferences> {
      return request<UserPreferences>("/user/preferences", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    },
  };
}
