"use client";

import { useEffect, useMemo, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { TranslationAyahsResponse, TranslationMeta } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";
import { ensureScriptFont } from "@/lib/script-fonts";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

export type AyahTranslation = { meta: TranslationMeta; text: string; footnotes?: string | null };

/** Session cache: one request per (keys, page of refs). */
const cache = new Map<string, Promise<TranslationAyahsResponse>>();

/** Compress "2:1,2:2,2:3,3:5" into "2:1-3,3:5" to keep URLs short. */
export function compressRefs(refs: { surah: number; ayah: number }[]): string[] {
  const out: string[] = [];
  const sorted = [...refs].sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);
  let start: { surah: number; ayah: number } | null = null;
  let prev: { surah: number; ayah: number } | null = null;
  const flush = () => {
    if (start && prev) out.push(start.ayah === prev.ayah ? `${start.surah}:${start.ayah}` : `${start.surah}:${start.ayah}-${prev.ayah}`);
  };
  for (const ref of sorted) {
    if (prev && ref.surah === prev.surah && ref.ayah === prev.ayah) continue;
    if (!prev || ref.surah !== prev.surah || ref.ayah !== prev.ayah + 1) {
      flush();
      start = ref;
    }
    prev = ref;
  }
  flush();
  return out;
}

/**
 * The chosen translations of meanings for a set of ayahs (one reader page),
 * as `surah:ayah → [{meta, text}]`. Empty while loading, with no keys, or
 * when the server has no translations installed.
 */
export function useAyahTranslations(keys: string[], refs: { surah: number; ayah: number }[]): Map<string, AyahTranslation[]> {
  const keyList = keys.join(",");
  const refList = compressRefs(refs).join(",");
  const [data, setData] = useState<TranslationAyahsResponse | null>(null);

  useEffect(() => {
    if (!keyList || !refList) {
      setData(null);
      return;
    }
    let cancelled = false;
    const cacheKey = `${keyList}|${refList}`;
    let pending = cache.get(cacheKey);
    if (!pending) {
      pending = api.getTranslationAyahs(keyList.split(","), refList.split(","));
      cache.set(cacheKey, pending);
      pending.catch(() => cache.delete(cacheKey));
    }
    pending
      .then((response) => {
        if (cancelled) return;
        for (const meta of response.translations) ensureScriptFont(meta.language);
        setData(response);
      })
      .catch(() => !cancelled && setData(null));
    return () => {
      cancelled = true;
    };
  }, [keyList, refList]);

  return useMemo(() => {
    const map = new Map<string, AyahTranslation[]>();
    if (!data) return map;
    const meta = new Map(data.translations.map((item) => [item.key, item]));
    for (const ayah of data.ayahs) {
      map.set(
        `${ayah.surah}:${ayah.ayah}`,
        ayah.texts.flatMap((text) => {
          const info = meta.get(text.key);
          return info && text.text ? [{ meta: info, text: text.text, footnotes: text.footnotes }] : [];
        }),
      );
    }
    return map;
  }, [data]);
}
