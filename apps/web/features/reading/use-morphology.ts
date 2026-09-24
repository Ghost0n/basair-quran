"use client";

import { useEffect, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { MorphologyResponse } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

// Morphology is immutable per ayah — cache across the session.
const cache = new Map<string, MorphologyResponse>();

/**
 * Fetches per-word morphology for one ayah of one mushaf. Cached by
 * mushaf:surah:ayah so the popover never refetches a verse already opened.
 */
export function useMorphology(surah: number | null, ayah: number | null, mushaf?: number) {
  const [data, setData] = useState<MorphologyResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (surah == null || ayah == null) {
      setData(null);
      return;
    }
    // Key by mushaf too: the same (surah, ayah) maps to a different verse across
    // riwāyāt (different numbering), so caching by number alone would be stale.
    const key = `${mushaf ?? ""}:${surah}:${ayah}`;
    const cached = cache.get(key);
    if (cached) {
      setData(cached);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setData(null);
    api
      .getMorphology(surah, ayah, mushaf)
      .then((response) => {
        cache.set(key, response);
        if (!cancelled) setData(response);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [surah, ayah, mushaf]);

  return { data, loading };
}
