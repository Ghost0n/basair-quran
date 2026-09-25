"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { QuranPageAyah, SurahListItem } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";
import { ErrorState } from "@/components/error-state";
import { useWorkspace } from "@/features/shell/workspace-context";
import { Icon } from "@/components/icon";
import { useNumerals, usePreferences } from "@/lib/preferences-context";
import { AyahMarksProvider, useShowHighlights, type AyahMark } from "@/features/themes/ayah-marks";
import { ThemeSheet } from "@/features/themes/theme-sheet";
import { useThemes } from "@/features/themes/themes-store";

import "./reading.css";

import { ReaderBar } from "./components/reader-bar";
import { NavigateSheet, type NavigateTarget } from "./components/navigate-sheet";
import { DisplaySheet } from "./components/display-sheet";
import { TravelOverlay } from "./components/travel-overlay";
import { type MorphTarget } from "./components/morph-popover";
import { type GlyphSaveTarget } from "./components/glyph-page";
import { PagedReader } from "./components/paged-reader";
import { ScrollReader, type ScrollControls } from "./components/scroll-reader";
import { AyahReader } from "./components/ayah-reader";
import { prefetchQuranPage, useMushaf } from "./mushaf-context";
import { prefetchMushafLayout, useMushafLayout } from "./use-mushaf-layout";
import { useReaderGestures } from "./use-reader-gestures";
import { nextReaderLayout, resolveReaderMode, spreadFits } from "./reader-modes";
import { useGlyphFit } from "./use-glyph-fit";
import { useCompactReader, useElementSize } from "./use-wide-screen";
import { useSavedAyat, type SavableAyah } from "./use-saved-ayat";
import { useShellMode } from "@/features/shell/mode-context";
import { queueStudioAsk } from "@/lib/studio-prefill";
import { toolForKey } from "./tools/registry";
import { SelectionBar } from "./tools/selection-bar";
import { setReaderTool, useReaderTool } from "./tools/use-reader-tool";
import { PickedWordsProvider, readSelection, type WordSelection } from "./tools/word-selection";

import { t as tt } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

// Surahs are catalog data — fetch once per riwāyah per session (ayah counts
// follow the riwāyah's numbering).
const surahCache = new Map<number, SurahListItem[]>();

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
  const formatNumber = useNumerals();
  const selectedMushaf = state.selectedMushaf;

  const [surahs, setSurahs] = useState<SurahListItem[]>(surahCache.get(selectedMushaf) ?? []);
  const [morphTarget, setMorphTarget] = useState<MorphTarget | null>(null);
  // Page-turn direction for the whole-page animation (RTL: next enters from the
  // left, back from the right). Applied to the Unicode reader only — the glyph
  // reader's fit engine can't survive a remount, so it stays un-animated.
  const [navDir, setNavDir] = useState<"fwd" | "back">("fwd");
  // Reader sheets («انتقل», «العرض») and focus mode (all chrome hidden).
  const [sheet, setSheet] = useState<"navigate" | "display" | null>(null);
  // «حفظ وتظليل»: the ayah whose save/theme sheet is open.
  const [themeTarget, setThemeTarget] = useState<SavableAyah | null>(null);
  // Reader toolbox: the active tool decides what a tap on a word does.
  const tool = useReaderTool();
  const { setMode } = useShellMode();
  const [selection, setSelection] = useState<WordSelection | null>(null);
  // Switching tools drops the previous tool's transient state.
  useEffect(() => {
    setSelection(null);
    setMorphTarget(null);
  }, [tool]);
  const [immersive, setImmersive] = useState(false);

  // Focus mode hides the shell chrome too (top bar, rail, tab bar) — a class on
  // <html> lets shell.css react without threading state through the shell.
  useEffect(() => {
    document.documentElement.classList.toggle("qb-immersive", immersive);
    return () => document.documentElement.classList.remove("qb-immersive");
  }, [immersive]);

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
      void mushaf.loadByAyah(selectedMushaf, pos.ayah_id, [], { transient: true });
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
  const persistedRef = useRef<{ page: number | null; ayahId: number } | null>(null);
  useEffect(() => {
    const pd = mushaf.pageData;
    if (!ready || !pd || !pd.ayahs.length) return;
    // A selection clearing on the same page (e.g. the resume marker fading) is
    // not a move — keep the exact verse that was saved.
    if (
      mushaf.selectedAyahId == null &&
      persistedRef.current?.page === (pd.page ?? null) &&
      pd.ayahs.some((a) => a.ayah_id === persistedRef.current?.ayahId)
    ) {
      return;
    }
    const onPage =
      mushaf.selectedAyahId != null && pd.ayahs.some((a) => a.ayah_id === mushaf.selectedAyahId);
    const anchor = onPage
      ? pd.ayahs.find((a) => a.ayah_id === mushaf.selectedAyahId)!
      : pd.ayahs[0];
    persistedRef.current = { page: pd.page ?? null, ayahId: anchor.ayah_id };
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
  // Three modes (see reader-modes.ts): "auto" is device-smart — continuous
  // scroll on phones / short screens (a fit-to-height page has no room there),
  // pages elsewhere; explicit choices are honoured on every device.
  const compact = useCompactReader();
  const readerMode = resolveReaderMode(readerLayout, compact);
  const scrollMode = readerMode === "scroll";
  const ayahMode = readerMode === "ayah";
  // The continuous readers (scroll + ayah) share a windowing engine and route
  // prev/next to a smooth in-place scroll rather than a page swap.
  const continuousMode = scrollMode || ayahMode;

  // Measure the room for pages: the canvas width (independent of the stage's own
  // max-width, which depends on whether a spread shows) and the reading
  // surface's height.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasSize = useElementSize(stageRef, (stage) => stage.parentElement);
  const surfaceSize = useElementSize(surfaceRef);

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

  // Save an ayah to the library (الدفتر) straight from the reader and highlight
  // it with themes: the bookmark opens «حفظ وتظليل» (which saves on open).
  const saved = useSavedAyat();
  const { byId: themeById } = useThemes();
  const showHighlights = useShowHighlights();

  // Each saved ayah's highlight: its first (still existing) theme's colour.
  const markOf = useCallback(
    (ayahId: number): AyahMark => {
      if (!saved.isSaved(ayahId)) return null;
      const themes = saved.themeIdsOf(ayahId).map(themeById).filter((theme) => theme != null);
      if (themes.length === 0) return { color: null, themes: 0 };
      return { color: showHighlights ? themes[0].color : null, themes: themes.length };
    },
    [saved, themeById, showHighlights],
  );

  // Glyph reader save: build the ayah payload from the clicked word + catalog.
  function handleGlyphSave(target: GlyphSaveTarget) {
    const surahName = surahs.find((item) => item.id === target.surahId)?.name ?? `${target.surahId}`;
    setThemeTarget({
      ayah_id: target.ayahId,
      mushaf_id: pageData?.mushaf_id ?? selectedMushaf,
      surah_id: target.surahId,
      surah: surahName,
      ayah: target.ayah,
      text: target.text.trim(),
    });
  }

  function handleAyahSave(ayah: QuranPageAyah) {
    setThemeTarget({
      ayah_id: ayah.ayah_id,
      mushaf_id: ayah.mushaf_id,
      surah_id: ayah.surah_id,
      surah: ayah.surah,
      ayah: ayah.ayah,
      text: ayah.text.trim(),
    });
  }

  // Two-page facing spread on wide screens; collapses to a single page when the
  // window is too narrow, when the user forces single, or on the simple reader /
  // non-Hafs (where layout is null).
  // A facing spread only when two pages keep (almost) single-page size.
  const roomForSpread = spreadFits(canvasSize.width - 64, surfaceSize.height - 64);
  const currentPage = pageData?.page ?? null;
  const pair = currentPage != null && currentPage >= 1 ? pageSpread(currentPage) : null;
  const spreadIntent =
    !continuousMode && authentic && roomForSpread && Boolean(layout?.lines) && pair != null;
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

  // Warm the neighbouring pages (payload + layout + glyph font) so a page turn
  // renders from memory instead of waiting on the network. A spread turns two
  // pages at a time, so it warms the previous and next pairs.
  const currentPageNumber = pageData?.page ?? null;
  const spreadRight = showSpread && pair ? pair.right : null;
  useEffect(() => {
    if (continuousMode || currentPageNumber == null) return;
    const targets =
      spreadRight != null
        ? [spreadRight - 2, spreadRight - 1, spreadRight + 2, spreadRight + 3]
        : [currentPageNumber - 1, currentPageNumber + 1];
    targets.forEach((target) => {
      prefetchQuranPage(selectedMushaf, target, totalPages);
      if (authentic) prefetchMushafLayout(selectedMushaf, target, totalPages);
    });
  }, [currentPageNumber, spreadRight, continuousMode, selectedMushaf, authentic, totalPages]);

  const gestures = useReaderGestures({
    swipeEnabled: !continuousMode,
    onNext: () => goNextRef.current(),
    onPrev: () => goPrevRef.current(),
    onTap: () => setImmersive((value) => !value),
  });
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

  // Shift+M cycles the three reading modes (صفحات → تمرير → آية آية).
  function cycleLayout() {
    void updateAccount({ reader_layout: nextReaderLayout(preferences.reader_layout, compact) });
  }

  function navigateTo(target: NavigateTarget) {
    if (target.type === "surah") void mushaf.loadBySurah(selectedMushaf, target.surah, target.ayah);
    else if (target.type === "juz") void mushaf.loadByJuz(selectedMushaf, target.juz);
    else void mushaf.loadPage(selectedMushaf, target.page, { persist: true });
  }

  // Reader-scoped keyboard shortcuts. PageUp/PageDown turn the page in every mode
  // (paged: adjacent page; continuous: smooth-scroll — goPrev/goNext branch on
  // mode). Shift+M cycles the layout (e.code so it's Arabic-keyboard safe). Space
  // is left to focused buttons and arrows to word-nav; all ignored while typing.
  const goPrevRef = useRef(goPrev);
  const goNextRef = useRef(goNext);
  const cycleLayoutRef = useRef(cycleLayout);
  const sheetOpenRef = useRef(false);
  goPrevRef.current = goPrev;
  goNextRef.current = goNext;
  cycleLayoutRef.current = cycleLayout;
  sheetOpenRef.current = sheet !== null;
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
      } else if (!e.shiftKey && e.code === "KeyF" && !sheetOpenRef.current) {
        // e.code: works on an Arabic keyboard layout too.
        e.preventDefault();
        setImmersive((value) => !value);
      } else if (e.key === "Escape" && !sheetOpenRef.current) {
        setImmersive(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Grammar insights: anchor the morphology popover at a viewport point.
  function openMorph(surah: number, ayah: number, position: number, word: string, x: number, y: number, ayahText?: string) {
    const container = mushaf.bodyRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const top = y - rect.top + container.scrollTop;
    const rawLeft = x - rect.left - 160;
    const left = Math.min(Math.max(rawLeft, 12), Math.max(rect.width - 332, 12));
    setMorphTarget({ surah, ayah, position, word, ayahText, top, left });
  }

  function ayahFromWord(element: HTMLElement, surah: number, ayah: number, ayahText?: string): SavableAyah | null {
    const ayahId = Number(element.dataset.aid);
    if (!Number.isFinite(ayahId) || ayahId <= 0) return null;
    return {
      ayah_id: ayahId,
      mushaf_id: pageData?.mushaf_id ?? selectedMushaf,
      surah_id: surah,
      surah: surahs.find((item) => item.id === surah)?.name ?? `${surah}`,
      ayah,
      text: (ayahText ?? "").trim(),
    };
  }

  // «تحديد»: first tap picks a word; a second tap extends the run to it; a
  // tap on a lone picked word, or any tap after a run, starts over.
  function pickWord(element: HTMLElement) {
    const root = surfaceRef.current;
    const key = element.dataset.wk;
    if (!root || !key) return;
    setMorphTarget(null);
    setSelection((current) => {
      if (current && current.keys.length === 1) {
        if (current.anchor === key) return null;
        return readSelection(root, current.anchor, key);
      }
      return readSelection(root, key, key);
    });
  }

  // One entry point for pointer + keyboard word activation, routed by tool.
  function activateWord(
    surah: number,
    ayah: number,
    position: number,
    word: string,
    element: HTMLElement,
    point: { x: number; y: number },
    ayahText?: string,
  ) {
    switch (tool) {
      case "highlight": {
        const target = ayahFromWord(element, surah, ayah, ayahText);
        if (target) setThemeTarget(target);
        return;
      }
      case "select":
        pickWord(element);
        return;
      case "tafssir": {
        const name = surahs.find((item) => item.id === surah)?.name ?? `${surah}`;
        queueStudioAsk(
          tt("فسِّر الآية {0} من سورة {1} في سياقها: ما قبلها وما بعدها ومقصد السورة.", { 0: formatNumber(ayah), 1: name }),
          { mode: "tafssir", focus: { surah, ayah }, focusLabel: tt("{0}، الآية {1}", { 0: name, 1: formatNumber(ayah) }) },
        );
        setMode("studio");
        return;
      }
      default:
        openMorph(surah, ayah, position, word, point.x, point.y, ayahText);
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
    const element = event.currentTarget as HTMLElement;
    activateWord(surah, ayah, position, word, element, { x: event.clientX, y: event.clientY + 22 }, ayahText);
  }

  // Keyboard path: anchor off the focused word element instead of a pointer
  // position, so Enter/Space uses the active tool without a mouse.
  function handleWordKey(
    surah: number,
    ayah: number,
    position: number,
    word: string,
    element: HTMLElement,
    ayahText?: string,
  ) {
    const wordRect = element.getBoundingClientRect();
    activateWord(
      surah,
      ayah,
      position,
      word,
      element,
      { x: wordRect.left + wordRect.width / 2, y: wordRect.bottom + 6 },
      ayahText,
    );
  }

  // Tool shortcuts (1–4) and Esc to drop a selection — ignored while typing.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Escape") {
        setSelection(null);
        return;
      }
      const next = toolForKey(event.key);
      if (next) setReaderTool(next);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const isPicked = useMemo(() => {
    const picked = new Set(selection?.keys ?? []);
    return (key: string) => picked.has(key);
  }, [selection]);

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
      <div className="qb-mushaf-skeleton" aria-busy="true" aria-label={tt("جارٍ تحميل المصحف")}>
        <div className="sk-banner" />
        {[88, 94, 90, 96, 84, 92, 78].map((width, index) => (
          <div key={index} className="sk-line" style={{ width: `${width}%` }} />
        ))}
      </div>
    );
  }

  // The bar names the first page READ: the right-hand page of a spread.
  const displayPage = showSpread && pair ? pair.right : pageData.page ?? 1;
  const displaySurahId =
    (showSpread && rightLayout?.surahs?.[0]?.id) || pageData.ayahs[0]?.surah_id || undefined;

  return (
    <AyahMarksProvider value={markOf}>
    <PickedWordsProvider value={isPicked}>
    <div
      ref={stageRef}
      className={`qb-mushaf-stage${showSpread ? " is-spread" : ""}${scrollMode ? " is-scroll" : ""}${ayahMode ? " is-ayah" : ""}${immersive ? " is-immersive" : ""}`}
    >
      {/* Shared SR hint: words reference this via aria-describedby so the analyze
          affordance is described once, instead of turning every word into a button. */}
      <span id="qb-word-hint" className="qb-sr-only">{tt("اضغط Enter لتحليل الكلمة صرفياً")}</span>
      <ReaderBar
        pageData={pageData}
        surahs={surahs}
        displaySurahId={displaySurahId}
        displayPage={displayPage}
        isLoading={isLoading}
        immersive={immersive}
        onPrev={goPrev}
        onNext={goNext}
        onOpenNavigate={() => setSheet("navigate")}
        onOpenDisplay={() => setSheet("display")}
        onToggleImmersive={() => setImmersive((value) => !value)}
      />

      {/* The reading surface: touch swipe turns the page (paged modes), a tap on
          the page background toggles focus mode. */}
      <div
        ref={surfaceRef}
        className="qb-reader-surface"
        onPointerDown={gestures.onPointerDown}
        onPointerUp={gestures.onPointerUp}
        onPointerCancel={gestures.onPointerCancel}
        onClick={gestures.onClick}
      >
      {scrollMode ? (
        <ScrollReader
          mushafId={selectedMushaf}
          anchorData={pageData}
          totalPages={totalPages}
          authentic={authentic}
          selectedAyahId={mushaf.selectedAyahId}
          isSaved={saved.isSaved}
          onToggleSave={handleAyahSave}
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
          onToggleSave={handleAyahSave}
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
          onToggleSave={handleAyahSave}
          onGlyphSave={handleGlyphSave}
          onWordClick={handleWordClick}
          onWordKey={handleWordKey}
          morphTarget={morphTarget}
          onClearMorph={() => setMorphTarget(null)}
        />
      )}

      </div>

      {/* Portaled to <body>: an ancestor's transform would otherwise trap this
          fixed pill inside the (clipped) stage. */}
      {immersive && typeof document !== "undefined"
        ? createPortal(
            <button
              type="button"
              className="qb-immersive-exit"
              // Touch: exit on touchend and cancel the compatibility click —
              // otherwise the delayed click lands on the tab bar that reappears
              // under the finger. Mouse/keyboard use onClick.
              onTouchEnd={(event) => {
                event.preventDefault();
                setImmersive(false);
              }}
              onClick={() => setImmersive(false)}
              aria-label={tt("إنهاء وضع التركيز")}
            >
              <span>{tt("صفحة")} {formatNumber(displayPage)}</span>
              <Icon name="shrink" size={14} />
            </button>,
            document.body,
          )
        : null}

      {/* Sheets are portaled to <body> so they layer above the mobile tab bar
          (the stage is its own stacking context). */}
      {sheet === "navigate"
        ? createPortal(
            <NavigateSheet
              surahs={surahs}
              currentSurahId={displaySurahId}
              currentPage={displayPage}
              currentJuz={pageData.juz}
              onNavigate={navigateTo}
              onClose={() => setSheet(null)}
            />,
            document.body,
          )
        : null}
      {sheet === "display" ? createPortal(<DisplaySheet onClose={() => setSheet(null)} />, document.body) : null}
      {themeTarget ? (
        <ThemeSheet
          key={themeTarget.ayah_id}
          ayah={themeTarget}
          saved={saved}
          onClose={() => setThemeTarget(null)}
        />
      ) : null}

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
      {selection && tool === "select" ? (
        <SelectionBar
          selection={selection}
          surahs={surahs}
          mushafId={pageData.mushaf_id ?? selectedMushaf}
          onClear={() => setSelection(null)}
        />
      ) : null}
    </div>
    </PickedWordsProvider>
    </AyahMarksProvider>
  );
}
