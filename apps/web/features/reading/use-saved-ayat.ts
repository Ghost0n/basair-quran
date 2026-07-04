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
 * Tracks which ayāt the user has saved to the library (الدفتر) and lets the
 * reader toggle one directly — so saving isn't limited to search results.
 * Maps ayah_id → notebook item id (needed to un-save). Optimistic updates.
 */
export function useSavedAyat() {
  const [byAyahId, setByAyahId] = useState<Map<number, number>>(new Map());
  // Ayāt with a toggle in flight — a second click is ignored until it settles,
  // so rapid taps can't race the optimistic state against the server.
  const pendingRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    api
      .getNotebook()
      .then((items) => {
        if (cancelled) return;
        const map = new Map<number, number>();
        for (const item of items) {
          if (item.ayah_id != null) map.set(item.ayah_id, item.id);
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
      if (change.kind === "added") {
        if (change.item.ayah_id == null || prev.get(change.item.ayah_id) === change.item.id) return prev;
        return new Map(prev).set(change.item.ayah_id, change.item.id);
      }
      const next = new Map(prev);
      if (change.ayahId != null) {
        next.delete(change.ayahId);
      } else {
        for (const [ayahId, itemId] of next) if (itemId === change.itemId) next.delete(ayahId);
      }
      return next;
    });
  });

  const isSaved = useCallback((ayahId: number) => byAyahId.has(ayahId), [byAyahId]);

  const toggle = useCallback(
    async (ayah: SavableAyah) => {
      if (pendingRef.current.has(ayah.ayah_id)) return;
      pendingRef.current.add(ayah.ayah_id);
      try {
        await runToggle(ayah);
      } finally {
        pendingRef.current.delete(ayah.ayah_id);
      }
    },
    // runToggle is stable via byAyahId dep below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byAyahId],
  );

  const runToggle = useCallback(
    async (ayah: SavableAyah) => {
      const existingId = byAyahId.get(ayah.ayah_id);
      if (existingId != null) {
        setByAyahId((prev) => {
          const next = new Map(prev);
          next.delete(ayah.ayah_id);
          return next;
        });
        try {
          if (existingId >= 0) {
            await api.deleteNotebookItem(existingId);
            emitNotebookChange({ kind: "removed", itemId: existingId, ayahId: ayah.ayah_id });
          }
        } catch {
          setByAyahId((prev) => new Map(prev).set(ayah.ayah_id, existingId));
        }
        return;
      }
      // Optimistically mark saved (temp id -1) until the server returns the id.
      setByAyahId((prev) => new Map(prev).set(ayah.ayah_id, -1));
      try {
        const created = await api.addNotebookItem({
          ayah_id: ayah.ayah_id,
          mushaf_id: ayah.mushaf_id,
          surah_id: ayah.surah_id,
          surah: ayah.surah,
          ayah: ayah.ayah,
          text: ayah.text.trim(),
        });
        setByAyahId((prev) => new Map(prev).set(ayah.ayah_id, created.id));
        emitNotebookChange({ kind: "added", item: created });
      } catch {
        setByAyahId((prev) => {
          const next = new Map(prev);
          next.delete(ayah.ayah_id);
          return next;
        });
      }
    },
    [byAyahId],
  );

  return { isSaved, toggle };
}
