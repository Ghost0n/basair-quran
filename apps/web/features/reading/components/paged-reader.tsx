"use client";

import type { RefObject } from "react";

import type { MushafPageLayoutResponse, QuranPageAyah } from "@q-basair/shared";

import { GlyphPage, type GlyphSaveTarget } from "./glyph-page";
import { MorphPopover, type MorphTarget } from "./morph-popover";
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
  /** Two facing pages side by side (authentic wide spread). */
  showSpread: boolean;
  rightLayout: MushafPageLayoutResponse | null;
  leftLayout: MushafPageLayoutResponse | null;
  /** Drives the uniform fit scale (attached to `.qb-glyph-spread`). */
  spreadRef: RefObject<HTMLDivElement | null>;
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
 * PagedReader — the paged reading surface: one fit-to-height page (Unicode or
 * authentic glyph) or a two-page facing spread. Extracted from MushafStage so
 * the stage can dispatch between paged / scroll / ayah layouts. It owns the
 * `.qb-mushaf-page` scroll viewport (bound to the shared `bodyRef`) and the
 * morphology popover slot; MushafStage keeps the tuned spread/fit computation.
 */
export function PagedReader({
  pageData,
  page,
  navDir,
  isLoading,
  authentic,
  layout,
  showSpread,
  rightLayout,
  leftLayout,
  spreadRef,
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
        <div className="qb-glyph-spread" ref={spreadRef}>
          {showSpread && rightLayout?.lines && leftLayout?.lines ? (
            <>
              <GlyphPage
                page={rightLayout.page}
                lines={rightLayout.lines}
                selectedAyahId={selectedAyahId}
                isSaved={isSaved}
                onToggleSave={onGlyphSave}
                onWordClick={onWordClick}
                onWordKey={onWordKey}
              />
              <GlyphPage
                page={leftLayout.page}
                lines={leftLayout.lines}
                selectedAyahId={selectedAyahId}
                isSaved={isSaved}
                onToggleSave={onGlyphSave}
                onWordClick={onWordClick}
                onWordKey={onWordKey}
              />
            </>
          ) : (
            <GlyphPage
              page={layout.page}
              lines={layout.lines}
              selectedAyahId={selectedAyahId}
              isSaved={isSaved}
              onToggleSave={onGlyphSave}
              onWordClick={onWordClick}
              onWordKey={onWordKey}
            />
          )}
        </div>
      ) : (
        // Whole-page turn: the key remounts the content on page change so the
        // qbTurnFwd/Back animation plays (RTL — next from the left, back from the
        // right). Only the inner content remounts; the `.qb-mushaf-page` viewport
        // (and its bodyRef) stays put.
        <div key={page} className={`qb-page-turn ${navDir}`}>
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
