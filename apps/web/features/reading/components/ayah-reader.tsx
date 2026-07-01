"use client";

import { Fragment } from "react";

import type { QuranPageAyah, QuranPageResponse } from "@q-basair/shared";

import { useNumerals } from "@/lib/preferences-context";

import {
  AyahTokens,
  BasmalaLine,
  SurahBanner,
  basmalaVisibleFor,
  type WordClickHandler,
  type WordKeyHandler,
} from "./ayat-flow";
import { MorphPopover, type MorphTarget } from "./morph-popover";
import { useMushaf } from "../mushaf-context";
import { useReaderWindow, type ScrollControls } from "../use-reader-window";

type AyahReaderProps = {
  mushafId: number;
  anchorData: QuranPageResponse;
  totalPages: number;
  selectedAyahId: number | null;
  isSaved: (ayahId: number) => boolean;
  onToggleSave: (ayah: QuranPageAyah) => void;
  onWordClick: WordClickHandler;
  onWordKey: WordKeyHandler;
  morphTarget: MorphTarget | null;
  onClearMorph: () => void;
  registerControls: (controls: ScrollControls | null) => void;
};

/**
 * AyahReader — the ayah-by-ayah surface: one verse per row (number chip · verse
 * text · save toggle), a surah banner + basmala at each surah start. Shares the
 * continuous windowing engine (`useReaderWindow`) with ScrollReader — pages are
 * grouped in `.qb-scroll-page[data-page]` wrappers so page tracking still works
 * — but lays each ayah out as its own card, leaving room for per-ayah
 * translation/tafsir later. Word-click morphology, save, and selection
 * highlight all reuse the shared AyahTokens.
 */
export function AyahReader({
  mushafId,
  anchorData,
  totalPages,
  selectedAyahId,
  isSaved,
  onToggleSave,
  onWordClick,
  onWordKey,
  morphTarget,
  onClearMorph,
  registerControls,
}: AyahReaderProps) {
  const mushaf = useMushaf();
  const formatNumber = useNumerals();
  const { pages } = useReaderWindow({ mushafId, anchorData, totalPages, registerControls });

  return (
    <div
      className="qb-mushaf-page is-ayah"
      ref={mushaf.bodyRef}
      onClick={onClearMorph}
      role="region"
      aria-label="المصحف — آية بآية"
      tabIndex={0}
    >
      {pages.map((pg) => (
        <div className="qb-scroll-page" data-page={pg.page ?? 0} key={`${mushafId}-${pg.page ?? 0}`}>
          {pg.ayahs.map((ayah) => {
            const isSelected = ayah.is_selected || ayah.ayah_id === selectedAyahId;
            return (
              <Fragment key={ayah.ayah_id}>
                {ayah.ayah === 1 ? <SurahBanner surahName={ayah.surah} /> : null}
                {basmalaVisibleFor(ayah) ? <BasmalaLine /> : null}
                <div className={`qb-ayah-row${isSelected ? " is-selected" : ""}`}>
                  <span className="qb-ayah-row-num" aria-hidden>
                    {formatNumber(ayah.ayah)}
                  </span>
                  <div className="qb-ayah-row-text">
                    <AyahTokens
                      ayah={ayah}
                      selectedAyahId={selectedAyahId}
                      isSaved={isSaved}
                      onToggleSave={onToggleSave}
                      onWordClick={onWordClick}
                      onWordKey={onWordKey}
                      showNumber={false}
                    />
                  </div>
                </div>
              </Fragment>
            );
          })}
          <div className="qb-scroll-page-mark" aria-hidden>
            صفحة {formatNumber(pg.page ?? 0)}
          </div>
        </div>
      ))}
      {morphTarget ? <MorphPopover target={morphTarget} onClose={onClearMorph} /> : null}
    </div>
  );
}
