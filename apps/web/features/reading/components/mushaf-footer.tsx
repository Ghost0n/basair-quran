"use client";

import type { QuranPageResponse } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { useNumerals } from "@/lib/preferences-context";

import { AudioMiniPlayer } from "./audio-mini-player";

export function MushafFooter({
  pageData,
  riwayahLabel,
  isLoading,
  onPrev,
  onNext,
}: {
  pageData: QuranPageResponse;
  riwayahLabel: string;
  isLoading: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const formatNumber = useNumerals();
  const juzLabel =
    pageData.juz != null
      ? pageData.juz_secondary != null
        ? `${formatNumber(pageData.juz)}–${formatNumber(pageData.juz_secondary)}`
        : formatNumber(pageData.juz)
      : "—";
  const page = pageData.page ?? 1;
  const totalPages = pageData.total_pages ?? pageData.max_page ?? 604;

  return (
    <div className="qb-mushaf-foot qb-mushaf-foot-hardened">
      <span className="meta">
        <Icon name="layers" size={13} /> جزء <strong>{juzLabel}</strong>
      </span>
      <span className="sep" />
      <span className="meta">
        رواية <strong>{riwayahLabel}</strong>
      </span>

      <AudioMiniPlayer
        surah={pageData.ayahs[0]?.surah_id}
        ayah={pageData.ayahs[0]?.ayah}
      />

      <div className="pager">
        <button
          type="button"
          className="nav"
          onClick={onPrev}
          disabled={isLoading || !pageData.has_previous}
          aria-label="الصفحة السابقة"
        >
          <Icon name="chevRight" size={14} />
        </button>
        <div className="pages" dir="ltr">
          {formatNumber(page)} / {formatNumber(totalPages)}
        </div>
        <button
          type="button"
          className="nav"
          onClick={onNext}
          disabled={isLoading || !pageData.has_next}
          aria-label="الصفحة التالية"
        >
          <Icon name="chevLeft" size={14} />
        </button>
      </div>
    </div>
  );
}
