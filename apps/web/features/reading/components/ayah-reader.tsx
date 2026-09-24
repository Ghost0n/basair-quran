"use client";

import { Fragment, useMemo } from "react";

import type { MushafLayoutGlyph, QuranPageAyah, QuranPageResponse } from "@q-basair/shared";

import { useNumerals } from "@/lib/preferences-context";

import {
  AyahTokens,
  BasmalaLine,
  SurahBanner,
  basmalaVisibleFor,
  type WordClickHandler,
  type WordKeyHandler,
} from "./ayat-flow";
import { GlyphAyah, type GlyphSaveTarget } from "./glyph-page";
import { MorphPopover, type MorphTarget } from "./morph-popover";
import { useMushaf } from "../mushaf-context";
import { useMushafLayout } from "../use-mushaf-layout";
import { useReaderWindow, type ScrollControls } from "../use-reader-window";
import { useWordNav } from "../use-word-nav";

type AyahReaderProps = {
  mushafId: number;
  anchorData: QuranPageResponse;
  totalPages: number;
  /** Authentic QCF rendering is on (Ḥafṣ) — each ayah tries its glyph line. */
  authentic: boolean;
  selectedAyahId: number | null;
  isSaved: (ayahId: number) => boolean;
  onToggleSave: (ayah: QuranPageAyah) => void;
  onGlyphSave: (target: GlyphSaveTarget) => void;
  onWordClick: WordClickHandler;
  onWordKey: WordKeyHandler;
  morphTarget: MorphTarget | null;
  onClearMorph: () => void;
  registerControls: (controls: ScrollControls | null) => void;
};

type AyahPageProps = {
  data: QuranPageResponse;
  mushafId: number;
  authentic: boolean;
  selectedAyahId: number | null;
  isSaved: (ayahId: number) => boolean;
  onToggleSave: (ayah: QuranPageAyah) => void;
  onGlyphSave: (target: GlyphSaveTarget) => void;
  onWordClick: WordClickHandler;
  onWordKey: WordKeyHandler;
  formatNumber: (n: number | string) => string;
};

/**
 * One page of the ayah list. In authentic mode it fetches the page's QCF layout
 * and groups the glyph words by ayah, so each verse renders in the real Madani
 * calligraphy (`GlyphAyah`); until the layout + font are ready — or off-Ḥafṣ,
 * where the endpoint falls back — each ayah stays Unicode (`AyahTokens`). An ayah
 * that straddles a page boundary shows the portion present in this page's layout.
 */
function AyahPage({
  data,
  mushafId,
  authentic,
  selectedAyahId,
  isSaved,
  onToggleSave,
  onGlyphSave,
  onWordClick,
  onWordKey,
  formatNumber,
}: AyahPageProps) {
  const { layout } = useMushafLayout({ enabled: authentic, mushafId, page: data.page });

  // Group the page's glyph words by ayah so each verse can render as its own
  // authentic line (the layout is per printed line; a verse spans several).
  const glyphByAyah = useMemo(() => {
    const map = new Map<number, { words: MushafLayoutGlyph[]; fontFamily: string | null | undefined }>();
    for (const line of layout?.lines ?? []) {
      if (line.line_type !== "ayah") continue;
      for (const word of line.words ?? []) {
        const current = map.get(word.ayah_id);
        if (current) current.words.push(word);
        else map.set(word.ayah_id, { words: [word], fontFamily: line.font_family });
      }
    }
    return map;
  }, [layout]);

  return (
    <div className="qb-scroll-page" data-page={data.page ?? 0}>
      {data.ayahs.map((ayah) => {
        const isSelected = ayah.is_selected || ayah.ayah_id === selectedAyahId;
        const glyph = glyphByAyah.get(ayah.ayah_id);
        const hasGlyph = Boolean(glyph && glyph.words.length > 0);
        return (
          <Fragment key={ayah.ayah_id}>
            {ayah.ayah === 1 ? <SurahBanner surahName={ayah.surah} /> : null}
            {basmalaVisibleFor(ayah) ? <BasmalaLine /> : null}
            <div className={`qb-ayah-row${isSelected ? " is-selected" : ""}${hasGlyph ? " is-glyph" : ""}`}>
              {/* The Madani glyph verse already ends with its own ﴿n﴾ marker —
                  the chip would number it twice; the text fallback needs it. */}
              {hasGlyph ? null : (
                <span className="qb-ayah-row-num" aria-hidden>
                  {formatNumber(ayah.ayah)}
                </span>
              )}
              <span className="qb-sr-only">الآية {formatNumber(ayah.ayah)}</span>
              <div className="qb-ayah-row-text">
                {glyph && hasGlyph ? (
                  <GlyphAyah
                    words={glyph.words}
                    fontFamily={glyph.fontFamily}
                    isSelected={isSelected}
                    isSaved={isSaved}
                    onToggleSave={onGlyphSave}
                    onWordClick={onWordClick}
                    onWordKey={onWordKey}
                    ayahText={ayah.text}
                    save={{
                      ayahId: ayah.ayah_id,
                      surahId: ayah.surah_id,
                      ayah: ayah.ayah,
                      text: ayah.text.trim(),
                    }}
                  />
                ) : (
                  <AyahTokens
                    ayah={ayah}
                    selectedAyahId={selectedAyahId}
                    isSaved={isSaved}
                    onToggleSave={onToggleSave}
                    onWordClick={onWordClick}
                    onWordKey={onWordKey}
                    showNumber={false}
                  />
                )}
              </div>
            </div>
          </Fragment>
        );
      })}
      <div className="qb-scroll-page-mark" aria-hidden>
        صفحة {formatNumber(data.page ?? 0)}
      </div>
    </div>
  );
}

/**
 * AyahReader — the ayah-by-ayah surface: one verse per row (number chip · verse
 * text · save toggle), a surah banner + basmala at each surah start. Shares the
 * continuous windowing engine (`useReaderWindow`) with ScrollReader — pages are
 * grouped in `.qb-scroll-page[data-page]` wrappers so page tracking still works.
 * In authentic Ḥafṣ each verse renders in real QCF calligraphy (`GlyphAyah`,
 * per-page layout); otherwise it stays Unicode (`AyahTokens`). Word-click
 * morphology, save, and selection highlight are shared across both.
 */
export function AyahReader({
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
}: AyahReaderProps) {
  const mushaf = useMushaf();
  const formatNumber = useNumerals();
  const { pages } = useReaderWindow({ mushafId, anchorData, totalPages, registerControls });
  useWordNav(mushaf.bodyRef);

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
        <AyahPage
          key={`${mushafId}-${pg.page ?? 0}`}
          data={pg}
          mushafId={mushafId}
          authentic={authentic}
          selectedAyahId={selectedAyahId}
          isSaved={isSaved}
          onToggleSave={onToggleSave}
          onGlyphSave={onGlyphSave}
          onWordClick={onWordClick}
          onWordKey={onWordKey}
          formatNumber={formatNumber}
        />
      ))}
      {morphTarget ? <MorphPopover target={morphTarget} onClose={onClearMorph} /> : null}
    </div>
  );
}
