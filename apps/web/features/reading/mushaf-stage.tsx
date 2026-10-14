"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { QuranPageAyah, SurahListItem } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";
import { ErrorState } from "@/components/error-state";
import { useWorkspace } from "@/features/shell/workspace-context";
import { useRecitation } from "@/features/recitation/recitation-context";
import { toggleRevealed } from "@/features/recitation/session-view";
import { usePhoneLayout } from "@/lib/use-phone-layout";
import { useIsMobile } from "@/lib/use-is-mobile";
import { divisionOf, divisionRange } from "@/lib/quran-ranges";
import { Icon } from "@/components/icon";
import { useNumerals, usePreferences } from "@/lib/preferences-context";
import { AyahMarksProvider, useShowHighlights, type AyahMark } from "@/features/themes/ayah-marks";
import { useSaveAyah } from "@/features/themes/save-ayah-context";
import { useThemes } from "@/features/themes/themes-store";

import "./reading.css";

import { ReaderBar } from "./components/reader-bar";
import { NavigateSheet, type NavigateTarget } from "./components/navigate-sheet";
import { TravelOverlay } from "./components/travel-overlay";
import { type MorphTarget } from "./components/morph-popover";
import { type GlyphSaveTarget } from "./components/glyph-page";
import { PagedReader } from "./components/paged-reader";
import type { ScrollControls } from "./use-reader-window";
import { AyahReader } from "./components/ayah-reader";
import { prefetchQuranPage, useMushaf } from "./mushaf-context";
import { prefetchMushafLayout, useMushafLayout } from "./use-mushaf-layout";
import { useReaderGestures } from "./use-reader-gestures";
import { nextReaderLayout, resolveReaderMode, spreadFits } from "./reader-modes";
import { useCompactReader, useElementSize } from "./use-wide-screen";
import type { SavableAyah } from "./use-saved-ayat";
import { PageRibbonsProvider, useSavedPages, type PageRibbons } from "./use-saved-pages";
import { toolForKey } from "./tools/registry";
import { SelectionBar } from "./tools/selection-bar";
import { setReaderTool, useReaderTool } from "./tools/use-reader-tool";
import { PickedWordsProvider, VerseFocusProvider, readSelection, type VerseFocus, type WordSelection } from "./tools/word-selection";

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
  const { preferences, updateAccount, persistQuietly, ready } = usePreferences();
  const formatNumber = useNumerals();
  const selectedMushaf = state.selectedMushaf;

  const [surahs, setSurahs] = useState<SurahListItem[]>(surahCache.get(selectedMushaf) ?? []);
  const [morphTarget, setMorphTarget] = useState<MorphTarget | null>(null);
  // Page-turn direction for the whole-page animation (RTL: next enters from the
  // left, back from the right). Applied to the Unicode reader only — the glyph
  // reader's fit engine can't survive a remount, so it stays un-animated.
  const [navDir, setNavDir] = useState<"fwd" | "back">("fwd");
  // Reader sheets («انتقل», «العرض») and focus mode (all chrome hidden).
  const [sheet, setSheet] = useState<"navigate" | null>(null);
  // «العرض» drops a strip under the bar (no modal: the page stays in view).
  const [displayOpen, setDisplayOpen] = useState(false);
  // «حفظ وتظليل»: the ayah whose save/theme sheet is open.
  // Reader toolbox: the active tool decides what a tap on a word does.
  const tool = useReaderTool();
  const [selection, setSelection] = useState<WordSelection | null>(null);
  // «تظليل»: the tapped verse and the one under the pointer.
  const [focusAyahId, setFocusAyahId] = useState<number | null>(null);
  const [hoverAyahId, setHoverAyahId] = useState<number | null>(null);
  // Switching tools drops the previous tool's transient state.
  useEffect(() => {
    setSelection(null);
    setMorphTarget(null);
    setFocusAyahId(null);
    setHoverAyahId(null);
  }, [tool]);
  // The recited verse (set below, once the recitation has one on screen).
  const [recitingAyahId, setRecitingAyahId] = useState<number | null>(null);
  const verseFocus = useMemo(
    () => (ayahId: number): VerseFocus =>
      ayahId === focusAyahId ? "focus" : ayahId === recitingAyahId ? "recite" : ayahId === hoverAyahId ? "hover" : null,
    [focusAyahId, hoverAyahId, recitingAyahId],
  );
  const [immersive, setImmersive] = useState(false);

  // A recitation session locks the reader, from play until the player is
  // closed: every tool closes, verse taps do nothing, and on phones a tap on
  // the page only switches the view (the clear page ↔ the bars).
  const sessionActive = useRecitation().active;
  const phone = usePhoneLayout();
  const portrait = useIsMobile();
  useEffect(() => {
    if (!sessionActive) return;
    setSelection(null);
    setMorphTarget(null);
    setFocusAyahId(null);
    setHoverAyahId(null);
    setDisplayOpen(false);
    if (phone && !portrait) setImmersive(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionActive]);

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
    persistQuietly({
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

  // Two modes (see reader-modes.ts): the printed page (one page or a spread)
  // and verse by verse, on every device.
  const compact = useCompactReader();
  const readerMode = resolveReaderMode(preferences.reader_layout);
  const ayahMode = readerMode === "ayah";
  // The verse-by-verse reader is continuous (a windowing engine): prev/next
  // become a smooth in-place scroll rather than a page swap.
  const continuousMode = ayahMode;

  // Measure the room for pages: the canvas width (independent of the stage's own
  // max-width, which depends on whether a spread shows) and the reading
  // surface's height.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasSize = useElementSize(stageRef, (stage) => stage.parentElement);
  // A panel beside the reader (search, study, or a companion screen such as the
  // notebook) takes part of that room.
  const panelSize = useElementSize(
    stageRef,
    (stage) => stage.parentElement?.querySelector<HTMLElement>(":scope > .qb-side-panel, :scope > .qb-companion-panel") ?? null,
  );
  const surfaceSize = useElementSize(surfaceRef);

  // The stage-level layout fetch serves the PAGED reader only. In scroll mode
  // each windowed section fetches its own page layout (fit-to-width); the ayah
  // list stays Unicode by design.
  const { layout, pending: layoutPending } = useMushafLayout({
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
  // The app-wide saved-ayah store + the one theme sheet every save opens.
  const { saved, openSave } = useSaveAyah();
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

  // The whole verse as a word selection (every word carrying its ayah id).
  function verseSelection(ayahId: number): WordSelection | null {
    const root = surfaceRef.current;
    if (!root) return null;
    const words = root.querySelectorAll<HTMLElement>(`[data-wk][data-aid="${ayahId}"]`);
    const first = words[0]?.dataset.wk;
    const last = words[words.length - 1]?.dataset.wk;
    return first && last ? readSelection(root, first, last) : null;
  }

  // A tap on a verse (its number ornament, or any word with «تظليل»): select
  // the whole verse; with «تظليل» also open its save/theme sheet.
  function activateVerse(target: SavableAyah) {
    if (tool === "read") {
      if (compact) onPageTap();
      return;
    }
    setMorphTarget(null);
    if (tool === "highlight") {
      // Verse, not words: the whole ayah lights as one block.
      setSelection(null);
      setFocusAyahId(target.ayah_id);
      openSave(target, {
        onClose: () => {
          setSelection(null);
          setFocusAyahId(null);
        },
      });
      return;
    }
    setSelection(verseSelection(target.ayah_id));
  }

  // «تظليل» hover: the verse under the pointer lights whole (mouse only).
  function onSurfaceHover(event: React.PointerEvent<HTMLDivElement>) {
    if (sessionActive || tool !== "highlight" || event.pointerType !== "mouse") return;
    const target = event.target as Element;
    const verse = target.closest<HTMLElement>("[data-aid], [data-ayah-id]");
    // Between two words of a line: keep the current verse (no flicker).
    if (!verse && target.closest(".qb-glyph-line, .qb-ayat-flow")) return;
    const next = verse ? Number(verse.dataset.aid ?? verse.dataset.ayahId) || null : null;
    setHoverAyahId((current) => (current === next ? current : next));
  }

  // Glyph readers: build the ayah payload from the ornament + catalog.
  function handleGlyphSave(target: GlyphSaveTarget) {
    if (sessionActive) return;
    const surahName = surahs.find((item) => item.id === target.surahId)?.name ?? `${target.surahId}`;
    activateVerse({
      ayah_id: target.ayahId,
      mushaf_id: pageData?.mushaf_id ?? selectedMushaf,
      surah_id: target.surahId,
      surah: surahName,
      ayah: target.ayah,
      text: target.text.trim(),
    });
  }

  function handleAyahSave(ayah: QuranPageAyah) {
    if (sessionActive) return;
    activateVerse({
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
  const readerRoom = canvasSize.width - (panelSize.width ? panelSize.width + 10 : 0);
  const roomForSpread = spreadFits(readerRoom - 64, surfaceSize.height - 64);
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

  // ---------- Recitation: the recited verse, lit and followed ----------
  // The verse being recited is lit as one continuous block wherever it is on
  // screen (the "recite" verse state, drawn like the «تظليل» focus). The reader
  // always keeps it in view: pages turn to it, the verse-by-verse list
  // scrolls to it. Each verse is followed once, so a reader who turns away
  // mid-verse is only brought back by the next verse.
  const recitation = useRecitation();
  const reciting = recitation.current;
  const recitingKey = reciting ? `${reciting.surah}:${reciting.ayah}` : null;
  const followedRef = useRef<string | null>(null);
  const showAyahPage = mushaf.showAyahPage;
  useEffect(() => {
    if (!recitingKey || !reciting) {
      setRecitingAyahId(null);
      followedRef.current = null;
      return;
    }
    let frame = 0;
    let tries = 0;
    const locate = () => {
      const word = surfaceRef.current?.querySelector<HTMLElement>(`[data-wk^="${recitingKey}:"]`) ?? null;
      if (word) {
        setRecitingAyahId(word.dataset.aid ? Number(word.dataset.aid) : null);
        if (ayahMode && followedRef.current !== `${recitingKey}@scroll`) {
          followedRef.current = `${recitingKey}@scroll`;
          const row = word.closest<HTMLElement>(".qb-ayah-row") ?? word;
          const box = row.getBoundingClientRect();
          const view = surfaceRef.current?.getBoundingClientRect();
          if (view && (box.top < view.top || box.bottom > view.bottom)) {
            const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
            row.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
          }
        }
        return;
      }
      // Not drawn yet (a page still rendering): look again for a few frames.
      if (tries < 12) {
        tries += 1;
        frame = requestAnimationFrame(locate);
        return;
      }
      setRecitingAyahId(null);
      if (followedRef.current === recitingKey || !pageData) return;
      const onPage = pageData.ayahs.some((ayah) => ayah.surah_id === reciting.surah && ayah.ayah === reciting.ayah);
      if (onPage) return;
      followedRef.current = recitingKey;
      void showAyahPage(pageData.mushaf_id ?? selectedMushaf, reciting.surah, reciting.ayah);
    };
    locate();
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recitingKey, ayahMode, pageData, layout, facing.layout, showSpread]);

  // Desktop page ribbons: outline / red, a click (un)saves that page.
  const savedPages = useSavedPages();
  const ribbonMushaf = pageData?.mushaf_id ?? selectedMushaf;
  const pageRibbons = useMemo<PageRibbons>(
    () => ({
      enabled: !compact,
      isSaved: (page) => savedPages.isSaved(page, ribbonMushaf),
      toggle: (page, surahId) =>
        savedPages.toggle({
          page,
          mushaf_id: ribbonMushaf,
          surah: surahs.find((item) => item.id === surahId)?.name ?? null,
          surah_id: surahId,
        }),
    }),
    [compact, savedPages, ribbonMushaf, surahs],
  );

  // Swipe turns the page in every mode (the continuous ones scroll a page);
  // a tap on the empty page toggles focus mode (on phones, a click too).
  // On phones a swiped page turn also hides the chrome, as an e-reader does —
  // reading resumes full screen and a tap brings the bars back.
  const settleIntoPage = () => {
    if (phone && !sessionActive) setImmersive(true);
  };
  // A tap on the page: focus mode. A phone on its side keeps the recitation's
  // own clear view (its player and capsule, phone-player.css); upright, the
  // recitation's controls are the reader's dock, so the tap is focus mode too.
  function onPageTap() {
    if (sessionActive && phone && !portrait) toggleRevealed();
    else setImmersive((value) => !value);
  }

  const gestures = useReaderGestures({
    swipeEnabled: true,
    onNext: () => {
      goNextRef.current();
      settleIntoPage();
    },
    onPrev: () => {
      goPrevRef.current();
      settleIntoPage();
    },
    onTap: () => onPageTap(),
    mouseTaps: compact,
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

  // Mouse wheel / trackpad in the paged modes: once the page itself can't
  // scroll further that way, a deliberate wheel turns the page (a cooldown so
  // one flick turns one page, not five).
  const wheelRef = useRef({ total: 0, last: 0, lockedUntil: 0 });
  function onSurfaceWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (continuousMode || event.ctrlKey || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    const scroller = mushaf.bodyRef.current;
    if (scroller) {
      const down = event.deltaY > 0;
      const room = down
        ? scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
        : scroller.scrollTop;
      if (room > 2) return;
    }
    const now = performance.now();
    const wheel = wheelRef.current;
    if (now < wheel.lockedUntil) return;
    if (now - wheel.last > 250) wheel.total = 0;
    wheel.last = now;
    wheel.total += event.deltaY;
    if (Math.abs(wheel.total) < 60) return;
    const forward = wheel.total > 0;
    wheel.total = 0;
    wheel.lockedUntil = now + 550;
    if (forward) goNextRef.current();
    else goPrevRef.current();
  }

  // Shift+M cycles the three reading modes (صفحات → تمرير → آية آية).
  function cycleLayout() {
    void updateAccount({ reader_layout: nextReaderLayout(preferences.reader_layout) });
  }

  function navigateTo(target: NavigateTarget) {
    if (target.type === "surah") void mushaf.loadBySurah(selectedMushaf, target.surah, target.ayah);
    else if (target.type === "juz") void mushaf.loadByJuz(selectedMushaf, target.juz);
    else if (target.type === "hizb") {
      // A hizb opens at its first verse (Madani mushaf divisions, lib/quran-divisions).
      const { start } = divisionRange("hizb", target.hizb);
      void mushaf.loadBySurah(selectedMushaf, start.surah, start.ayah);
    }
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

  // «تحديد»: first tap picks a word (and shows its analysis); a second tap
  // extends the run to it; a tap on a lone picked word, or any tap after a
  // run, starts over.
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
  function activateWord(surah: number, ayah: number, element: HTMLElement, ayahText?: string) {
    if (sessionActive || tool === "read") {
      // The verse doesn't react (no focus ring left on the tapped word): on
      // phones the tap shows or hides the bars, as on the page around it.
      element.blur();
      if (compact) onPageTap();
      return;
    }
    if (tool === "highlight") {
      // «تظليل» works on verses: a tap on any word takes its whole ayah.
      const target = ayahFromWord(element, surah, ayah, ayahText);
      if (target) activateVerse(target);
      return;
    }
    pickWord(element);
  }

  function handleWordClick(
    surah: number,
    ayah: number,
    _position: number,
    _word: string,
    event: React.MouseEvent,
    ayahText?: string,
  ) {
    activateWord(surah, ayah, event.currentTarget as HTMLElement, ayahText);
  }

  // Keyboard path: Enter/Space on the focused word uses the active tool.
  function handleWordKey(
    surah: number,
    ayah: number,
    _position: number,
    _word: string,
    element: HTMLElement,
    ayahText?: string,
  ) {
    activateWord(surah, ayah, element, ayahText);
  }

  // Tool shortcuts (1–2) and Esc to drop a selection — ignored while typing.
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
    <VerseFocusProvider value={verseFocus}>
    <PageRibbonsProvider value={pageRibbons}>
    <div
      ref={stageRef}
      className={`qb-mushaf-stage tool-${tool}${showSpread ? " is-spread" : ""}${ayahMode ? " is-ayah" : ""}${immersive ? " is-immersive" : ""}`}
    >
      {/* Shared SR hint: words reference this via aria-describedby so the analyze
          affordance is described once, instead of turning every word into a button. */}
      <span id="qb-word-hint" className="qb-sr-only">{tt("اضغط Enter لتحديد الكلمة وتحليلها")}</span>
      <ReaderBar
        pageData={pageData}
        surahs={surahs}
        displaySurahId={displaySurahId}
        displayPage={displayPage}
        isLoading={isLoading}
        immersive={immersive}
        onPrev={goPrev}
        onNext={goNext}
        ayahMode={ayahMode}
        onOpenNavigate={() => setSheet("navigate")}
        displayOpen={displayOpen}
        onToggleDisplay={() => setDisplayOpen((open) => !open)}
        onCloseDisplay={() => setDisplayOpen(false)}
        onToggleImmersive={() => setImmersive((value) => !value)}
        locked={sessionActive}
      />

      {/* The reading surface: touch swipe turns the page (paged modes), a tap on
          the page background toggles focus mode. */}
      <div
        ref={surfaceRef}
        className="qb-reader-surface"
        onPointerDown={gestures.onPointerDown}
        onPointerUp={gestures.onPointerUp}
        onPointerCancel={gestures.onPointerCancel}
        onClick={(event) => {
          // Phones: the surah named at the top of the page opens «انتقل».
          if (compact && (event.target as Element).closest?.(".qb-print-head .surah")) {
            setSheet("navigate");
            return;
          }
          gestures.onClick(event);
        }}
        onWheel={onSurfaceWheel}
        onPointerOver={onSurfaceHover}
        onPointerLeave={() => setHoverAyahId(null)}
      >
      {/* Page-turn zones at the page edges (pointer screens): a soft glow on
          hover, a click turns the page. RTL book: the next page is on the left. */}
      {!continuousMode ? (
        <>
          <button
            type="button"
            className="qb-turn-zone next"
            onClick={goNext}
            disabled={isLoading || !pageData.has_next}
            aria-label={tt("الصفحة التالية")}
            tabIndex={-1}
          />
          <button
            type="button"
            className="qb-turn-zone prev"
            onClick={goPrev}
            disabled={isLoading || !pageData.has_previous}
            aria-label={tt("الصفحة السابقة")}
            tabIndex={-1}
          />
        </>
      ) : null}
      {ayahMode ? (
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
          layoutPending={layoutPending}
          showSpread={showSpread}
          rightLayout={rightLayout}
          leftLayout={leftLayout}
          fontSize={preferences.font_size}
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

      {/* Phones: the page number, under the tab bar in every mode. */}
      {phone && displayPage && typeof document !== "undefined"
        ? createPortal(
            <span className="qb-page-number" aria-hidden="true">
              {tt("صفحة")} {formatNumber(displayPage)}
            </span>,
            document.body,
          )
        : null}

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
              currentHizb={pageData.ayahs[0] ? divisionOf("hizb", { surah: pageData.ayahs[0].surah_id, ayah: pageData.ayahs[0].ayah }) : null}
              onNavigate={navigateTo}
              onClose={() => setSheet(null)}
            />,
            document.body,
          )
        : null}

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
    </PageRibbonsProvider>
    </VerseFocusProvider>
    </PickedWordsProvider>
    </AyahMarksProvider>
  );
}
