import type {
  AiProviderItem,
  OpenRouterKeyResponse,
  AyahReaderResponse,
  CommentItem,
  FeedPage,
  FeedQuery,
  LikeResult,
  SaveResult,
  TagCount,
  TranslationAyahsResponse,
  TranslationInfo,
  AppealCreate,
  AppealDecision,
  AppealItem,
  AuthorStanding,
  BanRequest,
  FeedbackCreate,
  FeedbackItem,
  FeedbackKind,
  FeedbackPage,
  FeedbackStatus,
  FeedbackUpdate,
  ModerationAction,
  ModerationDecision,
  ModerationHealth,
  ModerationQueue,
  ModerationRun,
  ModerationUser,
  TeamMember,
  PostDetail,
  PostSummary,
  PublishRequest,
  PublishResult,
  ReportCreate,
  DocumentAudit,
  ResearchDocument,
  ResearchDocumentSave,
  ResearchDocumentSummary,
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
  ThemeBoardSet,
  ThemeCreate,
  ThemeDetail,
  ThemeSummary,
  ThemeUpdate,
  ReciterDurations,
  SurahRecitation,
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

/**
 * GETs in flight, shared by every client instance on the page: when two screens
 * ask for the same URL at the same moment (the reader and the recitation bar
 * both loading the surah list, Home and the saved-verse store both loading the
 * notebook), one network request answers both. Only while it is in flight —
 * nothing is kept afterwards (freshness stays HTTP caching's job).
 */
const inflightGets = new Map<string, Promise<unknown>>();

function cloneJson<T>(value: T): T {
  // Each joining caller gets its own copy: no screen can mutate another's data.
  return typeof structuredClone === "function" ? structuredClone(value) : (JSON.parse(JSON.stringify(value)) as T);
}

export function createQBasairApiClient(options: QBasairApiClientOptions) {
  // Resolve the global fetch at call time, never at creation: the app build
  // swaps window.fetch for its device router (lib/app-mode/fetch-router.ts),
  // and a client created before that would keep the native fetch and get the
  // app's index.html back for /api (iOS: "The string did not match the
  // expected pattern" from response.json()).
  const fetchImpl: typeof fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  function request<T>(path: string, init?: RequestInit, options?: RequestOptions): Promise<T> {
    const method = (init?.method ?? "GET").toUpperCase();
    // Plain reads only: a cancellable request or one with a body is never merged.
    if (method !== "GET" || init?.body || init?.signal) return send<T>(path, init, options);
    const key = `${baseUrl}${path}\u0000${guestIdProvider?.() ?? ""}`;
    const shared = inflightGets.get(key) as Promise<T> | undefined;
    if (shared) return shared.then(cloneJson);
    const pending = send<T>(path, init, options).finally(() => inflightGets.delete(key));
    inflightGets.set(key, pending);
    return pending;
  }

  async function send<T>(path: string, init?: RequestInit, options?: RequestOptions): Promise<T> {
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
    /** `surah` (1–114) keeps only that surah's verses: their counts and pages describe that surah. */
    searchV2(query: string, mode: SearchMode, mushaf: number, pageSize: number, surah?: number | null): Promise<PaginatedSearchResponse> {
      const surahPart = typeof surah === "number" ? `&surah=${surah}` : "";
      return request<PaginatedSearchResponse>(
        `/search-v2?q=${encodeURIComponent(query)}&mode=${mode}&mushaf=${mushaf}&page_size=${pageSize}${surahPart}`,
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
    /** The AI providers a reader can connect (their addresses stay on the server). */
    getAiProviders(): Promise<AiProviderItem[]> {
      return request<AiProviderItem[]>("/ai/providers");
    },
    /** OpenRouter's sign-in: the code it sent back + the PKCE verifier, for the reader's own key. */
    exchangeOpenRouterKey(code: string, codeVerifier: string): Promise<OpenRouterKeyResponse> {
      return request<OpenRouterKeyResponse>("/ai/openrouter/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, code_verifier: codeVerifier }),
      });
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
      surah?: number | null,
    ): Promise<SearchResultPageResponse> {
      const surahPart = typeof surah === "number" ? `&surah=${surah}` : "";
      return request<SearchResultPageResponse>(
        `/search-result-page?q=${encodeURIComponent(query)}&mode=${mode}&mushaf=${mushaf}&result_key=${encodeURIComponent(resultKey)}&page=${page}&page_size=${pageSize}${surahPart}`,
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
    getReciterDurations(reciterId: string, surah: number): Promise<ReciterDurations> {
      return request<ReciterDurations>(`/reciters/${encodeURIComponent(reciterId)}/durations/${surah}`);
    },
    /** A prepared surah's recording and verse timings (404 when it isn't prepared). */
    getSurahRecitation(reciterId: string, surah: number): Promise<SurahRecitation> {
      return request<SurahRecitation>(`/recitations/${encodeURIComponent(reciterId)}/${surah}`);
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
    getDocuments(): Promise<ResearchDocumentSummary[]> {
      return request<ResearchDocumentSummary[]>("/documents");
    },
    getDocument(documentId: string): Promise<ResearchDocument> {
      return request<ResearchDocument>(`/documents/${encodeURIComponent(documentId)}`);
    },
    createDocument(document: ResearchDocumentSave): Promise<ResearchDocument> {
      return request<ResearchDocument>("/documents", { method: "POST", body: JSON.stringify(document) });
    },
    saveDocument(documentId: string, document: ResearchDocumentSave): Promise<ResearchDocument> {
      return request<ResearchDocument>(`/documents/${encodeURIComponent(documentId)}`, {
        method: "PUT",
        body: JSON.stringify(document),
      });
    },
    auditDocument(documentId: string): Promise<DocumentAudit> {
      return request<DocumentAudit>(`/documents/${encodeURIComponent(documentId)}/audit`);
    },
    deleteDocument(documentId: string): Promise<DeleteResult> {
      return request<DeleteResult>(`/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" });
    },
    publishDocument(documentId: string, body: PublishRequest): Promise<PublishResult> {
      return request<PublishResult>(`/documents/${encodeURIComponent(documentId)}/publish`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    getFeed(query: FeedQuery = {}): Promise<FeedPage> {
      const params = new URLSearchParams({ limit: String(query.limit ?? 20) });
      if (query.cursor) params.set("cursor", query.cursor);
      if (query.sort && query.sort !== "latest") params.set("sort", query.sort);
      if (query.q?.trim()) params.set("q", query.q.trim());
      if (query.surah) params.set("surah", String(query.surah));
      if (query.tag) params.set("tag", query.tag);
      if (query.mode) params.set("mode", query.mode);
      if (query.board) params.set("board", "true");
      if (query.author != null) params.set("author", String(query.author));
      if (query.saved) params.set("saved", "true");
      return request<FeedPage>(`/community/feed?${params.toString()}`);
    },
    getTranslations(): Promise<TranslationInfo[]> {
      return request<TranslationInfo[]>("/translations");
    },
    /** `refs`: "surah:ayah" or "surah:start-end" items (≤400 ayahs); `keys`: ≤3 translation keys. */
    getTranslationAyahs(keys: string[], refs: string[]): Promise<TranslationAyahsResponse> {
      const params = new URLSearchParams({ keys: keys.join(","), refs: refs.join(",") });
      return request<TranslationAyahsResponse>(`/translations/ayahs?${params.toString()}`);
    },
    getCommunityTags(limit = 20): Promise<TagCount[]> {
      return request<TagCount[]>(`/community/tags?limit=${limit}`);
    },
    setSaved(postId: string, saved: boolean): Promise<SaveResult> {
      return request<SaveResult>(`/community/posts/${encodeURIComponent(postId)}/save`, {
        method: saved ? "PUT" : "DELETE",
      });
    },
    getMyPosts(): Promise<PostSummary[]> {
      return request<PostSummary[]>("/community/mine");
    },
    getPost(postId: string): Promise<PostDetail> {
      return request<PostDetail>(`/community/posts/${encodeURIComponent(postId)}`);
    },
    withdrawPost(postId: string): Promise<DeleteResult> {
      return request<DeleteResult>(`/community/posts/${encodeURIComponent(postId)}`, { method: "DELETE" });
    },
    setLike(postId: string, liked: boolean): Promise<LikeResult> {
      return request<LikeResult>(`/community/posts/${encodeURIComponent(postId)}/like`, {
        method: liked ? "POST" : "DELETE",
      });
    },
    getComments(postId: string): Promise<CommentItem[]> {
      return request<CommentItem[]>(`/community/posts/${encodeURIComponent(postId)}/comments`);
    },
    addComment(postId: string, body: string): Promise<CommentItem> {
      return request<CommentItem>(`/community/posts/${encodeURIComponent(postId)}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
    },
    deleteComment(commentId: number): Promise<DeleteResult> {
      return request<DeleteResult>(`/community/comments/${commentId}`, { method: "DELETE" });
    },
    report(report: ReportCreate): Promise<DeleteResult> {
      return request<DeleteResult>("/community/reports", { method: "POST", body: JSON.stringify(report) });
    },
    getModerationQueue(): Promise<ModerationQueue> {
      return request<ModerationQueue>("/moderation/queue");
    },
    decidePost(postId: string, decision: ModerationDecision): Promise<PostDetail> {
      return request<PostDetail>(`/moderation/posts/${encodeURIComponent(postId)}/decision`, {
        method: "POST",
        body: JSON.stringify(decision),
      });
    },
    decideComment(commentId: number, decision: ModerationDecision): Promise<CommentItem> {
      return request<CommentItem>(`/moderation/comments/${commentId}/decision`, {
        method: "POST",
        body: JSON.stringify(decision),
      });
    },
    decideAppeal(appealId: number, decision: AppealDecision): Promise<AppealItem> {
      return request<AppealItem>(`/moderation/appeals/${appealId}/decision`, {
        method: "POST",
        body: JSON.stringify(decision),
      });
    },
    getModerationUsers(kind: "suspicious" | "banned"): Promise<ModerationUser[]> {
      return request<ModerationUser[]>(`/moderation/users?kind=${kind}`);
    },
    banUser(userId: number, ban: BanRequest): Promise<AuthorStanding> {
      return request<AuthorStanding>(`/moderation/users/${userId}/ban`, { method: "POST", body: JSON.stringify(ban) });
    },
    unbanUser(userId: number, reason?: string): Promise<AuthorStanding> {
      return request<AuthorStanding>(`/moderation/users/${userId}/unban`, {
        method: "POST",
        body: JSON.stringify({ reason: reason ?? null }),
      });
    },
    getModerationActions(mine = false): Promise<ModerationAction[]> {
      return request<ModerationAction[]>(`/moderation/actions${mine ? "?mine=true" : ""}`);
    },
    getModerationTeam(): Promise<TeamMember[]> {
      return request<TeamMember[]>("/moderation/team");
    },
    setModeratorRole(email: string, role: "moderator" | "user"): Promise<TeamMember[]> {
      return request<TeamMember[]>("/moderation/team", { method: "POST", body: JSON.stringify({ email, role }) });
    },
    getModerationHealth(): Promise<ModerationHealth> {
      return request<ModerationHealth>("/moderation/health");
    },
    runModerationBatch(): Promise<ModerationRun> {
      return request<ModerationRun>("/moderation/run", { method: "POST" });
    },
    getMyStanding(): Promise<AuthorStanding> {
      return request<AuthorStanding>("/community/me/standing");
    },
    appeal(appeal: AppealCreate): Promise<AppealItem> {
      return request<AppealItem>("/community/appeals", { method: "POST", body: JSON.stringify(appeal) });
    },
    getMyAppeals(): Promise<AppealItem[]> {
      return request<AppealItem[]>("/community/appeals");
    },
    sendFeedback(feedback: FeedbackCreate): Promise<FeedbackItem> {
      return request<FeedbackItem>("/feedback", { method: "POST", body: JSON.stringify(feedback) });
    },
    getMyFeedback(): Promise<FeedbackItem[]> {
      return request<FeedbackItem[]>("/feedback/mine");
    },
    getFeedbackTriage(query: { status?: FeedbackStatus; kind?: FeedbackKind; before?: number } = {}): Promise<FeedbackPage> {
      const params = new URLSearchParams();
      if (query.status) params.set("status", query.status);
      if (query.kind) params.set("kind", query.kind);
      if (query.before) params.set("before", String(query.before));
      const suffix = params.toString();
      return request<FeedbackPage>(`/moderation/feedback${suffix ? `?${suffix}` : ""}`);
    },
    updateFeedback(feedbackId: number, update: FeedbackUpdate): Promise<FeedbackItem> {
      return request<FeedbackItem>(`/moderation/feedback/${feedbackId}`, { method: "PATCH", body: JSON.stringify(update) });
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
    saveThemeBoard(themeId: number, board: ThemeBoardSet | ThemeBoard): Promise<ThemeDetail> {
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
