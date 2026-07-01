"use client";

import type { QuranPageAyah, QuranPageResponse } from "@q-basair/shared";

import { useNumerals } from "@/lib/preferences-context";

import { AyatFlow, type WordClickHandler, type WordKeyHandler } from "./ayat-flow";
import { MorphPopover, type MorphTarget } from "./morph-popover";
import { useMushaf } from "../mushaf-context";
import { useReaderWindow, type ScrollControls } from "../use-reader-window";

export type { ScrollControls };

type ScrollReaderProps = {
  mushafId: number;
  /** The current anchor page (MushafStage's pageData); a far jump resets the window. */
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
 * ScrollReader — continuous vertical reading: pages stacked in the
 * `.qb-mushaf-page` scroller, neighbours streamed in as you approach either
 * edge (see `useReaderWindow`). The document never scrolls (the app-shell caps
 * height); only this viewport does.
 *
 * Renders the Unicode reader for every riwāyah — authentic glyph pages are not
 * yet fit-to-width in scroll mode (future work), so scroll degrades to Unicode.
 */
export function ScrollReader({
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
}: ScrollReaderProps) {
  const mushaf = useMushaf();
  const formatNumber = useNumerals();
  const { pages } = useReaderWindow({ mushafId, anchorData, totalPages, registerControls });

  return (
    <div
      className="qb-mushaf-page is-scroll"
      ref={mushaf.bodyRef}
      onClick={onClearMorph}
      role="region"
      aria-label="المصحف — تمرير مستمر"
      tabIndex={0}
    >
      {pages.map((pg) => (
        <section className="qb-scroll-page" data-page={pg.page ?? 0} key={`${mushafId}-${pg.page ?? 0}`}>
          <AyatFlow
            ayahs={pg.ayahs}
            selectedAyahId={selectedAyahId}
            isSaved={isSaved}
            onToggleSave={onToggleSave}
            onWordClick={onWordClick}
            onWordKey={onWordKey}
          />
          <div className="qb-scroll-page-mark" aria-hidden>
            صفحة {formatNumber(pg.page ?? 0)}
          </div>
        </section>
      ))}
      {morphTarget ? <MorphPopover target={morphTarget} onClose={onClearMorph} /> : null}
    </div>
  );
}
