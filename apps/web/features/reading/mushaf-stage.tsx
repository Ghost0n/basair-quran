"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { ReaderLayout, SurahListItem } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";
import { ErrorState } from "@/components/error-state";
import { useWorkspace } from "@/features/shell/workspace-context";
import { usePreferences } from "@/lib/preferences-context";

import "./reading.css";

import { MushafHeader } from "./components/mushaf-header";
import { MushafFooter } from "./components/mushaf-footer";
import { SurahProgress } from "./components/surah-progress";
import { TravelOverlay } from "./components/travel-overlay";
import { type MorphTarget } from "./components/morph-popover";
import { type GlyphSaveTarget } from "./components/glyph-page";
import { PagedReader } from "./components/paged-reader";
import { ScrollReader, type ScrollControls } from "./components/scroll-reader";
import { AyahReader } from "./components/ayah-reader";
import { useMushaf } from "./mushaf-context";
import { useMushafLayout } from "./use-mushaf-layout";
import { useGlyphFit } from "./use-glyph-fit";
import { useWideScreen, useShortViewport } from "./use-wide-screen";
import { useSavedAyat } from "./use-saved-ayat";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

// Surahs are catalog data — fetch once per riwāyah per session (ayah counts
// follow the riwāyah's numbering).
const surahCache = new Map<number, SurahListItem[]>();

// Reader layout cycle order for the Shift+M shortcut and the header switcher.
const LAYOUT_ORDER: ReaderLayout[] = ["auto", "single", "spread", "scroll", "ayah"];

// Facing-page pairing for the two-page spread. The Madani mushaf opens on the
// (1,2),(3,4)… spreads: the odd page reads first (on the right, in RTL) and the
// even page faces it on the left. Given the loaded page, resolve its pair.
function pageSpread(page: number): { right: number; left: number; facing: number } {
  const right = page % 2 === 1 ? page : page - 1; // odd → right (read first)
  const left = right + 1; // even → left
  return { right, left, facing: page === right ? left : right };
}

export function MushafStage() {
  const { state } = useWorkspace();
  const mushaf = useMushaf();
  const { preferences, updateAccount, updateAccountDebounced, ready } = usePreferences();
  const selectedMushaf = state.selectedMushaf;

  const [surahs, setSurahs] = useState<SurahListItem[]>(surahCache.get(selectedMushaf) ?? []);
  const [morphTarget, setMorphTarget] = useState<MorphTarget | null>(null);
  // Page-turn direction for the whole-page animation (RTL: next enters from the
  // left, back from the right). Applied to the Unicode reader only — the glyph
  // reader's fit engine can't survive a remount, so it stays un-animated.
  const [navDir, setNavDir] = useState<"fwd" | "back">("fwd");

  const mushafRef = useRef(selectedMushaf);
  const currentPageRef = useRef<number | null>(null);
  currentPageRef.current = mushaf.pageData?.page ?? null;
  // Tracks the last riwāyah we reconciled, so a failing reload can't loop.
  const reconciledRef = useRef<number | null>(null);

  // Surah catalog (once per riwāyah).
  useEffect(() => {
    const cached = surahCache.get(selectedMushaf);
    if (cached) {
      setSurahs(cached);
      return;
    }
    let cancelled = false;
    api
      .getSurahs(selectedMushaf)
      .then((list) => {
        surahCache.set(selectedMushaf, list);
        if (!cancelled) setSurahs(list);
      })
      .catch(() => {
        /* dropdowns just stay empty if the catalog fails to load */
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMushaf]);

  // Initial page load — and a self-heal: if the page ever ends up empty while
  // reading (e.g. after a navigation reset), reload the last page rather than
  // leaving the skeleton stuck. Guarded by `error` so a failed load can't loop.
  useEffect(() => {
    if (mushaf.pageData || mushaf.isLoading || mushaf.error || !ready) return;
    // Resume to the exact last-read verse (last_position) instead of the top of
    // the last page. Fall back to the localStorage last page when there is no
    // saved verse. A verse saved in another riwāyah (ayah ids are per-mushaf)
    // resumes by its surah:ayah reference in the current edition.
    const pos = preferences.last_position;
    if (pos?.ayah_id && pos.mushaf_id === selectedMushaf) {
      void mushaf.loadByAyah(selectedMushaf, pos.ayah_id);
    } else if (pos?.surah && pos.ayah) {
      void mushaf.loadBySurah(selectedMushaf, pos.surah, pos.ayah);
    } else {
      void mushaf.loadPage(selectedMushaf, mushaf.readLastPage(), { persist: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mushaf.pageData, mushaf.isLoading, mushaf.error, ready]);

  // Persist the current reading position (the selected verse, else the page's
  // first ayah) so the next visit resumes exactly here. Debounced so rapid page
  // turns coalesce into a single write.
  useEffect(() => {
    const pd = mushaf.pageData;
    if (!ready || !pd || !pd.ayahs.length) return;
    const onPage =
      mushaf.selectedAyahId != null && pd.ayahs.some((a) => a.ayah_id === mushaf.selectedAyahId);
    const anchor = onPage
      ? pd.ayahs.find((a) => a.ayah_id === mushaf.selectedAyahId)!
      : pd.ayahs[0];
    updateAccountDebounced({
      last_position: {
        ayah_id: anchor.ayah_id,
        mushaf_id: pd.mushaf_id ?? selectedMushaf,
        surah: anchor.surah_id ?? null,
        ayah: anchor.ayah ?? null,
        page: pd.page ?? null,
        updated_at: Math.floor(Date.now() / 1000),
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mushaf.pageData, mushaf.selectedAyahId, ready]);

  // Reload the current page in the new riwāyah when the selection changes.
  useEffect(() => {
    if (mushafRef.current !== selectedMushaf) {
      mushafRef.current = selectedMushaf;
      if (currentPageRef.current) {
        void mushaf.loadPage(selectedMushaf, currentPageRef.current, { persist: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMushaf]);

  const { pageData, isLoading, error } = mushaf;

  // Keep the reader on the edition's riwāyah. A page can arrive in another one:
  // a verse opened from the library/Studio that was saved under an older
  // riwāyah, or a stale default load. Re-open it in the edition — by surah:ayah
  // when a verse was targeted (ayah ids are per-mushaf), else by page. Once per
  // divergent load so a failing reload can't loop.
  useEffect(() => {
    if (
      !pageData ||
      isLoading ||
      pageData.mushaf_id === undefined ||
      pageData.mushaf_id === selectedMushaf
    ) {
      reconciledRef.current = null;
      return;
    }
    if (reconciledRef.current === pageData.mushaf_id) return;
    reconciledRef.current = pageData.mushaf_id;
    const target = pageData.ayahs.find((a) => a.ayah_id === mushaf.selectedAyahId);
    if (target?.surah_id && target.ayah) {
      void mushaf.loadBySurah(selectedMushaf, target.surah_id, target.ayah);
    } else {
      void mushaf.loadPage(selectedMushaf, pageData.page ?? mushaf.readLastPage(), { persist: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageData, isLoading, selectedMushaf]);

  // The mushaf edition decides the rendering: authentic editions draw the
  // Madani (QCF) glyph page. The layout hook is fallback-safe — until a page's
  // layout + glyph font are ready, the Unicode text stands in as a loading state.
  const authentic = state.edition.authentic;
  // «صفحتان» (header switcher + Shift+M) needs the glyph page.
  const spreadAvailable = authentic;

  // Reader layout preference dispatches the surface. `scroll` is a continuous
  // Unicode scroller; the ayah surface arrives in a later phase (reads as paged
  // for now). Everything else resolves within the paged family.
  const readerLayout = preferences.reader_layout;
  // Smart default: `auto` resolves per viewport and recomputes on resize. Phones
  // read better with continuous scroll than a fixed page; tablet/desktop stay in
  // the paged family (which already gives the spread on wide authentic, single
  // otherwise). An explicit choice is always honoured as-is.
  const isNarrow = !useWideScreen(768);
  // Short / landscape viewports (landscape phones, short windows) also read
  // better as scroll: a fit-to-height page has no vertical room and collapses
  // the authentic glyph text toward MIN_SCALE.
  const isShort = useShortViewport(560);
  const effectiveLayout =
    readerLayout === "auto" && (isNarrow || isShort) ? "scroll" : readerLayout;
  const scrollMode = effectiveLayout === "scroll";
  const ayahMode = effectiveLayout === "ayah";
  // The continuous readers (scroll + ayah) share a windowing engine and route the
  // footer prev/next to a smooth in-place scroll rather than a page swap.
  const continuousMode = scrollMode || ayahMode;
  const pagedMode: "auto" | "single" | "spread" =
    effectiveLayout === "single" ? "single" : effectiveLayout === "spread" ? "spread" : "auto";

  // The stage-level layout fetch serves the PAGED reader only. In scroll mode
  // each windowed section fetches its own page layout (fit-to-width); the ayah
  // list stays Unicode by design.
  const { layout } = useMushafLayout({
    enabled: authentic && !continuousMode,
    mushafId: pageData?.mushaf_id,
    page: pageData?.page,
  });

  // The scroll reader registers its imperative scroll control so the shared
  // footer prev/next can move the viewport instead of re-anchoring the page.
  const scrollControlsRef = useRef<ScrollControls | null>(null);
  const registerScrollControls = useCallback((controls: ScrollControls | null) => {
    scrollControlsRef.current = controls;
  }, []);

  // Save/un-save an ayah to the library (الدفتر) straight from the reader.
  const saved = useSavedAyat();

  // Glyph reader save: build the ayah payload from the clicked word + catalog.
  function handleGlyphSave(target: GlyphSaveTarget) {
    const surahName = surahs.find((item) => item.id === target.surahId)?.name ?? `${target.surahId}`;
    saved.toggle({
      ayah_id: target.ayahId,
      mushaf_id: pageData?.mushaf_id ?? selectedMushaf,
      surah_id: target.surahId,
      surah: surahName,
      ayah: target.ayah,
      text: target.text.trim(),
    });
  }

  // Two-page facing spread on wide screens; collapses to a single page when the
  // window is too narrow, when the user forces single, or on the simple reader /
  // non-Hafs (where layout is null).
  const wide = useWideScreen();
  const currentPage = pageData?.page ?? null;
  const pair = currentPage != null && currentPage >= 1 ? pageSpread(currentPage) : null;
  const spreadIntent =
    pagedMode !== "single" && authentic && wide && Boolean(layout?.lines) && pair != null;
  const facing = useMushafLayout({
    enabled: spreadIntent,
    mushafId: pageData?.mushaf_id,
    page: pair?.facing,
  });
  const showSpread = spreadIntent && Boolean(facing.layout?.lines) && pair != null;
  const rightLayout = pair && currentPage === pair.right ? layout : facing.layout;
  const leftLayout = pair && currentPage === pair.right ? facing.layout : layout;

  // The spread container drives the fit (one uniform scale for both pages).
  const spreadRef = useRef<HTMLDivElement | null>(null);
  useGlyphFit(spreadRef as RefObject<HTMLElement | null>, preferences.font_size, [layout, facing.layout, showSpread]);

  const totalPages = pageData?.total_pages ?? pageData?.max_page ?? 604;
  function goPrev() {
    if (continuousMode && scrollControlsRef.current) {
      scrollControlsRef.current.scrollByPage(-1);
      return;
    }
    if (!pageData?.page) return;
    const target = showSpread && pair ? pair.right - 2 : pageData.page - 1;
    if (target >= 1) {
      setNavDir("back");
      void mushaf.loadPage(selectedMushaf, target, { persist: true });
    }
  }
  function goNext() {
    if (continuousMode && scrollControlsRef.current) {
      scrollControlsRef.current.scrollByPage(1);
      return;
    }
    if (!pageData?.page) return;
    const target = showSpread && pair ? pair.right + 2 : pageData.page + 1;
    if (target <= totalPages) {
      setNavDir("fwd");
      void mushaf.loadPage(selectedMushaf, target, { persist: true });
    }
  }

  // Cycle the reader layout (auto → single → spread → scroll → ayah), skipping
  // «صفحتان» when it isn't available. Shared by Shift+M and the header switcher.
  function cycleLayout() {
    const order = LAYOUT_ORDER.filter((value) => value !== "spread" || spreadAvailable);
    const idx = order.indexOf(preferences.reader_layout);
    const next = order[(idx + 1) % order.length] ?? order[0];
    void updateAccount({ reader_layout: next });
  }

  // Reader-scoped keyboard shortcuts. PageUp/PageDown turn the page in every mode
  // (paged: adjacent page; continuous: smooth-scroll — goPrev/goNext branch on
  // mode). Shift+M cycles the layout (e.code so it's Arabic-keyboard safe). Space
  // is left to focused buttons and arrows to word-nav; all ignored while typing.
  const goPrevRef = useRef(goPrev);
  const goNextRef = useRef(goNext);
  const cycleLayoutRef = useRef(cycleLayout);
  goPrevRef.current = goPrev;
  goNextRef.current = goNext;
  cycleLayoutRef.current = cycleLayout;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)
      ) {
        return;
      }
      if (e.key === "PageDown") {
        e.preventDefault();
        goNextRef.current();
      } else if (e.key === "PageUp") {
        e.preventDefault();
        goPrevRef.current();
      } else if (e.shiftKey && e.code === "KeyM") {
        e.preventDefault();
        cycleLayoutRef.current();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function handleWordClick(
    surah: number,
    ayah: number,
    position: number,
    word: string,
    event: React.MouseEvent,
    ayahText?: string,
  ) {
    const container = mushaf.bodyRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const top = event.clientY - rect.top + container.scrollTop + 22;
    const rawLeft = event.clientX - rect.left - 160;
    const left = Math.min(Math.max(rawLeft, 12), Math.max(rect.width - 332, 12));
    setMorphTarget({ surah, ayah, position, word, ayahText, top, left });
  }

  // Keyboard path: anchor the popover off the focused word element instead of
  // a pointer position, so Enter/Space opens morphology without a mouse.
  function handleWordKey(
    surah: number,
    ayah: number,
    position: number,
    word: string,
    element: HTMLElement,
    ayahText?: string,
  ) {
    const container = mushaf.bodyRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const wordRect = element.getBoundingClientRect();
    const top = wordRect.bottom - rect.top + container.scrollTop + 6;
    const rawLeft = wordRect.left - rect.left + wordRect.width / 2 - 160;
    const left = Math.min(Math.max(rawLeft, 12), Math.max(rect.width - 332, 12));
    setMorphTarget({ surah, ayah, position, word, ayahText, top, left });
  }

  if (error && !pageData) {
    return (
      <div className="qb-mushaf-state error">
        <ErrorState
          message={error}
          reportScope="reader"
          onRetry={() => void mushaf.loadPage(selectedMushaf, mushaf.readLastPage(), { persist: true })}
        />
      </div>
    );
  }

  if (!pageData) {
    return (
      <div className="qb-mushaf-skeleton" aria-busy="true" aria-label="جارٍ تحميل المصحف">
        <div className="sk-banner" />
        {[88, 94, 90, 96, 84, 92, 78].map((width, index) => (
          <div key={index} className="sk-line" style={{ width: `${width}%` }} />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`qb-mushaf-stage${showSpread ? " is-spread" : ""}${scrollMode ? " is-scroll" : ""}${ayahMode ? " is-ayah" : ""}`}
    >
      {/* Shared SR hint: words reference this via aria-describedby so the analyze
          affordance is described once, instead of turning every word into a button. */}
      <span id="qb-word-hint" className="qb-sr-only">اضغط Enter لتحليل الكلمة صرفياً</span>
      <MushafHeader
        pageData={pageData}
        surahs={surahs}
        readerLayout={preferences.reader_layout}
        spreadAvailable={spreadAvailable}
        onSetLayout={(next) => void updateAccount({ reader_layout: next })}
        onJumpSurah={(surahId, ayah) => void mushaf.loadBySurah(selectedMushaf, surahId, ayah)}
        onJumpJuz={(juz) => void mushaf.loadByJuz(selectedMushaf, juz)}
      />

      {/* Continuous readers stream endlessly; the gauge restores a sense of
          place within the current surah. The paged reader has discrete page
          navigation + the footer counter, so it needs none. */}
      {continuousMode ? <SurahProgress pageData={pageData} surahs={surahs} /> : null}

      {scrollMode ? (
        <ScrollReader
          mushafId={selectedMushaf}
          anchorData={pageData}
          totalPages={totalPages}
          authentic={authentic}
          selectedAyahId={mushaf.selectedAyahId}
          isSaved={saved.isSaved}
          onToggleSave={saved.toggle}
          onGlyphSave={handleGlyphSave}
          onWordClick={handleWordClick}
          onWordKey={handleWordKey}
          morphTarget={morphTarget}
          onClearMorph={() => setMorphTarget(null)}
          registerControls={registerScrollControls}
        />
      ) : ayahMode ? (
        <AyahReader
          mushafId={selectedMushaf}
          anchorData={pageData}
          totalPages={totalPages}
          authentic={authentic}
          selectedAyahId={mushaf.selectedAyahId}
          isSaved={saved.isSaved}
          onToggleSave={saved.toggle}
          onGlyphSave={handleGlyphSave}
          onWordClick={handleWordClick}
          onWordKey={handleWordKey}
          morphTarget={morphTarget}
          onClearMorph={() => setMorphTarget(null)}
          registerControls={registerScrollControls}
        />
      ) : (
        <PagedReader
          pageData={pageData}
          page={pageData.page ?? 0}
          navDir={navDir}
          isLoading={isLoading}
          authentic={authentic}
          layout={layout}
          showSpread={showSpread}
          rightLayout={rightLayout}
          leftLayout={leftLayout}
          spreadRef={spreadRef}
          selectedAyahId={mushaf.selectedAyahId}
          isSaved={saved.isSaved}
          onToggleSave={saved.toggle}
          onGlyphSave={handleGlyphSave}
          onWordClick={handleWordClick}
          onWordKey={handleWordKey}
          morphTarget={morphTarget}
          onClearMorph={() => setMorphTarget(null)}
        />
      )}

      <MushafFooter
        pageData={pageData}
        riwayahLabel={state.edition.shortLabel}
        isLoading={isLoading}
        onPrev={goPrev}
        onNext={goNext}
        onJumpPage={(targetPage) => void mushaf.loadPage(selectedMushaf, targetPage, { persist: true })}
      />

      {/* Long-jump flourish — a gold wash + page-counter scrub over the stage,
          keyed so each far jump is a fresh, self-clearing overlay. */}
      {mushaf.travel ? (
        <TravelOverlay
          key={mushaf.travel.id}
          from={mushaf.travel.from}
          to={mushaf.travel.to}
          onDone={mushaf.clearTravel}
        />
      ) : null}
    </div>
  );
}
