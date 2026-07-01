"use client";

import { useCallback, useEffect, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { QuranPageAyah } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

/**
 * Tracks which ayāt the user has saved to the library (الدفتر) and lets the
 * reader toggle one directly — so saving isn't limited to search results.
 * Maps ayah_id → notebook item id (needed to un-save). Optimistic updates.
 */
export function useSavedAyat() {
  const [byAyahId, setByAyahId] = useState<Map<number, number>>(new Map());

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

  const isSaved = useCallback((ayahId: number) => byAyahId.has(ayahId), [byAyahId]);

  const toggle = useCallback(
    async (ayah: QuranPageAyah) => {
      const existingId = byAyahId.get(ayah.ayah_id);
      if (existingId != null) {
        setByAyahId((prev) => {
          const next = new Map(prev);
          next.delete(ayah.ayah_id);
          return next;
        });
        try {
          if (existingId >= 0) await api.deleteNotebookItem(existingId);
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
