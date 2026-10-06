"use client";

import { useRef } from "react";

import type { QuranPageResponse, SurahListItem } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { useRecitation } from "@/features/recitation/recitation-context";
import { useShellMode } from "@/features/shell/mode-context";
import { modKey } from "@/lib/platform";
import { useNumerals } from "@/lib/preferences-context";
import { TOTAL_PAGES } from "@/lib/quran-nav";

import { DisplayStrip } from "./display-strip";
import { ToolPicker } from "../tools/tool-picker";
import { useSavedPages } from "../use-saved-pages";
import { useCompactReader } from "../use-wide-screen";

import { t } from "@/lib/i18n";

/**
 * ReaderBar — the reader's single, compact control row (replaces the old header
 * with its pills/selects/layout switch AND the two-row footer).
 *
 *   identity (surah · juz · page) — tap it to navigate
 *   actions: tool · «انتقل» · «العرض» · play page · bookmark · focus · ‹ ›
 *
 * A hairline under the row shows the position in the whole mushaf. Page arrows
 * are hidden on touch screens (swipe turns the page there). «العرض» opens its
 * strip right under the bar (DisplayStrip), not a modal.
 *
 * Bookmarking the page: phones get a floating button beside the bar; desktop
 * pages carry a ribbon each, so the bar only has a bookmark in the verse-by-verse
 * mode (no printed page there to hold a ribbon).
 */
export function ReaderBar({
  pageData,
  surahs,
  displaySurahId,
  displayPage,
  isLoading,
  immersive,
  ayahMode,
  onPrev,
  onNext,
  onOpenNavigate,
  displayOpen,
  onToggleDisplay,
  onCloseDisplay,
  onToggleImmersive,
  locked = false,
}: {
  pageData: QuranPageResponse;
  surahs: SurahListItem[];
  /** The surah to name — the first page read (the right page of a spread). */
  displaySurahId?: number;
  /** The page to show — the first page of a spread. */
  displayPage: number;
  isLoading: boolean;
  immersive: boolean;
  /** Verse by verse: no page to hold a ribbon, so the bar carries the bookmark. */
  ayahMode: boolean;
  onPrev: () => void;
  onNext: () => void;
  onOpenNavigate: () => void;
  displayOpen: boolean;
  onToggleDisplay: () => void;
  onCloseDisplay: () => void;
  onToggleImmersive: () => void;
  /** A recitation is open: the reading tools are locked (dimmed, unreachable) until it is closed. */
  locked?: boolean;
}) {
  const headRef = useRef<HTMLDivElement | null>(null);
  const formatNumber = useNumerals();
  const recitation = useRecitation();
  const compact = useCompactReader();
  const { setMode } = useShellMode();
  const savedPages = useSavedPages();

  const firstAyah = pageData.ayahs[0];
  const surah = surahs.find((item) => item.id === (displaySurahId ?? firstAyah?.surah_id));
  const surahName = surah?.name ?? firstAyah?.surah ?? t("المصحف");
  const totalPages = pageData.total_pages ?? pageData.max_page ?? TOTAL_PAGES;
  const juzLabel =
    pageData.juz != null
      ? pageData.juz_secondary != null
        ? `${formatNumber(pageData.juz)}–${formatNumber(pageData.juz_secondary)}`
        : formatNumber(pageData.juz)
      : null;

  // Bookmark the page (listed on Home to reopen the reader here).
  const mushafId = pageData.mushaf_id ?? 0;
  const pageSaved = savedPages.isSaved(displayPage, mushafId);
  function toggleSavePage() {
    savedPages.toggle({ page: displayPage, mushaf_id: mushafId, surah: surahName, surah_id: surah?.id ?? firstAyah?.surah_id ?? null });
  }

  // Play the page from its first ayah; the floating media bar then owns the
  // transport and the reciter choice.
  const playable = typeof firstAyah?.surah_id === "number" && typeof firstAyah?.ayah === "number";
  const isThisAyah = recitation.current?.surah === firstAyah?.surah_id && recitation.current?.ayah === firstAyah?.ayah;
  const playingHere = isThisAyah && recitation.isPlaying;
  function togglePlay() {
    if (!playable || !firstAyah) return;
    if (isThisAyah) recitation.toggle();
    else recitation.playAyah(firstAyah.surah_id, firstAyah.ayah);
  }

  const progress = Math.min(100, Math.max(0, (displayPage / totalPages) * 100));

  const bar = (
    <div className={`qb-reader-bar${locked ? " is-locked" : ""}`} data-autofit="7">
      <button type="button" className="identity" onClick={onOpenNavigate} aria-label={t("{0} — انتقل", { 0: surahName })}>
        <span className="name" data-fit-watch>{surahName}</span>
        <span className="meta" data-fit-watch>
          {juzLabel ? <span className="juz">{t("الجزء {0}", { 0: juzLabel })}{t("، ")}</span> : null}
          {t("صفحة {0}", { 0: formatNumber(displayPage) })}
          <span className="of">{t(" من {0}", { 0: formatNumber(totalPages) })}</span>
        </span>
      </button>

      <div className="actions">
        <span className="qb-tool-lock" inert={locked} title={locked ? t("الأدوات متوقفة أثناء التلاوة") : undefined}>
          <ToolPicker compact={compact} />
        </span>
        {compact ? null : (
          <button
            type="button"
            className="act search-btn"
            onClick={() => setMode("search")}
            aria-label={t("البحث")}
            title={t("البحث ({0}K أو /)", { 0: modKey() })}
          >
            <Icon name="search" size={17} />
          </button>
        )}
        <button type="button" className="act labelled go-btn" onClick={onOpenNavigate} aria-label={t("انتقل")} title={t("انتقل (سورة · آية · جزء · صفحة)")}>
          <Icon name="compass" size={18} />
          <span className="lbl">{t("انتقل")}</span>
        </button>
        <button
          type="button"
          className={`act labelled display-btn${displayOpen ? " on" : ""}`}
          onClick={onToggleDisplay}
          disabled={locked}
          aria-expanded={displayOpen}
          aria-label={t("العرض")}
          title={t("العرض (طريقة القراءة · حجم الخطّ)")}
        >
          <Icon name="textSize" size={18} />
          <span className="lbl">{t("العرض")}</span>
        </button>
        <button
          type="button"
          className={`act play-btn${playingHere ? " on" : ""}`}
          onClick={togglePlay}
          disabled={!playable}
          aria-label={playingHere ? t("إيقاف التلاوة") : t("تلاوة الصفحة")}
          title={playingHere ? t("إيقاف التلاوة") : t("تلاوة الصفحة")}
        >
          <Icon name={playingHere ? "pause" : "play"} size={17} />
          {/* Shown on phones only (their bar labels every action). */}
          <span className="lbl m2">{playingHere ? t("إيقاف") : t("تلاوة")}</span>
        </button>
        {!compact && ayahMode ? (
          <button
            type="button"
            className={`act bookmark-btn${pageSaved ? " on saved" : ""}`}
            onClick={toggleSavePage}
            aria-pressed={pageSaved}
            aria-label={pageSaved ? t("إزالة الصفحة من المحفوظات") : t("احفظ هذه الصفحة")}
            title={pageSaved ? t("إزالة الصفحة من المحفوظات") : t("احفظ هذه الصفحة")}
          >
            <Icon name={pageSaved ? "bookmarkFilled" : "bookmark"} size={17} />
          </button>
        ) : null}
        <button
          type="button"
          className="act focus-toggle"
          onClick={onToggleImmersive}
          aria-pressed={immersive}
          aria-label={immersive ? t("إنهاء وضع التركيز") : t("وضع التركيز (F)")}
          title={immersive ? t("إنهاء وضع التركيز") : t("وضع التركيز — F")}
        >
          <Icon name={immersive ? "shrink" : "expand"} size={17} />
        </button>
        {/* Phones swipe (and tap) instead of page arrows. */}
        {compact ? null : (
        <div className="pager">
          <button
            type="button"
            className="act"
            onClick={onPrev}
            disabled={isLoading || !pageData.has_previous}
            aria-label={t("الصفحة السابقة")}
            title={t("الصفحة السابقة — PageUp")}
          >
            <Icon name="chevRight" size={18} />
          </button>
          <button
            type="button"
            className="act"
            onClick={onNext}
            disabled={isLoading || !pageData.has_next}
            aria-label={t("الصفحة التالية")}
            title={t("الصفحة التالية — PageDown")}
          >
            <Icon name="chevLeft" size={18} />
          </button>
        </div>
        )}
      </div>

      <div className="progress" aria-hidden>
        <span style={{ inlineSize: `${progress}%` }} />
      </div>
    </div>
  );

  const strip = displayOpen ? <DisplayStrip onClose={onCloseDisplay} headRef={headRef} /> : null;

  if (!compact) {
    return (
      <div className="qb-reader-head" ref={headRef}>
        {bar}
        {strip}
      </div>
    );
  }
  // Phones: the bookmark floats on its own beside the bar (same glass, same
  // height), red once the page is saved.
  return (
    <div className="qb-reader-head" ref={headRef}>
    <div className="qb-reader-row">
      {bar}
      <button
        type="button"
        className={`qb-reader-bookmark${pageSaved ? " on" : ""}`}
        onClick={toggleSavePage}
        aria-pressed={pageSaved}
        aria-label={pageSaved ? t("إزالة الصفحة من المحفوظات") : t("احفظ هذه الصفحة")}
        title={pageSaved ? t("إزالة الصفحة من المحفوظات") : t("احفظ هذه الصفحة")}
      >
        <Icon name={pageSaved ? "bookmarkFilled" : "bookmark"} size={18} />
      </button>
    </div>
    {strip}
    </div>
  );
}
