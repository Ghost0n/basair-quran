"use client";

import { useCallback, useEffect, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { FollowedRoot, NotebookItem, ResearchSessionSummary } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

/** Relative age in Arabic from a unix-seconds timestamp. */
export function relativeAge(unixSeconds: number): string {
  const deltaSeconds = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (deltaSeconds < 60) return "الآن";
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "أمس" : `منذ ${days} يوماً`;
}

/**
 * Loads the user-data companions (notebook, sessions, roots) and exposes
 * the mutations the companion screens need. Each screen mounts its own
 * instance; the lists are small so refetching on mount is cheap.
 */
export function useCompanions() {
  const [notebook, setNotebook] = useState<NotebookItem[]>([]);
  const [sessions, setSessions] = useState<ResearchSessionSummary[]>([]);
  const [roots, setRoots] = useState<FollowedRoot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [notebookItems, sessionList, rootList] = await Promise.all([
        api.getNotebook(),
        api.getSessions(),
        api.getRoots(),
      ]);
      setNotebook(notebookItems);
      setSessions(sessionList);
      setRoots(rootList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تحميل بيانات الدفتر.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const deleteNotebookItem = useCallback(async (itemId: number) => {
    await api.deleteNotebookItem(itemId);
    setNotebook((current) => current.filter((item) => item.id !== itemId));
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    await api.deleteSession(sessionId);
    setSessions((current) => current.filter((session) => session.id !== sessionId));
  }, []);

  const unfollowRoot = useCallback(async (rootId: number) => {
    await api.unfollowRoot(rootId);
    setRoots((current) => current.filter((root) => root.id !== rootId));
  }, []);

  return {
    notebook,
    sessions,
    roots,
    loading,
    error,
    refresh,
    deleteNotebookItem,
    deleteSession,
    unfollowRoot,
  };
}
