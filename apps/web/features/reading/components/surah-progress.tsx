"use client";

import type { QuranPageResponse, SurahListItem } from "@q-basair/shared";

import { useNumerals } from "@/lib/preferences-context";

/**
 * SurahProgress — a thin horizontal gauge pinned under the header in the
 * continuous readers (scroll + ayah). It answers the question the infinite
 * scroll erases — "how far into THIS surah am I?" — restoring a sense of place
 * without breaking the continuous flow.
 *
 * Driven by the active page (`pageData`, which the windowing engine keeps in
 * sync with the top of the viewport as you scroll) + the surah catalog for the
 * ayah count. It reads the current surah from `ayahs[0].surah_id` — the exact
 * source the header names the surah from — so the two can never disagree. The
 * fill glides (width transition) as the active page advances through the surah;
 * RTL fills from the right (reading direction = inline-start).
 */
export function SurahProgress({
  pageData,
  surahs,
}: {
  pageData: QuranPageResponse;
  surahs: SurahListItem[];
}) {
  const formatNumber = useNumerals();
  const topAyah = pageData.ayahs[0];
  const surah = surahs.find((s) => s.id === topAyah?.surah_id);
  const total = surah?.ayah_count ?? 0;
  // Clamp defensively: a page can open on the tail of the previous surah before
  // the catalog resolves, so never let the marker exceed the known total.
  const current = total > 0 ? Math.min(topAyah?.ayah ?? 0, total) : (topAyah?.ayah ?? 0);
  const pct = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;
  const name = surah?.name ?? topAyah?.surah ?? "";

  if (!topAyah) return null;

  return (
    <div
      className="qb-surah-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total || undefined}
      aria-valuenow={current}
      aria-label={`التقدّم في القراءة ضمن سورة ${name}`}
    >
      <span className="qb-surah-progress-track">
        <span className="qb-surah-progress-fill" style={{ inlineSize: `${pct}%` }} />
      </span>
      <span className="qb-surah-progress-count" dir="rtl">
        آية {formatNumber(current)} / {formatNumber(total)}
      </span>
    </div>
  );
}
