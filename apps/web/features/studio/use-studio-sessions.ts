"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type {
  ResearchAgentMessage,
  ResearchAgentResponse,
  ResearchFocusAyah,
  StoredMessage,
} from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";
import { isTechnicalMessage, reportError } from "@/lib/error-report";
import { aiHeaders } from "@/lib/ai-connection";

import { t } from "@/lib/i18n";

import { dropExtraBlanks, NEW_SESSION_PREFIX, placeNewSession, putSession } from "./session-reuse";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

/**
 * Study answers from the Quran alone. "tafssir" only labels sessions saved when
 * the experimental explanatory reading existed: they reopen and display as
 * they were, and every new turn in them is answered from the Quran alone.
 */
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
  /** The ayah this session is about (from the reader's tafssir tool), sent with every turn. */
  focus?: ResearchFocusAyah | null;
  focusLabel?: string;
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
function createSession(defaults?: {
  focus?: ResearchFocusAyah | null;
  focusLabel?: string;
}): StudioSession {
  sessionCounter += 1;
  return {
    id: `${NEW_SESSION_PREFIX}${Date.now()}-${sessionCounter}`,
    title: t("جلسة جديدة"),
    messages: [],
    mode: "strict",
    focus: defaults?.focus ?? null,
    focusLabel: defaults?.focusLabel,
  };
}

function assistantText(response: ResearchAgentResponse): string {
  if (response.status === "needs_clarification") {
    return response.clarifying_question ?? t("ما الزاوية التي تريد التركيز عليها في السؤال؟");
  }
  if (response.mode === "tafssir" && response.tafssir?.summary) {
    return response.tafssir.summary;
  }
  return response.answer ?? t("لم تصلني صياغة جواب من الخدمة.");
}

/**
 * Multi-session research state for the Studio panel.
 *
 * Phase 4: sessions live in memory (client-side tabs). Phase 5 (Companions)
 * will persist them to the backend via /api/sessions.
 */
export function useStudioSessions() {
  const [sessions, setSessions] = useState<StudioSession[]>(() => [
    createSession(),
  ]);
  const [activeId, setActiveId] = useState<string>(() => sessions[0]?.id ?? "");
  const [isResearching, setIsResearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydratedRef = useRef(false);

  // Restore the open tabs once, after mount (keeps SSR output deterministic).
  useEffect(() => {
    const persisted = loadPersistedSessions();
    if (persisted) {
      // Tabs saved before the one-blank-session rule may hold several blank ones.
      const restored = dropExtraBlanks(persisted.sessions, persisted.activeId);
      setSessions(restored);
      const validActive = restored.some((session) => session.id === persisted.activeId);
      setActiveId(validActive ? persisted.activeId : restored[0]?.id ?? "");
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

  // The latest tabs, for the actions that place a new session synchronously.
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  // A new session never doubles a blank one: that one is reused (session-reuse.ts).
  const placeSession = useCallback((fresh: StudioSession): StudioSession => {
    const placed = placeNewSession(sessionsRef.current, fresh, activeIdRef.current);
    sessionsRef.current = placed.sessions;
    activeIdRef.current = placed.session.id;
    // Applied to the tabs as they are when React runs it, never a stale copy.
    setSessions((current) => putSession(current, placed.session));
    setActiveId(placed.session.id);
    return placed.session;
  }, []);

  const active = useMemo(
    () => sessions.find((session) => session.id === activeId) ?? sessions[0],
    [sessions, activeId],
  );

  const patchSession = useCallback((id: string, patch: Partial<StudioSession>) => {
    setSessions((current) => current.map((session) => (session.id === id ? { ...session, ...patch } : session)));
  }, []);

  const newSession = useCallback(() => {
    placeSession(createSession());
  }, [placeSession]);

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

  const submitInto = useCallback(
    /** Resolves `true` once answered; `false` when nothing was asked or the ask failed. */
    async (target: StudioSession, content: string, mushaf: number): Promise<boolean> => {
      const trimmed = content.trim();
      if (!trimmed || isResearching) return false;

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
            // Every turn is answered from the Quran alone, in a saved
            // explanatory-reading session too.
            response_mode: "strict",
            focus: target.focus ?? undefined,
          },
          // The AI chosen in Settings (lib/ai-connection.ts); none: the server's own.
          { headers: aiHeaders() },
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
        // Persist the session to the user-data store (Phase 5 — Companions);
        // a guest's on the web stays in their browser (lib/guest-data.ts).
        try {
          await api.saveSession({
            id: target.id,
            title: titleFromFirst,
            mode: target.mode,
            // Persist the assistant's research response too, so restoring a saved
            // session rebuilds its evidence cards (bounded by the server's
            // per-session storage caps).
            messages: nextMessages.map((m): StoredMessage => ({
              v: 1,
              role: m.role,
              content: m.content,
              response: m.role === "assistant" ? m.response : undefined,
            })),
          });
        } catch {
          // A failed save must not break the chat — the session stays in memory.
        }
        return true;
      } catch (err) {
        reportError("studio:submit", err);
        const raw = err instanceof Error ? err.message : "";
        setError(isTechnicalMessage(raw) ? t("تعذّر الاتصال بخدمة الباحث الذكي.") : raw);
        // The question got no answer: it leaves the thread (the panel puts it
        // back in the field), so asking it again doesn't show it twice.
        patchSession(target.id, { messages: priorMessages, title: target.title });
        return false;
      } finally {
        setIsResearching(false);
      }
    },
    [isResearching, patchSession],
  );

  const submit = useCallback(
    (content: string, mushaf: number) => {
      if (!active) return Promise.resolve(false);
      return submitInto(active, content, mushaf);
    },
    [active, submitInto],
  );

  // A hand-off ask (command bar / Home) opens its own fresh session so it can't
  // inherit an existing thread's mode or context (a blank one is reused, reset). `submitInto` updates by id, so
  // submitting before the state flush is safe.
  const askInNewSession = useCallback(
    async (
      content: string,
      mushaf: number,
      options: { focus?: ResearchFocusAyah | null; focusLabel?: string } = {},
    ) => {
      const session = placeSession(
        createSession({
          focus: options.focus ?? null,
          focusLabel: options.focusLabel,
        }),
      );
      return submitInto(session, content, mushaf);
    },
    [submitInto, placeSession],
  );

  // Re-open a saved session (from Home / the history list) as a live tab: fetch
  // the stored thread and hydrate it. If the tab is already open, just activate.
  // Assistant messages restore their persisted `response`, so evidence cards
  // rebuild; legacy rows (role+content only) restore as plain text.
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
            response: m.role === "assistant" ? m.response : undefined,
          }))
          .filter((m) => m.content);
        const session: StudioSession = {
          id: detail.id,
          title: detail.title,
          messages,
          mode: detail.mode,
        };
        setSessions((current) =>
          current.some((s) => s.id === id) ? current : [...current, session],
        );
        setActiveId(id);
      } catch {
        setError(t("تعذّر فتح الجلسة المحفوظة."));
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
    setActiveId,
    newSession,
    closeSession,
    submit,
    askInNewSession,
    openSavedSession,
  };
}
