"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { FollowedRoot, NotebookItem, ResearchSessionSummary } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";
import { emitNotebookChange, useNotebookSync } from "@/lib/notebook-sync";

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
  // Mirror of the list so deletes can report the removed ayah_id in their event.
  const notebookRef = useRef<NotebookItem[]>([]);
  notebookRef.current = notebook;

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

  // Reflect notebook changes made elsewhere (e.g. saving an ayah from the reader
  // beside this list) live, without a remount or refetch.
  useNotebookSync((change) => {
    if (change.kind === "added") {
      setNotebook((current) =>
        current.some((item) => item.id === change.item.id) ? current : [change.item, ...current],
      );
    } else {
      setNotebook((current) => current.filter((item) => item.id !== change.itemId));
    }
  });

  const deleteNotebookItem = useCallback(async (itemId: number) => {
    const ayahId = notebookRef.current.find((item) => item.id === itemId)?.ayah_id ?? null;
    await api.deleteNotebookItem(itemId);
    setNotebook((current) => current.filter((item) => item.id !== itemId));
    emitNotebookChange({ kind: "removed", itemId, ayahId });
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
