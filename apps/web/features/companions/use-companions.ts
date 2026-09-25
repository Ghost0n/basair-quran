"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { FollowedRoot, NotebookItem, ResearchDocumentSummary, ResearchSessionSummary } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";
import { toArabicDigits } from "@/lib/numerals";
import { emitNotebookChange, useNotebookSync } from "@/lib/notebook-sync";

import { activeLocale, t } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

/** Relative age in Arabic from a unix-seconds timestamp (Arabic-Indic digits by default). */
export function relativeAge(unixSeconds: number, format: (n: number | string) => string = toArabicDigits): string {
  const deltaSeconds = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (deltaSeconds < 60) return t("الآن");
  // Intl gets the grammar right in every interface language (plurals, word order);
  // `format` then applies the reader's chosen digit script.
  const rtf = new Intl.RelativeTimeFormat(activeLocale(), { numeric: "auto" });
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return format(rtf.format(-minutes, "minute"));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return format(rtf.format(-hours, "hour"));
  return format(rtf.format(-Math.floor(hours / 24), "day"));
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
  const [documents, setDocuments] = useState<ResearchDocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Mirror of the list so deletes can report the removed ayah_id in their event.
  const notebookRef = useRef<NotebookItem[]>([]);
  notebookRef.current = notebook;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [notebookItems, sessionList, rootList, documentList] = await Promise.all([
        api.getNotebook(),
        api.getSessions(),
        api.getRoots(),
        // Documents are additive: an older backend without them must not break the library.
        api.getDocuments().catch(() => [] as ResearchDocumentSummary[]),
      ]);
      setNotebook(notebookItems);
      setSessions(sessionList);
      setRoots(rootList);
      setDocuments(documentList);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("تعذّر تحميل بيانات الدفتر."));
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
    } else if (change.kind === "updated") {
      setNotebook((current) => current.map((item) => (item.id === change.item.id ? change.item : item)));
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

  const deleteDocument = useCallback(async (documentId: string) => {
    await api.deleteDocument(documentId);
    setDocuments((current) => current.filter((document) => document.id !== documentId));
  }, []);

  const unfollowRoot = useCallback(async (rootId: number) => {
    await api.unfollowRoot(rootId);
    setRoots((current) => current.filter((root) => root.id !== rootId));
  }, []);

  return {
    notebook,
    sessions,
    roots,
    documents,
    loading,
    error,
    refresh,
    deleteNotebookItem,
    deleteSession,
    deleteDocument,
    unfollowRoot,
  };
}
