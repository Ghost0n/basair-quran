"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";

import { API_BASE_URL } from "@/lib/config";
import { emitNotebookChange, useNotebookSync } from "@/lib/notebook-sync";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

/**
 * The minimal shape needed to save an ayah. Both readers can produce it: the
 * simple reader passes its QuranPageAyah (a superset); the glyph reader builds
 * one from the clicked word + the surah catalog.
 */
export type SavableAyah = {
  ayah_id: number;
  mushaf_id: number;
  surah_id: number;
  surah: string;
  ayah: number;
  text: string;
};

/**
 * Glyph pages join an ayah's words from the layout, whose last "word" is the
 * end-of-ayah number: drop trailing digits so saved text is the verse only.
 */
export function cleanAyahText(text: string): string {
  return text.replace(/[\s\u0660-\u0669\u06F0-\u06F90-9\u06DD]+$/u, "").trim();
}

/** A saved ayah as the reader tracks it: its notebook id (-1 while pending) + themes. */
type SavedMark = { id: number; themeIds: number[] };

const NO_THEMES: number[] = [];

/**
 * Tracks which ayāt the user has saved to the library (الدفتر) and with which
 * themes (مواضيع) — so the reader can paint highlights and the theme sheet can
 * tag an ayah directly. Maps ayah_id → { notebook item id, theme ids }.
 * Optimistic updates, reconciled with the server response.
 */
export function useSavedAyat() {
  const [byAyahId, setByAyahId] = useState<Map<number, SavedMark>>(new Map());
  const byAyahIdRef = useRef(byAyahId);
  byAyahIdRef.current = byAyahId;
  // Ayāt with a save/remove in flight — a second click is ignored until it
  // settles, so rapid taps can't race the optimistic state against the server.
  const pendingRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    api
      .getNotebook()
      .then((items) => {
        if (cancelled) return;
        const map = new Map<number, SavedMark>();
        for (const item of items) {
          if (item.ayah_id != null) map.set(item.ayah_id, { id: item.id, themeIds: item.theme_ids ?? [] });
        }
        setByAyahId(map);
      })
      .catch(() => {
        /* library just starts empty if it can't load */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Stay in sync when the notebook changes elsewhere (e.g. a delete from the
  // library screen beside the reader) — clear/set the saved marker in place.
  useNotebookSync((change) => {
    setByAyahId((prev) => {
      if (change.kind === "added" || change.kind === "updated") {
        const { item } = change;
        if (item.ayah_id == null) return prev;
        const current = prev.get(item.ayah_id);
        const themeIds = item.theme_ids ?? [];
        if (current && current.id === item.id && sameIds(current.themeIds, themeIds)) return prev;
        return new Map(prev).set(item.ayah_id, { id: item.id, themeIds });
      }
      const next = new Map(prev);
      if (change.ayahId != null) {
        next.delete(change.ayahId);
      } else {
        for (const [ayahId, mark] of next) if (mark.id === change.itemId) next.delete(ayahId);
      }
      return next;
    });
  });

  const isSaved = useCallback((ayahId: number) => byAyahId.has(ayahId), [byAyahId]);
  const themeIdsOf = useCallback((ayahId: number) => byAyahId.get(ayahId)?.themeIds ?? NO_THEMES, [byAyahId]);

  const put = (ayahId: number, mark: SavedMark | null) =>
    setByAyahId((prev) => {
      const next = new Map(prev);
      if (mark) next.set(ayahId, mark);
      else next.delete(ayahId);
      return next;
    });

  /** Save (if not yet saved) with the given themes. Returns the notebook id, or null on failure. */
  const save = useCallback(async (ayah: SavableAyah, themeIds: number[] = []): Promise<number | null> => {
    const existing = byAyahIdRef.current.get(ayah.ayah_id);
    if (existing && existing.id >= 0) return existing.id;
    if (pendingRef.current.has(ayah.ayah_id)) return null;
    pendingRef.current.add(ayah.ayah_id);
    // Optimistically mark saved (temp id -1) until the server returns the id.
    put(ayah.ayah_id, { id: -1, themeIds });
    try {
      const created = await api.addNotebookItem({
        ayah_id: ayah.ayah_id,
        mushaf_id: ayah.mushaf_id,
        surah_id: ayah.surah_id,
        surah: ayah.surah,
        ayah: ayah.ayah,
        text: cleanAyahText(ayah.text),
        theme_ids: themeIds,
      });
      put(ayah.ayah_id, { id: created.id, themeIds: created.theme_ids ?? [] });
      emitNotebookChange({ kind: "added", item: created });
      return created.id;
    } catch {
      put(ayah.ayah_id, null);
      return null;
    } finally {
      pendingRef.current.delete(ayah.ayah_id);
    }
  }, []);

  /** Remove the ayah from the library (and so from all its themes). */
  const remove = useCallback(async (ayahId: number) => {
    const existing = byAyahIdRef.current.get(ayahId);
    if (!existing || existing.id < 0 || pendingRef.current.has(ayahId)) return;
    pendingRef.current.add(ayahId);
    put(ayahId, null);
    try {
      await api.deleteNotebookItem(existing.id);
      emitNotebookChange({ kind: "removed", itemId: existing.id, ayahId });
    } catch {
      put(ayahId, existing);
    } finally {
      pendingRef.current.delete(ayahId);
    }
  }, []);

  /** Replace the ayah's themes, saving it first when needed. */
  const setThemes = useCallback(
    async (ayah: SavableAyah, themeIds: number[]) => {
      const existing = byAyahIdRef.current.get(ayah.ayah_id);
      if (!existing) {
        await save(ayah, themeIds);
        return;
      }
      if (existing.id < 0) return; // still being created — the sheet retries on the next tap
      put(ayah.ayah_id, { ...existing, themeIds });
      try {
        const updated = await api.setNotebookItemThemes(existing.id, themeIds);
        put(ayah.ayah_id, { id: updated.id, themeIds: updated.theme_ids ?? [] });
        emitNotebookChange({ kind: "updated", item: updated });
      } catch {
        put(ayah.ayah_id, existing);
      }
    },
    [save],
  );

  /** Bookmark toggle (search results, simple reader): save untagged / remove. */
  const toggle = useCallback(
    async (ayah: SavableAyah) => {
      if (byAyahIdRef.current.has(ayah.ayah_id)) await remove(ayah.ayah_id);
      else await save(ayah);
    },
    [remove, save],
  );

  return { isSaved, themeIdsOf, save, remove, setThemes, toggle };
}

export type SavedAyat = ReturnType<typeof useSavedAyat>;

function sameIds(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
