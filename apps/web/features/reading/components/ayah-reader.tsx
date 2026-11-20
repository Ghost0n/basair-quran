"use client";

import { Fragment, useCallback, useId, useMemo, useState } from "react";

import type { MushafLayoutGlyph, QuranPageAyah, QuranPageResponse } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { useNumerals, usePreferences } from "@/lib/preferences-context";
import { fontStackFor } from "@/lib/script-fonts";

import {
  AyahTokens,
  BasmalaLine,
  SurahBanner,
  basmalaVisibleFor,
  type WordClickHandler,
  type WordKeyHandler,
} from "./ayat-flow";
import { GlyphAyah, PrintSurahHead, VerseMark, type GlyphSaveTarget } from "./glyph-page";
import { MorphPopover, type MorphTarget } from "./morph-popover";
import { useMushaf } from "../mushaf-context";
import { VerseOutlines } from "./verse-outlines";
import { useMushafLayout, warmMushafPage } from "../use-mushaf-layout";
import { useReaderWindow, type ScrollControls } from "../use-reader-window";
import { useWordNav } from "../use-word-nav";
import { useWheelAnywhere } from "../use-wheel-anywhere";
import { useWebDesign } from "@/lib/use-web-design";
import { useAyahTranslations, type AyahTranslation } from "../use-ayah-translations";

import { t } from "@/lib/i18n";

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
  const { preferences } = usePreferences();
  const translationRefs = useMemo(() => data.ayahs.map((ayah) => ({ surah: ayah.surah_id, ayah: ayah.ayah })), [data.ayahs]);
  const translations = useAyahTranslations(preferences.translations ?? [], translationRefs);

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
      <VerseOutlines />
      {data.ayahs.map((ayah) => {
        const isSelected = ayah.is_selected || ayah.ayah_id === selectedAyahId;
        const glyph = glyphByAyah.get(ayah.ayah_id);
        const hasGlyph = Boolean(glyph && glyph.words.length > 0);
        return (
          <Fragment key={ayah.ayah_id}>
            {/* With the printed page's fonts, a surah opens as on the page: its
                framed title and the calligraphic basmala. */}
            {layout && ayah.ayah === 1 ? (
              <PrintSurahHead surah={ayah.surah_id} name={ayah.surah} basmala={basmalaVisibleFor(ayah)} fontBasePath={layout.font_base_path ?? ""} />
            ) : (
              <>
                {ayah.ayah === 1 ? <SurahBanner surahName={ayah.surah} /> : null}
                {basmalaVisibleFor(ayah) ? <BasmalaLine /> : null}
              </>
            )}
            <div className={`qb-ayah-row${isSelected ? " is-selected" : ""}${hasGlyph ? " is-glyph" : ""}`}>
              {/* The Madani glyph verse already ends with its own ﴿n﴾ marker —
                  the chip would number it twice; the text fallback needs it. */}
              {hasGlyph ? null : (
                <VerseMark className="qb-ayah-row-num" text={formatNumber(ayah.ayah)} label={ayah.ayah} ayahId={ayah.ayah_id} onActivate={() => onToggleSave(ayah)} />
              )}
              <span className="qb-sr-only">{t("الآية")} {formatNumber(ayah.ayah)}</span>
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
                <AyahTranslations items={translations.get(`${ayah.surah_id}:${ayah.ayah}`)} />
              </div>
            </div>
          </Fragment>
        );
      })}
      <div className="qb-scroll-page-mark" aria-hidden>
        {t("صفحة")} {formatNumber(data.page ?? 0)}
      </div>
    </div>
  );
}

/**
 * The chosen translations of meanings under a verse — each in its own
 * language, direction and script font, attributed to its translator and
 * source. Clearly separate from the Quran text: it is a rendering of the
 * meanings, not the Quran.
 */
function AyahTranslations({ items }: { items: AyahTranslation[] | undefined }) {
  if (!items?.length) return null;
  return (
    <div className="qb-ayah-translations">
      {items.map((item) => (
        <div
          key={item.meta.key}
          className={`tr${item.meta.kind === "transliteration" ? " translit" : ""}`}
          lang={item.meta.language}
          dir={item.meta.direction === "rtl" ? "rtl" : "ltr"}
        >
          <p style={{ fontFamily: fontStackFor(item.meta.language) }}>{item.text}</p>
          <div className="src" dir="auto">
            <a href={item.meta.source_url} target="_blank" rel="noopener noreferrer">
              {item.meta.name}
            </a>
            {item.footnotes ? <Footnotes text={item.footnotes} language={item.meta.language} /> : null}
          </div>
        </div>
      ))}
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
  // A page joins the list with its glyphs ready, so it never redraws (and
  // resizes) above the verse being read; late size changes are compensated
  // by hand where the browser can't (iOS Safari).
  const prepare = useCallback((page: number) => (authentic ? warmMushafPage(mushafId, page, totalPages) : Promise.resolve()), [authentic, mushafId, totalPages]);
  const { pages } = useReaderWindow({ mushafId, anchorData, totalPages, registerControls, prepare, manualAnchor: true });
  useWordNav(mushaf.bodyRef);
  // Web: the verses scroll from anywhere on the page, not only over the column.
  useWheelAnywhere(mushaf.bodyRef, useWebDesign());

  return (
    <div
      className="qb-mushaf-page is-ayah"
      ref={mushaf.bodyRef}
      onClick={onClearMorph}
      role="region"
      aria-label={t("المصحف — آية بآية")}
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

/**
 * A translation's footnotes: a small arrow beside the source that stays where
 * it is, open or closed (the word «حواشٍ» stays its name for screen readers
 * and the tooltip); the notes take a line of their own under it.
 */
function Footnotes({ text, language }: { text: string; language: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        className={`notes-toggle${open ? " open" : ""}`}
        aria-expanded={open}
        aria-controls={id}
        aria-label={t("حواشٍ")}
        title={t("حواشٍ")}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="chevDown" size={13} />
      </button>
      {open ? (
        <p id={id} className="notes" style={{ fontFamily: fontStackFor(language) }}>
          {text}
        </p>
      ) : null}
    </>
  );
}
