"use client";

import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { createQBasairApiClient } from "@q-basair/api-client";
import type {
  DidYouMeanSuggestion,
  MushafItem,
  PaginatedSearchResult,
  SearchMode,
  SearchVerse,
  SuggestionItem,
} from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";
import {
  clampPage,
  getResultLabelText,
  getSuggestionTypeLabel,
  getVerseSelectionKey,
  hasArabicDiacritics,
  isPhraseInputValue,
  ITEMS_PER_PAGE,
  removeChakl,
} from "@/lib/quran-ui";
import { generateArabicQueryCandidates } from "@/lib/arabic-transliteration";
import { isTechnicalMessage, reportError, sanitizeErrorMessage } from "@/lib/error-report";
import { dedupeSuggestionItems } from "@/features/workspace/lib/dedupe-suggestions";

/**
 * Never surface a raw technical error string. Logs the real error for
 * diagnostics and returns the friendly message: a non-technical error message
 * as-is, otherwise the context-specific Arabic fallback.
 */
function toUserError(scope: string, error: unknown, fallback: string): string {
  reportError(scope, error);
  const raw = error instanceof Error ? error.message : "";
  return isTechnicalMessage(raw) ? fallback : raw;
}
import { usePreferences } from "@/lib/preferences-context";
import { useMushaf } from "@/features/reading/mushaf-context";

import type { ThemeMode } from "../types";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });
const MAX_SUGGESTIONS = 10;
const SUGGESTION_DEBOUNCE_MS = 120;
const QUICK_EXAMPLES: Array<{ label: string; query: string; mode: SearchMode }> = [
  { label: "الحمد", query: "الحمد", mode: "exact" },
  { label: "صراط مستقيم", query: "صراط مستقيم", mode: "exact" },
  { label: "كتب", query: "كتب", mode: "root" },
];

function isLatinQuery(text: string) {
  return /[a-zA-Z]/.test(text);
}

function getSuggestionContext(query: string) {
  if (!isPhraseInputValue(query.trim())) {
    return { sourceQuery: query.trim(), prefixQuery: "" };
  }

  const tokens = query.trim().split(/\s+/);
  return {
    sourceQuery: tokens[tokens.length - 1] ?? "",
    prefixQuery: tokens.slice(0, -1).join(" "),
  };
}

function pickBestSuggestionForMode(items: SuggestionItem[], mode: SearchMode) {
  if (items.length === 0) {
    return null;
  }

  if (mode === "root") {
    return items.find((item) => item.type === "root") ?? items[0];
  }

  return items.find((item) => item.type === "word") ?? items[0];
}

function normalizeSuggestionCandidate(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

export function useSearchWorkspace() {
  const [query, setQuery] = useState("");
  const [previewValue, setPreviewValue] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>("exact");
  // Device-level theme: a stored value is an explicit per-device override.
  // Without one we adopt the account default once it loads (see below).
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "dark";
    try {
      return window.localStorage.getItem("theme") === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  const [mushafs, setMushafs] = useState<MushafItem[]>([]);
  const [selectedMushaf, setSelectedMushaf] = useState<number>(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsWithChakl, setSuggestionsWithChakl] = useState(false);
  const [searchModeInitialized, setSearchModeInitialized] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [loadingMushafs, setLoadingMushafs] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isWorkspaceCollapsing, setIsWorkspaceCollapsing] = useState(false);
  const [results, setResults] = useState<PaginatedSearchResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [didYouMean, setDidYouMean] = useState<DidYouMeanSuggestion | null>(null);
  const [resultPageDrafts, setResultPageDrafts] = useState<Record<string, string>>({});
  const [selectedVerseKey, setSelectedVerseKey] = useState<string | null>(null);
  const [searchContext, setSearchContext] = useState<{ q: string; mode: SearchMode; mushaf: number } | null>(null);

  // Quran-page reading state is owned by the shared MushafProvider so the
  // Reading mode and this search reader stay in sync.
  const mushaf = useMushaf();

  // Theme is a device override layered on top of the account default.
  const { account, updateAccount } = usePreferences();
  const userSetThemeRef = useRef(false);

  // Search state is mirrored into the URL (?q=&sm=) so a search is
  // shareable/bookmarkable; we hydrate from it once on mount.
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlHydratedRef = useRef(false);

  const resultsAreaRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const suggestionsRef = useRef<HTMLDivElement | null>(null);
  const toolsDrawerRef = useRef<HTMLDivElement | null>(null);
  const previousMushafRef = useRef(selectedMushaf);
  const yamliRequestIdRef = useRef(0);
  // Monotonic id so an earlier (slower) runSearch can't overwrite a newer one's
  // results when responses resolve out of order (stale-response race).
  const runSearchIdRef = useRef(0);
  const phraseSuggestionTimerRef = useRef<number | null>(null);
  // Handler-scoped one-shot timeouts, tracked so they can be cleared on unmount
  // (avoids a setState on an unmounted component).
  const pendingTimeoutsRef = useRef<Set<number>>(new Set());

  const scheduleTimeout = useCallback((fn: () => void, ms: number) => {
    const pending = pendingTimeoutsRef.current;
    let id = 0;
    id = window.setTimeout(() => {
      pending.delete(id);
      fn();
    }, ms);
    pending.add(id);
  }, []);

  useEffect(() => {
    const pending = pendingTimeoutsRef.current;
    const phraseTimerRef = phraseSuggestionTimerRef;
    return () => {
      for (const id of pending) window.clearTimeout(id);
      pending.clear();
      if (phraseTimerRef.current !== null) window.clearTimeout(phraseTimerRef.current);
    };
  }, []);
  const deferredQuery = useDeferredValue(query);

  const inputValue = previewValue ?? query;
  const workspaceVisible = results.length > 0;
  const workspaceActive = workspaceVisible;
  const isExactPhrase = searchMode === "exact" && isPhraseInputValue(inputValue);
  const searchPrefix = inputValue.trim() && searchModeInitialized ? (searchMode === "root" ? "جذر" : isExactPhrase ? "عبارة" : "كلمة") : "";
  const modeToggleLabel = searchMode === "root" ? "كلمة" : "جذر";
  const chaklButtonVisible = searchModeInitialized && searchMode === "exact" && query.trim().length > 0;
  const modeControlsVisible = searchModeInitialized && query.trim().length > 0;

  const selectedMushafLabel = useMemo(() => {
    return mushafs.find((item) => item.id === selectedMushaf)?.name ?? "الرواية";
  }, [mushafs, selectedMushaf]);

  const resultsSummary = useMemo(() => {
    if (results.length === 0) {
      return null;
    }

    return {
      cards: results.length,
      totalOccurrences: results.reduce((sum, result) => sum + result.total_occurrences, 0),
      totalVerses: results.reduce((sum, result) => sum + result.total_verses, 0),
    };
  }, [results]);

  const insightSummary = useMemo(() => {
    if (!resultsSummary || results.length === 0) {
      return null;
    }

    const activeQuery = searchContext?.q ?? query;
    const firstResult = results[0];
    const termLabel =
      results.length === 1
        ? getResultLabelText(firstResult)
        : searchContext?.mode === "root"
          ? "الجذر"
          : isPhraseInputValue(activeQuery)
            ? "العبارة"
            : "المصطلح";
    const term = results.length === 1 ? firstResult.root : activeQuery;

    return {
      termLabel,
      term,
      totalOccurrences: resultsSummary.totalOccurrences,
      totalVerses: resultsSummary.totalVerses,
    };
  }, [query, results, resultsSummary, searchContext]);

  async function resolveLatinTokenToArabic(token: string, mode: SearchMode = "exact") {
    if (!token.trim()) {
      return "";
    }

    if (!isLatinQuery(token)) {
      return token.trim();
    }

    const suggestionItems = dedupeSuggestionItems(
      await api.getSuggestions(token.trim(), mode, selectedMushaf, suggestionsWithChakl),
    );
    const bestSuggestion = pickBestSuggestionForMode(suggestionItems, mode);
    if (bestSuggestion) {
      return bestSuggestion.text;
    }

    return generateArabicQueryCandidates(token.trim(), 1)[0] ?? token.trim();
  }

  async function resolveLatinPhraseQuery(queryText: string) {
    const tokens = queryText
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (tokens.length === 0) {
      return "";
    }

    const resolvedTokens: string[] = [];
    for (const token of tokens) {
      resolvedTokens.push(await resolveLatinTokenToArabic(token, "exact"));
    }

    return resolvedTokens.join(" ").trim();
  }

  async function buildPhraseSuggestionItems(
    trimmedPhraseQuery: string,
    options: { sourceCandidates?: string[]; withChakl?: boolean } = {},
  ) {
    const suggestionContext = getSuggestionContext(trimmedPhraseQuery);
    const resolvedPrefix = isLatinQuery(suggestionContext.prefixQuery)
      ? await resolveLatinPhraseQuery(suggestionContext.prefixQuery)
      : suggestionContext.prefixQuery.trim();
    const withChakl = options.withChakl ?? suggestionsWithChakl;

    if (!isLatinQuery(trimmedPhraseQuery)) {
      return api.getSuggestions(trimmedPhraseQuery, "exact", selectedMushaf, withChakl);
    }

    const sourceQuery = suggestionContext.sourceQuery.trim();
    if (!resolvedPrefix || !sourceQuery) {
      return [];
    }

    const candidateTexts: string[] = [...(options.sourceCandidates ?? [])];
    candidateTexts.push(...generateArabicQueryCandidates(sourceQuery, 8));

    const uniqueCandidates = Array.from(
      new Set(candidateTexts.map(normalizeSuggestionCandidate).filter(Boolean)),
    ).slice(0, 8);

    const phraseQueries = uniqueCandidates.map((candidate) => `${resolvedPrefix} ${candidate}`);
    const phraseItems = phraseQueries.length > 0
      ? await api.getSuggestionsBatch(phraseQueries, "exact", selectedMushaf, withChakl)
      : [];

    return dedupeSuggestionItems(phraseItems);
  }

  function clearPhraseSuggestionTimer() {
    if (phraseSuggestionTimerRef.current !== null) {
      window.clearTimeout(phraseSuggestionTimerRef.current);
      phraseSuggestionTimerRef.current = null;
    }
  }

  function schedulePhraseSuggestions(nextValue: string, nextMode: SearchMode) {
    clearPhraseSuggestionTimer();

    const trimmedPhraseQuery = nextValue.trim();
    const effectiveMode = isPhraseInputValue(trimmedPhraseQuery) ? "exact" : nextMode;
    if (!isInputFocused || effectiveMode !== "exact" || !isPhraseInputValue(trimmedPhraseQuery) || trimmedPhraseQuery.length < 3) {
      return;
    }

    phraseSuggestionTimerRef.current = window.setTimeout(async () => {
      try {
        const uniqueItems = dedupeSuggestionItems(await buildPhraseSuggestionItems(trimmedPhraseQuery));
        setSuggestions(uniqueItems.slice(0, MAX_SUGGESTIONS));
        setSuggestionsOpen(uniqueItems.length > 0);
        setActiveSuggestionIndex(-1);
      } catch {
        setSuggestions([]);
        setSuggestionsOpen(false);
      }
    }, SUGGESTION_DEBOUNCE_MS);
  }

  function commitInputValue(nextValue: string, nextMode = searchMode) {
    setPreviewValue(null);
    setQuery(nextValue);
    setActiveSuggestionIndex(-1);
    if (!nextValue.trim()) {
      setSearchModeInitialized(false);
      setSearchMode("exact");
      setSuggestionsWithChakl(false);
    }
    schedulePhraseSuggestions(nextValue, nextMode);
  }

  function clearWorkspaceState() {
    setResults([]);
    mushaf.reset();
    setResultPageDrafts({});
    setSelectedVerseKey(null);
    setSearchContext(null);
  }

  // Mirror the resolved query + mode into the URL so the page can be shared.
  // history-preserving replace (no extra Back entries) and Next keeps the
  // params in its own state so a later mode switch doesn't drop them.
  function reflectSearchUrl(reflectedQuery: string, reflectedMode: SearchMode) {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    sp.set("mode", "search");
    sp.set("q", reflectedQuery);
    sp.set("sm", reflectedMode);
    router.replace(`/?${sp.toString()}`, { scroll: false });
  }

  useEffect(() => {
    const storedMushaf = Number(window.localStorage.getItem("selectedMushaf") || "1");
    if (Number.isFinite(storedMushaf) && storedMushaf > 0) {
      setSelectedMushaf(storedMushaf);
    }
  }, []);

  // Adopt the account theme as the default when this device has no explicit
  // override and the user hasn't toggled this session. Keeps the backend
  // `theme` preference live across devices instead of being dead state.
  useEffect(() => {
    if (userSetThemeRef.current) return;
    let hasOverride = false;
    try {
      hasOverride = window.localStorage.getItem("theme") !== null;
    } catch {
      hasOverride = false;
    }
    if (!hasOverride && (account.theme === "light" || account.theme === "dark")) {
      setTheme(account.theme);
    }
  }, [account.theme]);

  // Apply the theme to <body> (the pre-paint script sets it initially; this
  // keeps it in sync as the user toggles). Lives here so it runs regardless
  // of which chrome surfaces the theme control.
  useEffect(() => {
    const isLight = theme === "light";
    document.body.classList.toggle("light", isLight);
    document.body.classList.toggle("light-mode", isLight);
  }, [theme]);

  // Hydrate a search from ?q=&sm= once on first load (shared/bookmarked link).
  useEffect(() => {
    if (urlHydratedRef.current) return;
    urlHydratedRef.current = true;
    const urlQuery = searchParams.get("q");
    if (!urlQuery || !urlQuery.trim()) return;
    const urlMode: SearchMode = searchParams.get("sm") === "root" ? "root" : "exact";
    setQuery(urlQuery);
    setSearchMode(urlMode);
    setSearchModeInitialized(true);
    void runSearch(urlQuery, urlMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleGlobalKeyDown(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget) {
        event.preventDefault();
        inputRef.current?.focus();
        return;
      }

      if (event.key === "Escape") {
        if (drawerOpen) {
          setDrawerOpen(false);
          return;
        }

        if (suggestionsOpen) {
          setSuggestionsOpen(false);
          setPreviewValue(null);
          setActiveSuggestionIndex(-1);
          return;
        }

        if (document.activeElement === inputRef.current) {
          inputRef.current?.blur();
        }
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [drawerOpen, suggestionsOpen]);

  useEffect(() => {
    return () => {
      clearPhraseSuggestionTimer();
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("search-active", workspaceVisible);
    document.body.classList.toggle("search-loading", isSearching);
  }, [workspaceVisible, isSearching]);

  useEffect(() => {
    if (previousMushafRef.current !== selectedMushaf && searchContext && searchContext.mushaf !== selectedMushaf) {
      void runSearch(searchContext.q, searchContext.mode);
    }
    previousMushafRef.current = selectedMushaf;
  }, [selectedMushaf, searchContext]);

  useEffect(() => {
    let cancelled = false;

    async function loadMushafs() {
      try {
        const items = await api.getMushafs();
        if (cancelled) return;
        setMushafs(items);
        setSelectedMushaf((current) => {
          const next = items.some((item) => item.id === current) ? current : items[0]?.id ?? 1;
          window.localStorage.setItem("selectedMushaf", String(next));
          return next;
        });
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(toUserError("search:riwayat", error, "تعذر تحميل الروايات."));
        }
      } finally {
        if (!cancelled) {
          setLoadingMushafs(false);
        }
      }
    }

    void loadMushafs();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem("selectedMushaf", String(selectedMushaf));
  }, [selectedMushaf]);

  useEffect(() => {
    if (searchMode === "root" && isPhraseInputValue(query)) {
      setSearchMode("exact");
    }
  }, [query, searchMode]);

  useEffect(() => {
    if (searchMode !== "exact") {
      setSuggestionsWithChakl(false);
    }
  }, [searchMode]);

  useEffect(() => {
    let cancelled = false;

    const trimmedPhraseQuery = query.trim();
    if ((searchModeInitialized && searchMode !== "exact") || !isPhraseInputValue(trimmedPhraseQuery)) {
      return;
    }

    if (trimmedPhraseQuery.length < 3 || !isInputFocused) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      setActiveSuggestionIndex(-1);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const uniqueItems = dedupeSuggestionItems(await buildPhraseSuggestionItems(trimmedPhraseQuery));
        if (cancelled) return;
        setSuggestions(uniqueItems.slice(0, MAX_SUGGESTIONS));
        setSuggestionsOpen(uniqueItems.length > 0);
        setActiveSuggestionIndex(-1);
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setSuggestionsOpen(false);
        }
      }
    }, SUGGESTION_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [api, isInputFocused, query, searchMode, searchModeInitialized, selectedMushaf, suggestionsWithChakl]);

  useEffect(() => {
    let cancelled = false;

    const trimmedQuery = deferredQuery.trim();
    if (trimmedQuery.length < 2) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      setActiveSuggestionIndex(-1);
      return;
    }

    if ((!searchModeInitialized || searchMode === "exact") && isPhraseInputValue(trimmedQuery)) {
      return;
    }

    if (!isInputFocused) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const items = isLatinQuery(trimmedQuery)
          ? await api.getSuggestionsBatch(
              generateArabicQueryCandidates(trimmedQuery, 5),
              searchModeInitialized ? searchMode : "root",
              selectedMushaf,
              suggestionsWithChakl,
            )
          : await api.getSuggestions(
              trimmedQuery,
              searchModeInitialized ? searchMode : "root",
              selectedMushaf,
              suggestionsWithChakl,
            );
        if (cancelled) return;
        const uniqueItems = dedupeSuggestionItems(items);
        setSuggestions(uniqueItems.slice(0, MAX_SUGGESTIONS));
        setSuggestionsOpen(uniqueItems.length > 0);
        setActiveSuggestionIndex(-1);
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setSuggestionsOpen(false);
        }
      }
    }, SUGGESTION_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [deferredQuery, isInputFocused, searchMode, searchModeInitialized, selectedMushaf, suggestionsWithChakl]);

  useEffect(() => {
    async function handleYamliSuggestions(event: Event) {
      const customEvent = event as CustomEvent<{ targetId?: string; suggestions?: string[] }>;
      const detail = customEvent.detail;
      if (!detail?.suggestions?.length || detail.targetId !== "searchInput") {
        return;
      }

      const activeQuery = query.trim();
      if (!isInputFocused || !activeQuery || !isLatinQuery(activeQuery)) {
        return;
      }

      const requestId = ++yamliRequestIdRef.current;
      const suggestionContext = getSuggestionContext(activeQuery);
      const candidates = detail.suggestions.slice(0, 5);

      try {
        if (suggestionContext.prefixQuery) {
          const phraseItems = dedupeSuggestionItems(
            await buildPhraseSuggestionItems(activeQuery, { sourceCandidates: candidates }),
          );
          if (requestId !== yamliRequestIdRef.current) {
            return;
          }

          setSuggestions(phraseItems.slice(0, MAX_SUGGESTIONS));
          setSuggestionsOpen(phraseItems.length > 0);
          setActiveSuggestionIndex(-1);
          return;
        }

        const items = await api.getSuggestionsBatch(
          candidates,
          searchModeInitialized ? searchMode : "root",
          selectedMushaf,
          suggestionsWithChakl,
        );
        if (requestId !== yamliRequestIdRef.current) {
          return;
        }

        const uniqueItems = dedupeSuggestionItems(items);
        setSuggestions(uniqueItems.slice(0, MAX_SUGGESTIONS));
        setSuggestionsOpen(uniqueItems.length > 0);
        setActiveSuggestionIndex(-1);
      } catch {
        if (requestId === yamliRequestIdRef.current) {
          setSuggestions([]);
          setSuggestionsOpen(false);
        }
      }
    }

    window.addEventListener("qbasair:yamli-suggestions", handleYamliSuggestions as EventListener);
    return () => {
      window.removeEventListener("qbasair:yamli-suggestions", handleYamliSuggestions as EventListener);
    };
  }, [api, isInputFocused, previewValue, query, searchMode, searchModeInitialized, selectedMushaf, suggestionsWithChakl]);

  useEffect(() => {
    setResultPageDrafts(
      Object.fromEntries(results.map((result) => [result.result_key, String(result.page)])),
    );
  }, [results]);

  useEffect(() => {
    if (!suggestionsOpen && previewValue !== null) {
      setPreviewValue(null);
      setActiveSuggestionIndex(-1);
    }
  }, [suggestionsOpen, previewValue]);

  useEffect(() => {
    if (!suggestionsOpen || activeSuggestionIndex < 0) {
      return;
    }

    const selectedSuggestion = suggestionsRef.current?.querySelector<HTMLElement>(".suggestion-item.selected");
    selectedSuggestion?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeSuggestionIndex, suggestionsOpen]);

  useEffect(() => {
    const inputNode = inputRef.current;
    if (!inputNode) {
      return;
    }

    const nextValue = inputValue;
    if (inputNode.value !== nextValue) {
      inputNode.value = nextValue;
    }
  }, [inputValue, inputRef]);

  useEffect(() => {
    if (!isInputFocused) {
      return;
    }

    const timer = window.setInterval(() => {
      const domValue = inputRef.current?.value ?? "";
      const stateValue = previewValue ?? query;

      if (domValue !== stateValue) {
        commitInputValue(domValue);
      }
    }, 120);

    return () => {
      window.clearInterval(timer);
    };
  }, [isInputFocused, previewValue, query]);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as Node | null;
      if (suggestionsRef.current && target && !suggestionsRef.current.contains(target) && inputRef.current && !inputRef.current.contains(target)) {
        setSuggestionsOpen(false);
      }
      if (toolsDrawerRef.current && target && !toolsDrawerRef.current.contains(target)) {
        const toggle = document.querySelector(".tools-drawer-toggle");
        if (!toggle || !toggle.contains(target)) {
          setDrawerOpen(false);
        }
      }
    }

    document.addEventListener("click", handleDocumentClick);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
    };
  }, []);

  async function runSearch(nextQuery = query, nextMode?: SearchMode) {
    let trimmedQuery = nextQuery.trim();
    if (!trimmedQuery) return;
    const requestedMode = nextMode ?? (searchModeInitialized ? searchMode : "exact");
    const requestId = ++runSearchIdRef.current;

    setIsInputFocused(false);
    setPreviewValue(null);
    setActiveSuggestionIndex(-1);
    setSuggestionsOpen(false);
    setErrorMessage(null);
    setDidYouMean(null);
    setIsSearching(true);
    setDrawerOpen(false);
    inputRef.current?.blur();

    try {
      let effectiveMode = requestedMode;
      let effectiveQuery = trimmedQuery;

      if (isLatinQuery(trimmedQuery)) {
        if (isPhraseInputValue(trimmedQuery)) {
          const resolvedPhrase = await resolveLatinPhraseQuery(trimmedQuery);
          if (resolvedPhrase) {
            effectiveQuery = resolvedPhrase;
            effectiveMode = "exact";
          } else {
            const latinCandidates = generateArabicQueryCandidates(trimmedQuery, 8);
            if (latinCandidates.length > 0) {
              effectiveQuery = latinCandidates[0] ?? trimmedQuery;
              effectiveMode = "exact";
            }
          }
        } else {
          const latinSuggestionItems = dedupeSuggestionItems(
            await api.getSuggestions(trimmedQuery, requestedMode, selectedMushaf, suggestionsWithChakl),
          );
          const resolvedSuggestion = pickBestSuggestionForMode(latinSuggestionItems, requestedMode);

          if (resolvedSuggestion) {
            effectiveQuery = resolvedSuggestion.text;
            effectiveMode = resolvedSuggestion.type === "root" ? "root" : "exact";
            setSuggestions(latinSuggestionItems.slice(0, MAX_SUGGESTIONS));
          }
        }
      }

      if (effectiveQuery !== trimmedQuery || effectiveMode !== requestedMode) {
        setQuery(effectiveQuery);
        trimmedQuery = effectiveQuery;
      }
      setSearchMode(effectiveMode);
      setSearchModeInitialized(true);

      const response = await api.searchV2(effectiveQuery, effectiveMode, selectedMushaf, ITEMS_PER_PAGE);
      // Drop a stale response — a newer search has superseded this one.
      if (requestId !== runSearchIdRef.current) return;
      if (!response.found) {
        startTransition(() => {
          clearWorkspaceState();
          setErrorMessage(sanitizeErrorMessage(response.message ?? "لم يتم العثور على نتائج."));
          setDidYouMean(response.did_you_mean ?? null);
        });
        return;
      }

      startTransition(() => {
        setResults(response.results);
        setSearchContext({ q: effectiveQuery, mode: effectiveMode, mushaf: selectedMushaf });
      });
      reflectSearchUrl(effectiveQuery, effectiveMode);

      const firstResult = response.results.find((result) => result.verses.length > 0);
      const firstVerse = firstResult?.verses[0];
      if (firstResult && firstVerse) {
        await selectVerse(firstVerse, firstResult.result_key);
      }
    } catch (error) {
      if (requestId !== runSearchIdRef.current) return;
      clearWorkspaceState();
      setErrorMessage(toUserError("search:run", error, "حدث خطأ في الاتصال بالخادم."));
    } finally {
      // Only the latest search controls the spinner; a stale one finishing must
      // not clear it while a newer search is still in flight.
      if (requestId === runSearchIdRef.current) setIsSearching(false);
    }
  }

  async function selectVerse(verse: SearchVerse, resultKey: string) {
    const selectionKey = getVerseSelectionKey(resultKey, verse);
    setSelectedVerseKey(selectionKey);
    await mushaf.loadByAyah(
      verse.mushaf_id || selectedMushaf,
      verse.ayah_id,
      Array.isArray(verse.highlights) ? verse.highlights : [],
    );
  }

  async function loadResultPage(resultKey: string, requestedPage: number) {
    if (!searchContext) return;
    const currentResult = results.find((result) => result.result_key === resultKey);
    if (!currentResult) return;

    const nextPage = clampPage(requestedPage, currentResult.total_pages);
    setResultPageDrafts((current) => ({ ...current, [resultKey]: String(nextPage) }));
    if (nextPage === currentResult.page) return;

    try {
      const pageData = await api.getSearchResultPage(
        searchContext.q,
        searchContext.mode,
        searchContext.mushaf,
        resultKey,
        nextPage,
        ITEMS_PER_PAGE,
      );

      startTransition(() => {
        setResults((current) => current.map((result) => (result.result_key === resultKey ? pageData.result : result)));
      });

      window.requestAnimationFrame(() => {
        const card = resultsAreaRef.current?.querySelector<HTMLElement>(`[data-result-key="${resultKey}"]`);
        if (card && resultsAreaRef.current) {
          const offsetTop = card.offsetTop - resultsAreaRef.current.offsetTop;
          resultsAreaRef.current.scrollTo({ top: Math.max(offsetTop, 0), behavior: "smooth" });
        }
      });
    } catch (error) {
      setErrorMessage(toUserError("search:page", error, "حدث خطأ في جلب الصفحة المطلوبة."));
    }
  }

  async function toggleSearchMode() {
    const trimmedQuery = query.trim();

    if (searchMode === "root") {
      setSearchMode("exact");
      setSearchModeInitialized(true);
      setSuggestionsWithChakl(false);
      setSuggestions([]);
      setSuggestionsOpen(false);
      setActiveSuggestionIndex(-1);
      if (workspaceVisible && trimmedQuery) {
        void runSearch(trimmedQuery, "exact");
      }
      return;
    }

    if (!trimmedQuery || isPhraseInputValue(trimmedQuery)) {
      return;
    }

    setPreviewValue(null);
    setSearchMode("root");
    setSearchModeInitialized(true);
    setSuggestionsWithChakl(false);
    setSuggestions([]);
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);

    if (workspaceVisible) {
      void runSearch(trimmedQuery, "root");
    }
  }

  async function toggleSuggestionsWithChakl() {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || searchMode !== "exact") {
      return;
    }

    if (hasArabicDiacritics(trimmedQuery)) {
      const plainQuery = removeChakl(trimmedQuery);
      commitInputValue(plainQuery, "exact");
      setSearchModeInitialized(true);
      setSuggestionsWithChakl(false);
      setSuggestions([]);
      setSuggestionsOpen(false);
      inputRef.current?.focus();
      return;
    }

    setSuggestionsWithChakl(true);
    setIsInputFocused(true);
    inputRef.current?.focus();

    try {
      const items = isPhraseInputValue(trimmedQuery)
        ? await buildPhraseSuggestionItems(trimmedQuery, { withChakl: true })
        : await api.getSuggestions(trimmedQuery, "exact", selectedMushaf, true);
      const uniqueItems = dedupeSuggestionItems(items);
      setSuggestions(uniqueItems.slice(0, MAX_SUGGESTIONS));
      setSuggestionsOpen(uniqueItems.length > 0);
      setActiveSuggestionIndex(-1);
    } catch {
      setSuggestions([]);
      setSuggestionsOpen(false);
    }
  }

  function resetSearch(options?: { toReading?: boolean }) {
    // `toReading` (the brand/logo) does ONE clean navigation to the reading
    // root — never a second router call racing setMode (that race left the
    // shell stuck mid-navigation). The plain reset stays in Search, cleared.
    const toReading = options?.toReading ?? false;
    const finalizeReset = () => {
      setIsInputFocused(false);
      setQuery("");
      setPreviewValue(null);
      setSearchMode("exact");
      setSearchModeInitialized(false);
      setSuggestions([]);
      setSuggestionsOpen(false);
      setSuggestionsWithChakl(false);
      setActiveSuggestionIndex(-1);
      clearWorkspaceState();
      setErrorMessage(null);
      setDidYouMean(null);
      setDrawerOpen(false);
      setIsWorkspaceCollapsing(false);
      if (typeof window === "undefined") return;
      if (toReading) {
        // Single navigation: clears q/sm AND mode → clean reading view.
        router.replace("/", { scroll: false });
        return;
      }
      inputRef.current?.focus();
      // Drop the shareable search params so the URL doesn't go stale.
      const sp = new URLSearchParams(window.location.search);
      if (sp.has("q") || sp.has("sm")) {
        sp.delete("q");
        sp.delete("sm");
        const next = sp.toString();
        router.replace(next ? `/?${next}` : "/", { scroll: false });
      }
    };

    // Skip the collapse animation when leaving for reading — go immediately so
    // there's no window where another effect can re-derive Search mode.
    if (!toReading && workspaceVisible) {
      setIsWorkspaceCollapsing(true);
      scheduleTimeout(finalizeReset, 240);
      return;
    }

    finalizeReset();
  }

  function applySuggestion(item: SuggestionItem) {
    const nextMode: SearchMode = item.type === "root" ? "root" : "exact";
    setIsInputFocused(false);
    setPreviewValue(null);
    setQuery(item.text);
    setSearchMode(nextMode);
    setSearchModeInitialized(true);
    setSuggestionsOpen(false);
    setSuggestions([]);
    inputRef.current?.blur();
    void runSearch(item.text, nextMode);
  }

  function applyDidYouMean() {
    if (!didYouMean?.text) return;
    setIsInputFocused(false);
    setQuery(didYouMean.text);
    setSearchMode("exact");
    setSearchModeInitialized(true);
    inputRef.current?.blur();
    void runSearch(didYouMean.text, "exact");
  }

  function runQuickExample(example: { query: string; mode: SearchMode }) {
    setPreviewValue(null);
    setQuery(example.query);
    setSearchMode(example.mode);
    setSearchModeInitialized(true);
    setSuggestions([]);
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);
    void runSearch(example.query, example.mode);
  }

  function revertSuggestionPreview() {
    setPreviewValue(null);
    setActiveSuggestionIndex(-1);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!suggestionsOpen || suggestions.length === 0) {
      if (event.key === "Enter") {
        event.preventDefault();
        void runSearch();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestionIndex((current) => {
        const nextIndex = current < suggestions.length - 1 ? current + 1 : 0;
        setPreviewValue(suggestions[nextIndex]?.text ?? null);
        return nextIndex;
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestionIndex((current) => {
        const nextIndex = current > 0 ? current - 1 : suggestions.length - 1;
        setPreviewValue(suggestions[nextIndex]?.text ?? null);
        return nextIndex;
      });
      return;
    }

    if (event.key === "Escape") {
      revertSuggestionPreview();
      setSuggestionsOpen(false);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (activeSuggestionIndex >= 0) {
        // B4: highlighted suggestion → apply it.
        const item = suggestions[activeSuggestionIndex];
        if (item) applySuggestion(item);
      } else {
        // B4: no suggestion highlighted → apply the first one.
        const first = suggestions[0];
        if (first) applySuggestion(first);
        else void runSearch();
      }
    }
  }

  return {
    refs: {
      resultsAreaRef,
      inputRef,
      suggestionsRef,
      toolsDrawerRef,
    },
    state: {
      theme,
      query,
      inputValue,
      searchMode,
      searchModeInitialized,
      drawerOpen,
      loadingMushafs,
      mushafs,
      selectedMushaf,
      selectedMushafLabel,
      suggestions,
      suggestionsOpen,
      suggestionsWithChakl,
      activeSuggestionIndex,
      isSearching,
      isWorkspaceCollapsing,
      errorMessage,
      didYouMean,
      workspaceVisible,
      workspaceActive,
      results,
      resultPageDrafts,
      selectedVerseKey,
      searchPrefix,
      modeToggleLabel,
      chaklButtonVisible,
      modeControlsVisible,
      resultsSummary,
      insightSummary,
      quickExamples: QUICK_EXAMPLES,
    },
    actions: {
      setQuery(value: string) {
        commitInputValue(value);
      },
      setDrawerOpen,
      setSelectedMushaf,
      setResultPageDraft(resultKey: string, value: string) {
        setResultPageDrafts((current) => ({ ...current, [resultKey]: value }));
      },
      toggleTheme() {
        userSetThemeRef.current = true;
        setTheme((current) => {
          const next: ThemeMode = current === "dark" ? "light" : "dark";
          try {
            window.localStorage.setItem("theme", next);
          } catch {
            /* private mode — theme just won't persist on this device */
          }
          // Mirror to the account default so the choice follows the user
          // across devices; a failed write must not break the toggle.
          void updateAccount({ theme: next }).catch(() => {});
          return next;
        });
      },
      runSearch,
      selectVerse,
      loadResultPage,
      resetSearch,
      applySuggestion,
      applyDidYouMean,
      runQuickExample,
      revertSuggestionPreview,
      handleInputKeyDown,
      openSuggestions() {
        setIsInputFocused(true);
        if (suggestions.length > 0) {
          setSuggestionsOpen(true);
        }
      },
      closeSuggestions() {
        setIsInputFocused(false);
        scheduleTimeout(() => setSuggestionsOpen(false), 120);
      },
      previewSuggestion(index: number) {
        setActiveSuggestionIndex(index);
      },
      toggleSearchMode,
      toggleSuggestionsWithChakl,
    },
    helpers: {
      getSuggestionTypeLabel,
      hasArabicDiacritics,
      isPhraseInputValue,
    },
  };
}
