"use client";

import "./recitation.css";

import type { ReciterItem } from "@q-basair/shared";

import { t, tn } from "@/lib/i18n";
import { useNumerals } from "@/lib/preferences-context";

import { isPlayable, partialSurahs, reciterOtherName, riwayahLabel, riwayahsOf, styleLabel } from "./reciter-catalogue";

/** The narrations to narrow the list to (shown when there are several). */
export function RiwayahChips({
  reciters,
  value,
  onChange,
}: {
  reciters: readonly ReciterItem[];
  value: string;
  onChange: (riwayah: string) => void;
}) {
  const keys = riwayahsOf(reciters.filter(isPlayable));
  if (keys.length < 2) return null;
  return (
    <div className="qb-riwayah-chips" role="radiogroup" aria-label={t("الرواية")}>
      {["all", ...keys].map((key) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          className={`qb-chip${value === key ? " on" : ""}`}
          onClick={() => onChange(key)}
        >
          {key === "all" ? t("الكل") : riwayahLabel(key)}
        </button>
      ))}
    </div>
  );
}

/** Under a reciter's name: the name in the other script, the narration, the style, how many surahs when not all. */
export function useReciterMeta(): (reciter: ReciterItem) => string {
  const formatNumber = useNumerals();
  return (reciter) => {
    const parts = [reciterOtherName(reciter), t("رواية {0}", { 0: riwayahLabel(reciter.riwayah) })].filter(Boolean);
    const style = styleLabel(reciter.style);
    if (style) parts.push(style);
    const partial = partialSurahs(reciter);
    if (partial) parts.push(tn("{0} سورة", partial, { 0: formatNumber(partial) }));
    return parts.join(" · ");
  };
}
