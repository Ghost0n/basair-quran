"use client";

import { useEffect, useMemo, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { RootDistributionResponse } from "@q-basair/shared";

import { rootSpreadCounts } from "@/features/reading/tools/study-extras-model";

import { API_BASE_URL } from "./config";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });
const cache = new Map<string, RootDistributionResponse>();

/**
 * Where a root occurs across the 114 surahs (GET /api/root-distribution),
 * cached for the session. `counts` is one count per surah, Al-Fātiḥa first.
 * Returns nothing while the current root's spread is loading — never the
 * previous root's.
 */
export function useRootSpread(root: string | null, mushafId: number): { spread: RootDistributionResponse | null; counts: number[] | null } {
  const key = root ? `${mushafId}:${root}` : null;
  const [loaded, setLoaded] = useState<{ key: string; data: RootDistributionResponse } | null>(null);

  useEffect(() => {
    if (!key || !root || cache.has(key)) return;
    let cancelled = false;
    api.getRootDistribution(root, mushafId).then(
      (result) => {
        cache.set(key, result);
        if (!cancelled) setLoaded({ key, data: result });
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [key, root, mushafId]);

  // Only the current key's data counts (the cache answers at once on a revisit).
  const current = key ? cache.get(key) ?? (loaded?.key === key ? loaded.data : null) : null;
  const counts = useMemo(() => (current && current.found ? rootSpreadCounts(current) : null), [current]);
  return { spread: current && current.found ? current : null, counts };
}
