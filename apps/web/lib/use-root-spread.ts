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
 */
export function useRootSpread(root: string | null, mushafId: number): { spread: RootDistributionResponse | null; counts: number[] | null } {
  const key = root ? `${mushafId}:${root}` : null;
  const [spread, setSpread] = useState<RootDistributionResponse | null>(key ? cache.get(key) ?? null : null);

  useEffect(() => {
    if (!key || !root) {
      setSpread(null);
      return;
    }
    const cached = cache.get(key);
    if (cached) {
      setSpread(cached);
      return;
    }
    let cancelled = false;
    api.getRootDistribution(root, mushafId).then(
      (result) => {
        cache.set(key, result);
        if (!cancelled) setSpread(result);
      },
      () => !cancelled && setSpread(null),
    );
    return () => {
      cancelled = true;
    };
  }, [key, root, mushafId]);

  const counts = useMemo(() => (spread && spread.found ? rootSpreadCounts(spread) : null), [spread]);
  return { spread: spread && spread.found ? spread : null, counts };
}
