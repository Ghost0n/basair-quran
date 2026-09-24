"use client";

import type { QuranPageAyah, QuranPageResponse } from "@q-basair/shared";

import { useNumerals, usePreferences } from "@/lib/preferences-context";

import { AyatFlow, type WordClickHandler, type WordKeyHandler } from "./ayat-flow";
import { GlyphPage, type GlyphSaveTarget } from "./glyph-page";
import { MorphPopover, type MorphTarget } from "./morph-popover";
import { useMushaf } from "../mushaf-context";
import { useMushafLayout } from "../use-mushaf-layout";
import { useGlyphFitWidth } from "../use-glyph-fit-width";
import { useReaderWindow, type ScrollControls } from "../use-reader-window";
import { useWordNav } from "../use-word-nav";

export type { ScrollControls };

type SharedHandlers = {
  selectedAyahId: number | null;
  isSaved: (ayahId: number) => boolean;
  onToggleSave: (ayah: QuranPageAyah) => void;
  onGlyphSave: (target: GlyphSaveTarget) => void;
  onWordClick: WordClickHandler;
  onWordKey: WordKeyHandler;
};

type ScrollReaderProps = SharedHandlers & {
  mushafId: number;
  /** The current anchor page (MushafStage's pageData); a far jump resets the window. */
  anchorData: QuranPageResponse;
  totalPages: number;
  /** Authentic QCF rendering is on (Ḥafṣ) — sections try the glyph layout. */
  authentic: boolean;
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
 * In authentic mode each windowed page fetches its own QCF layout and renders
 * the glyph page fit-to-WIDTH (`useGlyphFitWidth` — tall pages, big text); the
 * Unicode flow stands in per page until its layout + font are ready, and stays
 * for non-Ḥafṣ riwāyāt (the endpoint falls back), exactly like the paged reader.
 */
export function ScrollReader({
  mushafId,
  anchorData,
  totalPages,
  authentic,
  selectedAyahId,
  isSaved,
  onToggleSave,
  onGlyphSave,
  onWordClick,
  onWordKey,
  morphTarget,
  onClearMorph,
  registerControls,
}: ScrollReaderProps) {
  const mushaf = useMushaf();
  const formatNumber = useNumerals();
  const { preferences } = usePreferences();
  const { pages } = useReaderWindow({ mushafId, anchorData, totalPages, registerControls });
  useWordNav(mushaf.bodyRef);
  // ONE uniform fit for every glyph page in the column (identical card width and
  // text scale — a muṣḥaf's leaves are physically identical). Mounted once;
  // its own observers catch window slides and each page's async font arrival.
  useGlyphFitWidth(mushaf.bodyRef, preferences.font_size);

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
          <ScrollPageBody
            data={pg}
            mushafId={mushafId}
            authentic={authentic}
            selectedAyahId={selectedAyahId}
            isSaved={isSaved}
            onToggleSave={onToggleSave}
            onGlyphSave={onGlyphSave}
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

/**
 * One page of the scroll column. Authentic mode tries the QCF layout (own fetch
 * + font gate per page — `useMushafLayout` prefetches neighbours, so walking the
 * window warms the next fonts); until it's usable, or off-Ḥafṣ where it never
 * becomes usable, the Unicode flow renders. The glyph page is scaled to fill the
 * column width and centred by the wrapper.
 */
function ScrollPageBody({
  data,
  mushafId,
  authentic,
  selectedAyahId,
  isSaved,
  onToggleSave,
  onGlyphSave,
  onWordClick,
  onWordKey,
}: SharedHandlers & { data: QuranPageResponse; mushafId: number; authentic: boolean }) {
  const { layout } = useMushafLayout({
    enabled: authentic,
    mushafId,
    page: data.page,
  });

  if (authentic && layout?.lines) {
    return (
      <div className="qb-glyph-scroll-wrap">
        <GlyphPage
          page={layout.page ?? data.page ?? undefined}
          lines={layout.lines}
          selectedAyahId={selectedAyahId}
          isSaved={isSaved}
          onToggleSave={onGlyphSave}
          onWordClick={onWordClick}
          onWordKey={onWordKey}
        />
      </div>
    );
  }

  return (
    <AyatFlow
      ayahs={data.ayahs}
      selectedAyahId={selectedAyahId}
      isSaved={isSaved}
      onToggleSave={onToggleSave}
      onWordClick={onWordClick}
      onWordKey={onWordKey}
    />
  );
}
