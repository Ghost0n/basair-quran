"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type {
  ResearchAgentMessage,
  ResearchAgentResponse,
  TafssirDepth,
} from "@q-basair/shared";

import { API_BASE_URL, AUTH_ENABLED } from "@/lib/config";
import { usePreferences } from "@/lib/preferences-context";
import {
  buildResearchHeaders,
  DEFAULT_RESEARCH_SETTINGS,
  loadClientResearchSettings,
  type ClientResearchSettings,
} from "@/features/research/lib/research-client-settings";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

export type StudioMode = "strict" | "tafssir";

export type StudioMessage = {
  role: "user" | "assistant";
  content: string;
  response?: ResearchAgentResponse;
};

export type StudioSession = {
  id: string;
  title: string;
  messages: StudioMessage[];
  mode: StudioMode;
  depth: TafssirDepth;
};

// Open Studio tabs survive a reload within the same browser tab. We use
// sessionStorage (not localStorage) so research drafts don't leak between
// tabs or persist forever — finished sessions live in the backend history.
const SESSIONS_STORAGE_KEY = "qbasair.studio.sessions";

type PersistedStudioState = { sessions: StudioSession[]; activeId: string };

function loadPersistedSessions(): PersistedStudioState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedStudioState;
    if (!Array.isArray(parsed.sessions) || parsed.sessions.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

let sessionCounter = 0;
function createSession(defaults?: { mode?: StudioMode; depth?: TafssirDepth }): StudioSession {
  sessionCounter += 1;
  return {
    id: `studio-${Date.now()}-${sessionCounter}`,
    title: "جلسة جديدة",
    messages: [],
    mode: defaults?.mode ?? "strict",
    depth: defaults?.depth ?? "balanced",
  };
}

function assistantText(response: ResearchAgentResponse): string {
  if (response.status === "needs_clarification") {
    return response.clarifying_question ?? "ما الزاوية التي تريد التركيز عليها في السؤال؟";
  }
  if (response.mode === "tafssir" && response.tafssir?.summary) {
    return response.tafssir.summary;
  }
  return response.answer ?? "لم تصلني صياغة جواب من الخدمة.";
}

/**
 * Multi-session research state for the Studio panel.
 *
 * Phase 4: sessions live in memory (client-side tabs). Phase 5 (Companions)
 * will persist them to the backend via /api/sessions.
 */
export function useStudioSessions() {
  // A new research session inherits the user's saved default mode/depth (written
  // by Settings). The ref keeps the latest values so callbacks created once still
  // read fresh prefs; the initial session is seeded from prefs available at mount.
  const { preferences } = usePreferences();
  const researchDefaultsRef = useRef<{ mode: StudioMode; depth: TafssirDepth }>({
    mode: preferences.research.default_mode,
    depth: preferences.research.depth,
  });
  researchDefaultsRef.current = {
    mode: preferences.research.default_mode,
    depth: preferences.research.depth,
  };

  const [sessions, setSessions] = useState<StudioSession[]>(() => [
    createSession(researchDefaultsRef.current),
  ]);
  const [activeId, setActiveId] = useState<string>(() => sessions[0]?.id ?? "");
  const [isResearching, setIsResearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guests hit a hard gate on the research API; instead of the silent 401→/login
  // redirect, we pre-check and raise this so the panel can show a sign-in modal.
  const [authRequired, setAuthRequired] = useState(false);
  const [clientSettings, setClientSettings] = useState<ClientResearchSettings>(DEFAULT_RESEARCH_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const hydratedRef = useRef(false);

  // Restore the open tabs once, after mount (keeps SSR output deterministic).
  useEffect(() => {
    const persisted = loadPersistedSessions();
    if (persisted) {
      setSessions(persisted.sessions);
      const validActive = persisted.sessions.some((session) => session.id === persisted.activeId);
      setActiveId(validActive ? persisted.activeId : persisted.sessions[0]?.id ?? "");
    }
    hydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on change — but not before the restore pass has run, so the
  // initial default session can't clobber stored tabs.
  useEffect(() => {
    if (!hydratedRef.current || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify({ sessions, activeId }));
    } catch {
      /* sessionStorage unavailable/full — tabs just won't survive reload */
    }
  }, [sessions, activeId]);

  const active = useMemo(
    () => sessions.find((session) => session.id === activeId) ?? sessions[0],
    [sessions, activeId],
  );

  // Lazy-load persisted Ollama client settings once.
  if (!settingsLoaded && typeof window !== "undefined") {
    setClientSettings(loadClientResearchSettings());
    setSettingsLoaded(true);
  }

  const patchSession = useCallback((id: string, patch: Partial<StudioSession>) => {
    setSessions((current) => current.map((session) => (session.id === id ? { ...session, ...patch } : session)));
  }, []);

  const newSession = useCallback(() => {
    const session = createSession(researchDefaultsRef.current);
    setSessions((current) => [...current, session]);
    setActiveId(session.id);
  }, []);

  const closeSession = useCallback(
    (id: string) => {
      setSessions((current) => {
        const remaining = current.filter((session) => session.id !== id);
        const next = remaining.length > 0 ? remaining : [createSession(researchDefaultsRef.current)];
        setActiveId((currentActive) =>
          currentActive === id ? next[next.length - 1]?.id ?? "" : currentActive,
        );
        return next;
      });
    },
    [],
  );

  const setMode = useCallback(
    (mode: StudioMode) => {
      if (active) patchSession(active.id, { mode });
    },
    [active, patchSession],
  );

  const setDepth = useCallback(
    (depth: TafssirDepth) => {
      if (active) patchSession(active.id, { depth });
    },
    [active, patchSession],
  );

  // Studio is auth-gated. Returns true when the caller may proceed; raises the
  // sign-in modal (and returns false) when a guest tries to research.
  const ensureAuth = useCallback(async (): Promise<boolean> => {
    if (!AUTH_ENABLED) return true;
    try {
      const session = await api.getAuthSession({ suppressAuthRedirect: true });
      if (!session.authenticated) {
        setAuthRequired(true);
        return false;
      }
    } catch {
      // Offline / probe failed — let the real call proceed and surface its error.
    }
    return true;
  }, []);

  const submitInto = useCallback(
    async (target: StudioSession, content: string, mushaf: number) => {
      const trimmed = content.trim();
      if (!trimmed || isResearching) return;

      const priorMessages = target.messages;
      const userMessage: StudioMessage = { role: "user", content: trimmed };
      const titleFromFirst = priorMessages.length === 0 ? trimmed.slice(0, 48) : target.title;

      patchSession(target.id, {
        messages: [...priorMessages, userMessage],
        title: titleFromFirst,
      });
      setError(null);
      setIsResearching(true);

      const apiMessages: ResearchAgentMessage[] = [...priorMessages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        const response = await api.researchAgent(
          {
            messages: apiMessages,
            mushaf: Number.isFinite(mushaf) && mushaf > 0 ? Math.trunc(mushaf) : 1,
            max_results: 8,
            answer_language: "auto",
            response_mode: target.mode,
            tafssir_depth: target.mode === "tafssir" ? target.depth : undefined,
          },
          { headers: buildResearchHeaders(clientSettings) },
        );
        const nextMessages: StudioMessage[] = [
          ...priorMessages,
          userMessage,
          { role: "assistant", content: assistantText(response), response },
        ];
        setSessions((current) =>
          current.map((session) =>
            session.id === target.id ? { ...session, messages: nextMessages } : session,
          ),
        );
        // Persist the session to the user-data store (Phase 5 — Companions).
        try {
          await api.saveSession({
            id: target.id,
            title: titleFromFirst,
            mode: target.mode,
            messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          });
        } catch {
          // A failed save must not break the chat — the session stays in memory.
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "تعذّر الاتصال بخدمة الباحث الذكي.");
      } finally {
        setIsResearching(false);
      }
    },
    [isResearching, clientSettings, patchSession],
  );

  const submit = useCallback(
    (content: string, mushaf: number) => {
      if (!active) return Promise.resolve();
      return submitInto(active, content, mushaf);
    },
    [active, submitInto],
  );

  // A hand-off ask (command bar / Home) opens its own fresh session so it can't
  // inherit an existing thread's mode or context. `submitInto` updates by id, so
  // submitting before the state flush is safe.
  const askInNewSession = useCallback(
    async (content: string, mushaf: number) => {
      if (!(await ensureAuth())) return;
      const session = createSession(researchDefaultsRef.current);
      setSessions((current) => [...current, session]);
      setActiveId(session.id);
      return submitInto(session, content, mushaf);
    },
    [submitInto, ensureAuth],
  );

  // Re-open a saved session (from Home / the history list) as a live tab: fetch
  // the stored thread and hydrate it. If the tab is already open, just activate.
  // Stored messages carry role+content only — assistant evidence cards don't
  // survive the round-trip (the store keeps text), which is fine for review;
  // continuing the thread re-grounds through the agent as usual.
  const openSavedSession = useCallback(
    async (id: string) => {
      let alreadyOpen = false;
      setSessions((current) => {
        alreadyOpen = current.some((session) => session.id === id);
        return current;
      });
      if (alreadyOpen) {
        setActiveId(id);
        return;
      }
      try {
        const detail = await api.getSession(id);
        const messages: StudioMessage[] = (detail.messages ?? [])
          .map((m) => ({
            role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: typeof m.content === "string" ? m.content : "",
          }))
          .filter((m) => m.content);
        const session: StudioSession = {
          id: detail.id,
          title: detail.title,
          messages,
          mode: detail.mode,
          depth: "balanced",
        };
        setSessions((current) =>
          current.some((s) => s.id === id) ? current : [...current, session],
        );
        setActiveId(id);
      } catch {
        setError("تعذّر فتح الجلسة المحفوظة.");
      }
    },
    [],
  );

  return {
    sessions,
    active,
    activeId,
    isResearching,
    error,
    authRequired,
    dismissAuthRequired: () => setAuthRequired(false),
    ensureAuth,
    clientSettings,
    setClientSettings,
    setActiveId,
    newSession,
    closeSession,
    setMode,
    setDepth,
    submit,
    askInNewSession,
    openSavedSession,
  };
}
