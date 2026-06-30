"use client";

import { useEffect, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { MorphologyResponse } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

// Morphology is immutable per ayah — cache across the session.
const cache = new Map<string, MorphologyResponse>();

/**
 * Fetches per-word morphology for one ayah. Cached by surah:ayah so the
 * popover never refetches a verse the reader has already opened.
 */
export function useMorphology(surah: number | null, ayah: number | null, text?: string) {
  const [data, setData] = useState<MorphologyResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (surah == null || ayah == null) {
      setData(null);
      return;
    }
    // Key by text too: the same (surah, ayah) maps to a different verse across
    // riwāyāt (different numbering), so caching by number alone would be stale.
    const key = `${surah}:${ayah}:${text ?? ""}`;
    const cached = cache.get(key);
    if (cached) {
      setData(cached);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setData(null);
    api
      .getMorphology(surah, ayah, text)
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
  }, [surah, ayah, text]);

  return { data, loading };
}
