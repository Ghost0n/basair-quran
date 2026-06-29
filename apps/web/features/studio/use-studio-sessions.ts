"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type {
  ResearchAgentMessage,
  ResearchAgentResponse,
  TafssirDepth,
} from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";
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
function createSession(): StudioSession {
  sessionCounter += 1;
  return {
    id: `studio-${Date.now()}-${sessionCounter}`,
    title: "جلسة جديدة",
    messages: [],
    mode: "strict",
    depth: "balanced",
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
  const [sessions, setSessions] = useState<StudioSession[]>(() => [createSession()]);
  const [activeId, setActiveId] = useState<string>(() => sessions[0]?.id ?? "");
  const [isResearching, setIsResearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    const session = createSession();
    setSessions((current) => [...current, session]);
    setActiveId(session.id);
  }, []);

  const closeSession = useCallback(
    (id: string) => {
      setSessions((current) => {
        const remaining = current.filter((session) => session.id !== id);
        const next = remaining.length > 0 ? remaining : [createSession()];
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

  const submit = useCallback(
    async (content: string, mushaf: number) => {
      const trimmed = content.trim();
      if (!trimmed || !active || isResearching) return;

      const priorMessages = active.messages;
      const userMessage: StudioMessage = { role: "user", content: trimmed };
      const titleFromFirst = priorMessages.length === 0 ? trimmed.slice(0, 48) : active.title;

      patchSession(active.id, {
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
            response_mode: active.mode,
            tafssir_depth: active.mode === "tafssir" ? active.depth : undefined,
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
            session.id === active.id ? { ...session, messages: nextMessages } : session,
          ),
        );
        // Persist the session to the user-data store (Phase 5 — Companions).
        try {
          await api.saveSession({
            id: active.id,
            title: titleFromFirst,
            mode: active.mode,
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
    [active, isResearching, clientSettings, patchSession],
  );

  return {
    sessions,
    active,
    activeId,
    isResearching,
    error,
    clientSettings,
    setClientSettings,
    setActiveId,
    newSession,
    closeSession,
    setMode,
    setDepth,
    submit,
  };
}
