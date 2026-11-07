"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { QuranPageResponse, SurahListItem } from "@q-basair/shared";

import { BrandMark } from "@/components/brand-mark";
import { Icon } from "@/components/icon";
import { Transport } from "@/features/recitation/phone-player";
import { useRecitation } from "@/features/recitation/recitation-context";
import { RecitationSheet } from "@/features/recitation/recitation-sheet";
import { useGoBack, useShellMode } from "@/features/shell/mode-context";
import { readerBackLeadsHome } from "@/features/shell/navigation";
import { useRoomWide } from "@/features/shell/room";
import { TOP_BAR_READER_ID } from "@/features/shell/top-bar-slots";
import { useBand } from "@/lib/bands";
import { useExclusiveOverlay } from "@/lib/exclusive-overlay";
import { modKey } from "@/lib/platform";
import { useNumerals } from "@/lib/preferences-context";
import { useIsMobile } from "@/lib/use-is-mobile";
import { useWebDesign } from "@/lib/use-web-design";
import { TOTAL_PAGES } from "@/lib/quran-nav";

import { DisplayStrip } from "./display-strip";
import { readerBarInTopBar } from "../reader-bar-place";
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
  recitedAway = false,
  onShowRecited,
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
  /** The recited verse isn't on screen: the dock offers «الآية المتلوّة». */
  recitedAway?: boolean;
  onShowRecited?: () => void;
}) {
  const headRef = useRef<HTMLDivElement | null>(null);
  const formatNumber = useNumerals();
  const recitation = useRecitation();
  const compact = useCompactReader();
  const dock = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  useExclusiveOverlay(sheetOpen, () => setSheetOpen(false));
  // The dock shows the recitation's controls from the moment one starts;
  // the back button folds them into «تلاوة» (reciteOpen false).
  const [reciteOpen, setReciteOpen] = useState(true);
  const wasActive = useRef(recitation.active);
  useEffect(() => {
    if (recitation.active && !wasActive.current) setReciteOpen(true);
    wasActive.current = recitation.active;
  }, [recitation.active]);
  const { goBack } = useGoBack();
  // Where back leads, as its face: the app's logo when it returns Home (the
  // reader opened from the tab bar, or from Home), an arrow when it returns to
  // another page. Read after the back stack has recorded this screen.
  // (Known from the first render on the way in, so the view transition
  // captures the right face; a page load starts from the server's arrow.)
  const [backHome, setBackHome] = useState(() => typeof window !== "undefined" && readerBackLeadsHome());
  useEffect(() => {
    setBackHome(readerBackLeadsHome());
  }, []);
  // The dock's contents animate only when they swap (reading ⇄ recitation),
  // not as the reader opens: the way in belongs to the view transition, which
  // would otherwise capture the dock empty, mid-fade.
  const dockView = recitation.active && reciteOpen;
  const firstDockView = useRef(dockView);
  const dockSwapped = useRef(false);
  if (dockView !== firstDockView.current) dockSwapped.current = true;
  const swapClass = dockSwapped.current ? " swap" : "";
  const { mode, setMode } = useShellMode();
  // Web design, wide screens: the bar lives in the shell's top bar wherever the
  // Mushaf shows — the reading page, and beside a panel (search, study, the
  // notebook…) unless the panel is widened over it — leaving the stage's
  // height to the Mushaf. The slot is found after commit (features/shell/top-bar.tsx).
  const web = useWebDesign();
  const band = useBand();
  const [roomWide] = useRoomWide();
  const inTopBar = web && readerBarInTopBar(band, mode, roomWide);
  const [topSlot, setTopSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setTopSlot(inTopBar ? document.getElementById(TOP_BAR_READER_ID) : null);
  }, [inTopBar, mode]);
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
    <div className={`qb-reader-bar${locked ? " is-locked" : ""}`} data-autofit="7" suppressHydrationWarning>
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
        {/* Web design: the surah name is the one way into «انتقل» (no second button). */}
        {web ? null : (
          <button type="button" className="act labelled go-btn" onClick={onOpenNavigate} aria-label={t("انتقل")} title={t("انتقل (سورة · آية · جزء · صفحة)")}>
            <Icon name="compass" size={18} />
            <span className="lbl">{t("انتقل")}</span>
          </button>
        )}
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
    const wideHead = (
      <div className="qb-reader-head" ref={headRef}>
        {bar}
        {strip}
      </div>
    );
    if (inTopBar) return topSlot ? createPortal(wideHead, topSlot) : null;
    return wideHead;
  }
  const bookmark = (
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
  );

  // Phones upright: the reader's bar is the dock that takes the tab bar's
  // place — a glass capsule (the surah, which opens «انتقل», then the
  // toolbox) beside its own round back button, on the side the interface
  // reads from. A recitation turns the capsule into its controls (previous ·
  // play · next · reciter); the back button folds them away into «تلاوة»,
  // which keeps a live mark and brings them back, while the audio plays on
  // (paused, back ends the recitation; it also ends from the sheet). The
  // bookmark floats in the top corner (over the printed page's running head,
  // whose surah shows in focus mode). Focus mode hides all of it.
  if (dock) {
    const reciteView = recitation.active && reciteOpen;
    const live = recitation.active && !reciteView;
    // Settings changed from their defaults (repeat, speed): a dot on the button.
    const customised = recitation.repeatMode !== "off" || recitation.speed !== 1;
    const corner = <div className="qb-reader-corner">{bookmark}</div>;
    const back = (
      <button
        type="button"
        // The Home mark (is-home): in the iPhone app the native bar's own Home
        // tab stands below the dock, so this one gives way (reading.web.css).
        className={`qb-reader-back${!reciteView && backHome ? " is-home" : ""}`}
        onClick={() => {
          if (!reciteView) {
            goBack();
            return;
          }
          // Paused: back ends the recitation; playing: it only folds the controls.
          if (!recitation.isPlaying) recitation.stop();
          setReciteOpen(false);
        }}
        aria-label={!reciteView && backHome ? t("الرئيسية") : t("رجوع")}
      >
        {!reciteView && backHome ? <BrandMark size={34} themed /> : <Icon name="arrowRight" size={20} />}
      </button>
    );
    return (
      <div className="qb-reader-head is-dock" ref={headRef}>
        <div className={`qb-reader-bar qb-reader-dock${reciteView ? " is-reciting" : ""}${locked ? " is-locked" : ""}`}>
          {reciteView ? (
            <div className={`actions recite${swapClass}`} key="recite">
              {/* Flanking the transport, which stays centred: the way back to
                  the recited verse (when it isn't on screen) and the settings. */}
              <span className="flank start">
                {recitedAway && onShowRecited ? (
                  <button type="button" className="round locate-btn" onClick={onShowRecited} aria-label={t("الآية المتلوّة")} title={t("الآية المتلوّة")}>
                    <Icon name="locate" size={19} />
                  </button>
                ) : null}
              </span>
              <Transport />
              <span className="flank end">
                <button
                  type="button"
                  className="round reciter-btn"
                  onClick={() => setSheetOpen(true)}
                  aria-haspopup="dialog"
                  aria-label={t("إعدادات التلاوة")}
                  title={t("إعدادات التلاوة")}
                >
                  <Icon name="sliders" size={18} />
                  {customised ? <span className="dot" aria-hidden="true" /> : null}
                </button>
              </span>
            </div>
          ) : (
            <div className={`actions${swapClass}`} key="tools">
              <button type="button" className="act labelled surah-btn" onClick={onOpenNavigate} aria-label={t("{0} — انتقل", { 0: surahName })}>
                <Icon name="menu" size={18} />
                <span className="lbl">{surahName}</span>
              </button>
              <span className="qb-tool-lock" inert={locked} title={locked ? t("الأدوات متوقفة أثناء التلاوة") : undefined}>
                <ToolPicker compact />
              </span>
              <button
                type="button"
                className={`act labelled display-btn${displayOpen ? " on" : ""}`}
                onClick={onToggleDisplay}
                disabled={locked}
                aria-expanded={displayOpen}
                aria-label={t("العرض")}
              >
                <Icon name="textSize" size={18} />
                <span className="lbl">{t("العرض")}</span>
              </button>
              <button
                type="button"
                className={`act labelled play-btn${live ? " is-live" : ""}`}
                onClick={live ? () => setReciteOpen(true) : togglePlay}
                disabled={!live && !playable}
                aria-label={live ? t("التلاوة الجارية") : t("تلاوة الصفحة")}
              >
                <Icon name={live && recitation.isPlaying ? "pause" : "play"} size={18} />
                <span className="lbl">{t("تلاوة")}</span>
              </button>
            </div>
          )}
        </div>
        {strip}
        {typeof document !== "undefined" ? createPortal(<>{back}{corner}</>, document.body) : null}
        {sheetOpen && typeof document !== "undefined"
          ? createPortal(<RecitationSheet onClose={() => setSheetOpen(false)} />, document.body)
          : null}
      </div>
    );
  }

  // Phones on their side: the bookmark floats on its own beside the bar
  // (same glass, same height), red once the page is saved.
  const head = (
    <div className="qb-reader-head" ref={headRef}>
    <div className="qb-reader-row">
      {bar}
      {bookmark}
    </div>
    {strip}
    </div>
  );
  if (inTopBar) return topSlot ? createPortal(head, topSlot) : null;
  return head;
}
