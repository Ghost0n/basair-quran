"use client";

import type { CSSProperties } from "react";

import type { MushafPageLayoutResponse, QuranPageAyah } from "@q-basair/shared";

import { GlyphPage, PageRibbon, type GlyphSaveTarget } from "./glyph-page";
import { MorphPopover, type MorphTarget } from "./morph-popover";
import { VerseOutlines } from "./verse-outlines";
import { AyatFlow, type WordClickHandler, type WordKeyHandler } from "./ayat-flow";
import { useMushaf } from "../mushaf-context";
import { useWordNav } from "../use-word-nav";

import { t } from "@/lib/i18n";

type PagedReaderProps = {
  pageData: { ayahs: QuranPageAyah[] };
  /** Current page number — keys the Unicode reader so a page change animates. */
  page: number;
  /** Turn direction for the whole-page animation (RTL). */
  navDir: "fwd" | "back";
  isLoading: boolean;
  /** Authentic Madani glyph rendering is active for this page (Hafs, fonts ready). */
  authentic: boolean;
  /** The primary page's QCF layout (null → render the Unicode reader). */
  layout: MushafPageLayoutResponse | null;
  /** The first authentic page is still loading: show an empty page frame, not the Unicode text. */
  layoutPending: boolean;
  /** Two facing pages side by side (authentic wide spread). */
  showSpread: boolean;
  rightLayout: MushafPageLayoutResponse | null;
  leftLayout: MushafPageLayoutResponse | null;
  /** The font-size preference (px): below the default it shrinks the printed page. */
  fontSize: number;
  selectedAyahId: number | null;
  isSaved: (ayahId: number) => boolean;
  onToggleSave: (ayah: QuranPageAyah) => void;
  onGlyphSave: (target: GlyphSaveTarget) => void;
  onWordClick: WordClickHandler;
  onWordKey: WordKeyHandler;
  morphTarget: MorphTarget | null;
  onClearMorph: () => void;
};

/**
 * PagedReader — the paged reading surface: one page (Unicode or the authentic
 * printed page) or a two-page facing spread. Extracted from MushafStage so
 * the stage can dispatch between paged / scroll / ayah layouts. It owns the
 * `.qb-mushaf-page` scroll viewport (bound to the shared `bodyRef`) and the
 * morphology popover slot; MushafStage decides when a spread fits. The
 * printed page sizes itself to the viewport in CSS (reading.css «Printed page»).
 */
export function PagedReader({
  pageData,
  page,
  navDir,
  isLoading,
  authentic,
  layout,
  layoutPending,
  showSpread,
  rightLayout,
  leftLayout,
  fontSize,
  selectedAyahId,
  isSaved,
  onToggleSave,
  onGlyphSave,
  onWordClick,
  onWordKey,
  morphTarget,
  onClearMorph,
}: PagedReaderProps) {
  const mushaf = useMushaf();
  useWordNav(mushaf.bodyRef);

  return (
    <div
      className={`qb-mushaf-page${isLoading ? " is-loading" : ""}${authentic && layout?.lines ? " is-glyph" : ""}${showSpread ? " is-spread" : ""}`}
      ref={mushaf.bodyRef}
      onClick={onClearMorph}
      role="region"
      aria-label={showSpread ? t("المصحف — صفحتان") : t("المصحف — صفحة")}
      tabIndex={0}
    >
      {authentic && layout?.lines ? (
        <div className={`qb-glyph-spread${showSpread ? " is-pair" : ""}`} style={{ "--page-zoom": pageZoom(fontSize) } as CSSProperties}>
          {showSpread && rightLayout?.lines && leftLayout?.lines ? (
            <>
              <GlyphPage
                layout={rightLayout}
                selectedAyahId={selectedAyahId}
                isSaved={isSaved}
                onToggleSave={onGlyphSave}
                onWordClick={onWordClick}
                onWordKey={onWordKey}
              />
              <GlyphPage
                layout={leftLayout}
                selectedAyahId={selectedAyahId}
                isSaved={isSaved}
                onToggleSave={onGlyphSave}
                onWordClick={onWordClick}
                onWordKey={onWordKey}
              />
            </>
          ) : (
            <GlyphPage
              layout={layout}
              selectedAyahId={selectedAyahId}
              isSaved={isSaved}
              onToggleSave={onGlyphSave}
              onWordClick={onWordClick}
              onWordKey={onWordKey}
            />
          )}
        </div>
      ) : authentic && layoutPending ? (
        // The authentic page is on its way: a quiet empty sheet, so the reader
        // never flashes the Unicode text before the printed page.
        <div className="qb-glyph-spread" style={{ "--page-zoom": pageZoom(fontSize) } as CSSProperties}>
          <div className="qb-glyph-page qb-print-page qb-glyph-skeleton" aria-busy="true" aria-label={t("جارٍ تحميل الصفحة")}>
            {Array.from({ length: 15 }, (_, index) => (
              <span key={index} className="line" aria-hidden="true" />
            ))}
          </div>
        </div>
      ) : (
        // Whole-page turn: the key remounts the content on page change so the
        // qbTurnFwd/Back animation plays (RTL — next from the left, back from the
        // right). Only the inner content remounts; the `.qb-mushaf-page` viewport
        // (and its bodyRef) stays put.
        <div key={page} className={`qb-page-turn ${navDir}`}>
          <PageRibbon page={page} surahId={pageData.ayahs[0]?.surah_id ?? null} />
          <VerseOutlines />
          <AyatFlow
            ayahs={pageData.ayahs}
            selectedAyahId={selectedAyahId}
            isSaved={isSaved}
            onToggleSave={onToggleSave}
            onWordClick={onWordClick}
            onWordKey={onWordKey}
          />
        </div>
      )}
      {morphTarget ? <MorphPopover target={morphTarget} onClose={onClearMorph} /> : null}
    </div>
  );
}

// Font-size preference (px) at which the printed page fills the reading area.
// Below it the page shrinks (never under 60%); above it the page already
// fills all the room it has, so it stays as it is.
const DEFAULT_FONT_PX = 28;

function pageZoom(fontSize: number): number {
  return Math.min(1, Math.max(0.6, fontSize / DEFAULT_FONT_PX));
}
