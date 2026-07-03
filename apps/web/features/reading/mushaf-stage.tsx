"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { SurahListItem } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";
import { ErrorState } from "@/components/error-state";
import { useWorkspace } from "@/features/shell/workspace-context";
import { usePreferences } from "@/lib/preferences-context";

import "./reading.css";

import { MushafHeader } from "./components/mushaf-header";
import { MushafFooter } from "./components/mushaf-footer";
import { type MorphTarget } from "./components/morph-popover";
import { type GlyphSaveTarget } from "./components/glyph-page";
import { PagedReader } from "./components/paged-reader";
import { ScrollReader, type ScrollControls } from "./components/scroll-reader";
import { AyahReader } from "./components/ayah-reader";
import { useMushaf } from "./mushaf-context";
import { useMushafLayout } from "./use-mushaf-layout";
import { useGlyphFit } from "./use-glyph-fit";
import { useWideScreen } from "./use-wide-screen";
import { useSavedAyat } from "./use-saved-ayat";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

// Surahs are catalog data — fetch once per session.
let surahCache: SurahListItem[] | null = null;

// Facing-page pairing for the two-page spread. The Madani mushaf opens on the
// (1,2),(3,4)… spreads: the odd page reads first (on the right, in RTL) and the
// even page faces it on the left. Given the loaded page, resolve its pair.
function pageSpread(page: number): { right: number; left: number; facing: number } {
  const right = page % 2 === 1 ? page : page - 1; // odd → right (read first)
  const left = right + 1; // even → left
  return { right, left, facing: page === right ? left : right };
}

export function MushafStage() {
  const { state, actions } = useWorkspace();
  const mushaf = useMushaf();
  const selectedMushaf = state.selectedMushaf;

  const [surahs, setSurahs] = useState<SurahListItem[]>(surahCache ?? []);
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

  // Surah catalog (once).
  useEffect(() => {
    if (surahCache) return;
    let cancelled = false;
    api
      .getSurahs()
      .then((list) => {
        surahCache = list;
        if (!cancelled) setSurahs(list);
      })
      .catch(() => {
        /* dropdowns just stay empty if the catalog fails to load */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Initial page load — and a self-heal: if the page ever ends up empty while
  // reading (e.g. after a navigation reset), reload the last page rather than
  // leaving the skeleton stuck. Guarded by `error` so a failed load can't loop.
  useEffect(() => {
    if (!mushaf.pageData && !mushaf.isLoading && !mushaf.error) {
      void mushaf.loadPage(selectedMushaf, mushaf.readLastPage(), { persist: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mushaf.pageData, mushaf.isLoading, mushaf.error]);

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

  // Reconcile when the loaded page's riwāyah diverges from the active selection.
  // Two causes, opposite fixes:
  //  • A deliberate open of a specific ayah in ANOTHER riwāyah (e.g. a saved
  //    verse from the library was saved in Qālūn while the reader is on Ḥafṣ).
  //    Here the loaded page IS what the user asked for — adopt its riwāyah into
  //    the selection rather than reloading and losing the ayah. Presetting the
  //    refs keeps the selection-change effect from re-loading the same page.
  //  • A stale default load: the first page request fired for the default
  //    riwāyah before the saved/account one resolved. Bring the page to the
  //    selected riwāyah (once per selection, so a load error can't loop).
  useEffect(() => {
    if (
      !pageData ||
      isLoading ||
      pageData.mushaf_id === undefined ||
      pageData.mushaf_id === selectedMushaf
    ) {
      return;
    }
    if (mushaf.selectedAyahId != null) {
      mushafRef.current = pageData.mushaf_id;
      reconciledRef.current = pageData.mushaf_id;
      actions.setSelectedMushaf(pageData.mushaf_id);
    } else if (reconciledRef.current !== selectedMushaf) {
      reconciledRef.current = selectedMushaf;
      void mushaf.loadPage(selectedMushaf, pageData.page ?? mushaf.readLastPage(), { persist: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageData, isLoading, selectedMushaf]);

  // Authentic Madani (QCF) rendering is an opt-in account preference. The hook
  // is fallback-safe: it yields a usable layout only for Hafs pages whose glyph
  // fonts have loaded, so non-Hafs riwāyāt and the loading window keep showing
  // the Unicode reader below.
  const { preferences } = usePreferences();
  const authentic = preferences.mushaf_render === "authentic";

  // Reader layout preference dispatches the surface. `scroll` is a continuous
  // Unicode scroller; the ayah surface arrives in a later phase (reads as paged
  // for now). Everything else resolves within the paged family.
  const readerLayout = preferences.reader_layout;
  // Smart default: `auto` resolves per viewport and recomputes on resize. Phones
  // read better with continuous scroll than a fixed page; tablet/desktop stay in
  // the paged family (which already gives the spread on wide authentic, single
  // otherwise). An explicit choice is always honoured as-is.
  const isNarrow = !useWideScreen(768);
  const effectiveLayout = readerLayout === "auto" && isNarrow ? "scroll" : readerLayout;
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
  useGlyphFit(spreadRef as RefObject<HTMLElement | null>, [layout, facing.layout, showSpread]);

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
      <MushafHeader
        pageData={pageData}
        surahs={surahs}
        onJumpSurah={(surahId, ayah) => void mushaf.loadBySurah(selectedMushaf, surahId, ayah)}
        onJumpJuz={(juz) => void mushaf.loadByJuz(selectedMushaf, juz)}
      />

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
          selectedAyahId={mushaf.selectedAyahId}
          isSaved={saved.isSaved}
          onToggleSave={saved.toggle}
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
        riwayahLabel={state.selectedMushafLabel || "—"}
        isLoading={isLoading}
        onPrev={goPrev}
        onNext={goNext}
        onJumpPage={(targetPage) => void mushaf.loadPage(selectedMushaf, targetPage, { persist: true })}
      />
    </div>
  );
}
