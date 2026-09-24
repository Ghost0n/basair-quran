import type {
  AyahReaderResponse,
  AuthLoginRequest,
  AuthOkResponse,
  AuthProfileUpdate,
  AuthSessionResponse,
  AuthSignupRequest,
  AuthUserInfo,
  DeleteResult,
  DeviceInfo,
  FollowedRoot,
  FollowedRootCreate,
  GuestMergeRequest,
  GuestMergeResult,
  GuestMergeUndoRequest,
  MorphologyResponse,
  MushafItem,
  NotebookItem,
  NotebookItemCreate,
  TextCountResponse,
  ThemeBoard,
  ThemeCreate,
  ThemeDetail,
  ThemeSummary,
  ThemeUpdate,
  ReciterItem,
  RootDistributionResponse,
  ResearchAgentSettingsResponse,
  PaginatedSearchResponse,
  MushafPageLayoutResponse,
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

// A per-device guest token, injected on every request as `X-QBasair-Guest-Id`
// so guest (user_id=0) writes are stamped and a later guest→account merge can be
// scoped to the caller's own rows. The web app registers a provider that reads
// (and lazily creates) the token; server-side / unregistered ⇒ no header.
let guestIdProvider: (() => string | null | undefined) | null = null;

export function setGuestIdProvider(provider: (() => string | null | undefined) | null): void {
  guestIdProvider = provider;
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
    const guestId = guestIdProvider?.();
    const mergedHeaders = {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(guestId ? { "X-QBasair-Guest-Id": guestId } : {}),
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
        !path.startsWith("/auth/signup") &&
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
    signup(req: AuthSignupRequest, options?: RequestOptions): Promise<AuthSessionResponse> {
      return request<AuthSessionResponse>(
        "/auth/signup",
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
    deleteAccount(options?: RequestOptions): Promise<DeleteResult> {
      return request<DeleteResult>(
        "/auth/account",
        { method: "DELETE", headers: options?.headers },
        options,
      );
    },
    forgotPassword(email: string, options?: RequestOptions): Promise<AuthOkResponse> {
      return request<AuthOkResponse>(
        "/auth/forgot-password",
        { method: "POST", headers: options?.headers, body: JSON.stringify({ email }) },
        options,
      );
    },
    resetPassword(token: string, password: string, options?: RequestOptions): Promise<AuthOkResponse> {
      return request<AuthOkResponse>(
        "/auth/reset-password",
        { method: "POST", headers: options?.headers, body: JSON.stringify({ token, password }) },
        options,
      );
    },
    updateProfile(patch: AuthProfileUpdate, options?: RequestOptions): Promise<AuthUserInfo> {
      return request<AuthUserInfo>(
        "/auth/profile",
        {
          method: "PATCH",
          headers: options?.headers,
          body: JSON.stringify(patch),
        },
        options,
      );
    },
    getDevices(options?: RequestOptions): Promise<DeviceInfo[]> {
      return request<DeviceInfo[]>("/auth/devices", { headers: options?.headers }, options);
    },
    ejectDevice(sessionId: number, options?: RequestOptions): Promise<DeleteResult> {
      return request<DeleteResult>(
        `/auth/devices/${sessionId}`,
        { method: "DELETE", headers: options?.headers },
        options,
      );
    },
    mergeGuestData(req: GuestMergeRequest, options?: RequestOptions): Promise<GuestMergeResult> {
      return request<GuestMergeResult>(
        "/auth/merge-guest-data",
        {
          method: "POST",
          headers: options?.headers,
          body: JSON.stringify(req),
        },
        options,
      );
    },
    undoMergeGuestData(req: GuestMergeUndoRequest, options?: RequestOptions): Promise<GuestMergeResult> {
      return request<GuestMergeResult>(
        "/auth/merge-guest-data/undo",
        {
          method: "POST",
          headers: options?.headers,
          body: JSON.stringify(req),
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
    getMushafPageLayout(
      mushaf: number,
      page?: number,
      selectedAyahId?: number,
    ): Promise<MushafPageLayoutResponse> {
      const pagePart = typeof page === "number" ? `&page=${page}` : "";
      const selectedPart = typeof selectedAyahId === "number" ? `&selected_ayah_id=${selectedAyahId}` : "";
      return request<MushafPageLayoutResponse>(
        `/mushaf-page-layout?mushaf=${mushaf}${pagePart}${selectedPart}`,
      );
    },
    getSurahs(mushaf?: number): Promise<SurahListItem[]> {
      return request<SurahListItem[]>(typeof mushaf === "number" ? `/surahs?mushaf=${mushaf}` : "/surahs");
    },
    getAyahReader(ayahId: number, options: { mushaf?: number; before?: number; after?: number } = {}): Promise<AyahReaderResponse> {
      const params = new URLSearchParams({
        ayah_id: String(ayahId),
        mushaf: String(options.mushaf ?? 2),
        before: String(options.before ?? 5),
        after: String(options.after ?? 5),
      });
      return request<AyahReaderResponse>(`/ayah-reader?${params.toString()}`);
    },
    getTextCount(
      text: string,
      options: { mushaf?: number; surah?: number | null; page?: number | null } = {},
    ): Promise<TextCountResponse> {
      const params = new URLSearchParams({ text, mushaf: String(options.mushaf ?? 2) });
      if (options.surah) params.set("surah", String(options.surah));
      if (options.page) params.set("page", String(options.page));
      return request<TextCountResponse>(`/text-count?${params.toString()}`);
    },
    getMorphology(surah: number, ayah: number, mushaf?: number): Promise<MorphologyResponse> {
      // `mushaf` lets the backend read that riwāyah's verse text and match it by
      // skeleton, so morphology is correct even when the ayah numbering differs
      // from the source — without sending the whole verse in the URL.
      const mushafPart = typeof mushaf === "number" ? `&mushaf=${mushaf}` : "";
      return request<MorphologyResponse>(`/morphology?surah=${surah}&ayah=${ayah}${mushafPart}`);
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
    setNotebookItemThemes(itemId: number, themeIds: number[]): Promise<NotebookItem> {
      return request<NotebookItem>(`/notebook/${itemId}/themes`, {
        method: "PUT",
        body: JSON.stringify({ theme_ids: themeIds }),
      });
    },
    getThemes(): Promise<ThemeSummary[]> {
      return request<ThemeSummary[]>("/themes");
    },
    getTheme(themeId: number): Promise<ThemeDetail> {
      return request<ThemeDetail>(`/themes/${themeId}`);
    },
    createTheme(theme: ThemeCreate): Promise<ThemeSummary> {
      return request<ThemeSummary>("/themes", { method: "POST", body: JSON.stringify(theme) });
    },
    updateTheme(themeId: number, patch: ThemeUpdate): Promise<ThemeDetail> {
      return request<ThemeDetail>(`/themes/${themeId}`, { method: "PATCH", body: JSON.stringify(patch) });
    },
    saveThemeBoard(themeId: number, board: ThemeBoard): Promise<ThemeDetail> {
      return request<ThemeDetail>(`/themes/${themeId}/board`, { method: "PUT", body: JSON.stringify({ board }) });
    },
    deleteTheme(themeId: number): Promise<DeleteResult> {
      return request<DeleteResult>(`/themes/${themeId}`, { method: "DELETE" });
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
