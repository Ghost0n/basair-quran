"use client";

import type { QuranPageResponse, SurahListItem } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { useRecitation } from "@/features/recitation/recitation-context";
import { useNumerals, usePreferences } from "@/lib/preferences-context";
import { TOTAL_PAGES } from "@/lib/quran-nav";

import { ToolPicker } from "../tools/tool-picker";
import { useCompactReader } from "../use-wide-screen";

/**
 * ReaderBar — the reader's single, compact control row (replaces the old header
 * with its pills/selects/layout switch AND the two-row footer).
 *
 *   identity (surah · juz · page) — tap it to navigate
 *   actions: «انتقل» · «العرض» · play page · bookmark page · focus · ‹ ›
 *
 * A hairline under the row shows the position in the whole mushaf. Page arrows
 * are hidden on touch screens (swipe turns the page there).
 */
export function ReaderBar({
  pageData,
  surahs,
  displaySurahId,
  displayPage,
  isLoading,
  immersive,
  onPrev,
  onNext,
  onOpenNavigate,
  onOpenDisplay,
  onToggleImmersive,
}: {
  pageData: QuranPageResponse;
  surahs: SurahListItem[];
  /** The surah to name — the first page read (the right page of a spread). */
  displaySurahId?: number;
  /** The page to show — the first page of a spread. */
  displayPage: number;
  isLoading: boolean;
  immersive: boolean;
  onPrev: () => void;
  onNext: () => void;
  onOpenNavigate: () => void;
  onOpenDisplay: () => void;
  onToggleImmersive: () => void;
}) {
  const formatNumber = useNumerals();
  const recitation = useRecitation();
  const compact = useCompactReader();
  const { preferences, updateAccount } = usePreferences();

  const firstAyah = pageData.ayahs[0];
  const surah = surahs.find((item) => item.id === (displaySurahId ?? firstAyah?.surah_id));
  const surahName = surah?.name ?? firstAyah?.surah ?? "المصحف";
  const totalPages = pageData.total_pages ?? pageData.max_page ?? TOTAL_PAGES;
  const juzLabel =
    pageData.juz != null
      ? pageData.juz_secondary != null
        ? `${formatNumber(pageData.juz)}–${formatNumber(pageData.juz_secondary)}`
        : formatNumber(pageData.juz)
      : null;

  // Bookmark the page (listed on Home to reopen the reader here).
  const mushafId = pageData.mushaf_id ?? 0;
  const savedPages = preferences.saved_pages ?? [];
  const pageSaved = savedPages.some((entry) => entry.page === displayPage && entry.mushaf_id === mushafId);
  function toggleSavePage() {
    const next = pageSaved
      ? savedPages.filter((entry) => !(entry.page === displayPage && entry.mushaf_id === mushafId))
      : [
          {
            page: displayPage,
            mushaf_id: mushafId,
            surah: surahName,
            surah_id: surah?.id ?? firstAyah?.surah_id ?? null,
            saved_at: Math.floor(Date.now() / 1000),
          },
          ...savedPages,
        ];
    void updateAccount({ saved_pages: next });
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

  return (
    <div className="qb-reader-bar">
      <button type="button" className="identity" onClick={onOpenNavigate} aria-label={`${surahName} — انتقل`}>
        <span className="name">{surahName}</span>
        <span className="meta">
          {juzLabel ? <>الجزء {juzLabel}، </> : null}
          صفحة {formatNumber(displayPage)}
          <span className="of"> من {formatNumber(totalPages)}</span>
        </span>
      </button>

      <div className="actions">
        <ToolPicker compact={compact} />
        <button type="button" className="act labelled" onClick={onOpenNavigate} aria-label="انتقل" title="انتقل (سورة · آية · جزء · صفحة)">
          <Icon name="compass" size={18} />
          <span className="lbl">انتقل</span>
        </button>
        <button type="button" className="act labelled" onClick={onOpenDisplay} aria-label="العرض" title="العرض (طريقة القراءة · حجم الخطّ)">
          <Icon name="textSize" size={18} />
          <span className="lbl">العرض</span>
        </button>
        <button
          type="button"
          className={`act${playingHere ? " on" : ""}`}
          onClick={togglePlay}
          disabled={!playable}
          aria-label={playingHere ? "إيقاف التلاوة" : "تلاوة الصفحة"}
          title={playingHere ? "إيقاف التلاوة" : "تلاوة الصفحة"}
        >
          <Icon name={playingHere ? "pause" : "play"} size={17} />
        </button>
        <button
          type="button"
          className={`act${pageSaved ? " on" : ""}`}
          onClick={toggleSavePage}
          aria-pressed={pageSaved}
          aria-label={pageSaved ? "إزالة الصفحة من المحفوظات" : "احفظ هذه الصفحة"}
          title={pageSaved ? "إزالة الصفحة من المحفوظات" : "احفظ هذه الصفحة"}
        >
          <Icon name={pageSaved ? "bookmarkFilled" : "bookmark"} size={17} />
        </button>
        <button
          type="button"
          className="act"
          onClick={onToggleImmersive}
          aria-pressed={immersive}
          aria-label={immersive ? "إنهاء وضع التركيز" : "وضع التركيز (F)"}
          title={immersive ? "إنهاء وضع التركيز" : "وضع التركيز — F"}
        >
          <Icon name={immersive ? "shrink" : "expand"} size={17} />
        </button>
        <div className="pager">
          <button
            type="button"
            className="act"
            onClick={onPrev}
            disabled={isLoading || !pageData.has_previous}
            aria-label="الصفحة السابقة"
            title="الصفحة السابقة — PageUp"
          >
            <Icon name="chevRight" size={18} />
          </button>
          <button
            type="button"
            className="act"
            onClick={onNext}
            disabled={isLoading || !pageData.has_next}
            aria-label="الصفحة التالية"
            title="الصفحة التالية — PageDown"
          >
            <Icon name="chevLeft" size={18} />
          </button>
        </div>
      </div>

      <div className="progress" aria-hidden>
        <span style={{ inlineSize: `${progress}%` }} />
      </div>
    </div>
  );
}
