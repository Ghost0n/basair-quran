"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { QuranPageAyah, SurahListItem } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";
import { toArabicDigits } from "@/lib/numerals";
import { ErrorState } from "@/components/error-state";
import { Icon } from "@/components/icon";
import { useWorkspace } from "@/features/shell/workspace-context";
import { usePreferences } from "@/lib/preferences-context";

import "./reading.css";

import { MushafHeader } from "./components/mushaf-header";
import { MushafFooter } from "./components/mushaf-footer";
import { MorphPopover, type MorphTarget } from "./components/morph-popover";
import { GlyphPage, type GlyphSaveTarget } from "./components/glyph-page";
import { useMushaf } from "./mushaf-context";
import { useMushafLayout } from "./use-mushaf-layout";
import { useGlyphFit } from "./use-glyph-fit";
import { useWideScreen } from "./use-wide-screen";
import { useSavedAyat } from "./use-saved-ayat";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

// Surahs are catalog data — fetch once per session.
let surahCache: SurahListItem[] | null = null;

const BASMALA = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";
const AT_TAWBAH_ID = 9; // the only surah with no basmala at all.

// Strip Qur'anic diacritics/marks/tatweel and normalize alef forms, so the
// basmala can be matched across riwāyāt regardless of vowel marks.
function stripArabicMarks(text: string): string {
  return text
    .replace(/\p{M}/gu, "")
    .replace(/ـ/g, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/\s+/g, "");
}

const BASMALA_NORMALIZED = stripArabicMarks(BASMALA);

// Whether an ayah's text IS the basmala — true for Al-Fatiha's ayah 1 in
// riwāyāt that count it (e.g. Hafs), so we don't print a duplicate header.
function isBasmalaText(text: string): boolean {
  return stripArabicMarks(text).startsWith(BASMALA_NORMALIZED);
}

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
  const selectedMushaf = state.selectedMushaf;

  const [surahs, setSurahs] = useState<SurahListItem[]>(surahCache ?? []);
  const [morphTarget, setMorphTarget] = useState<MorphTarget | null>(null);

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

  // Reconcile a stale riwāyah: a saved riwāyah can resolve to a new value after
  // the first page request already fired for the default one, leaving the loaded
  // page's mushaf diverged from the active selection (the switch effect above
  // skips its reload when no page had loaded yet). Reload in the selected riwāyah
  // — once per selection, so a load error can't loop.
  useEffect(() => {
    if (
      pageData &&
      !isLoading &&
      pageData.mushaf_id !== undefined &&
      pageData.mushaf_id !== selectedMushaf &&
      reconciledRef.current !== selectedMushaf
    ) {
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
  const { layout } = useMushafLayout({
    enabled: authentic,
    mushafId: pageData?.mushaf_id,
    page: pageData?.page,
  });

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
  // window is too narrow (or on the simple reader / non-Hafs, where layout is null).
  const wide = useWideScreen();
  const currentPage = pageData?.page ?? null;
  const pair = currentPage != null && currentPage >= 1 ? pageSpread(currentPage) : null;
  const spreadIntent = authentic && wide && Boolean(layout?.lines) && pair != null;
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
    if (!pageData?.page) return;
    const target = showSpread && pair ? pair.right - 2 : pageData.page - 1;
    if (target >= 1) void mushaf.loadPage(selectedMushaf, target, { persist: true });
  }
  function goNext() {
    if (!pageData?.page) return;
    const target = showSpread && pair ? pair.right + 2 : pageData.page + 1;
    if (target <= totalPages) void mushaf.loadPage(selectedMushaf, target, { persist: true });
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
    <div className={`qb-mushaf-stage${showSpread ? " is-spread" : ""}`}>
      <MushafHeader
        pageData={pageData}
        surahs={surahs}
        onJumpSurah={(surahId, ayah) => void mushaf.loadBySurah(selectedMushaf, surahId, ayah)}
        onJumpJuz={(juz) => void mushaf.loadByJuz(selectedMushaf, juz)}
      />

      <div
        className={`qb-mushaf-page${isLoading ? " is-loading" : ""}${authentic && layout?.lines ? " is-glyph" : ""}${showSpread ? " is-spread" : ""}`}
        ref={mushaf.bodyRef}
        onClick={() => setMorphTarget(null)}
      >
        {authentic && layout?.lines ? (
          <div className="qb-glyph-spread" ref={spreadRef}>
            {showSpread && rightLayout?.lines && leftLayout?.lines ? (
              <>
                <GlyphPage
                  lines={rightLayout.lines}
                  selectedAyahId={mushaf.selectedAyahId}
                  isSaved={saved.isSaved}
                  onToggleSave={handleGlyphSave}
                  onWordClick={handleWordClick}
                  onWordKey={handleWordKey}
                />
                <GlyphPage
                  lines={leftLayout.lines}
                  selectedAyahId={mushaf.selectedAyahId}
                  isSaved={saved.isSaved}
                  onToggleSave={handleGlyphSave}
                  onWordClick={handleWordClick}
                  onWordKey={handleWordKey}
                />
              </>
            ) : (
              <GlyphPage
                lines={layout.lines}
                selectedAyahId={mushaf.selectedAyahId}
                isSaved={saved.isSaved}
                onToggleSave={handleGlyphSave}
                onWordClick={handleWordClick}
                onWordKey={handleWordKey}
              />
            )}
          </div>
        ) : (
          <AyatFlow
            ayahs={pageData.ayahs}
            selectedAyahId={mushaf.selectedAyahId}
            isSaved={saved.isSaved}
            onToggleSave={saved.toggle}
            onWordClick={handleWordClick}
            onWordKey={handleWordKey}
          />
        )}
        {morphTarget ? (
          <MorphPopover target={morphTarget} onClose={() => setMorphTarget(null)} />
        ) : null}
      </div>

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

function AyatFlow({
  ayahs,
  selectedAyahId,
  isSaved,
  onToggleSave,
  onWordClick,
  onWordKey,
}: {
  ayahs: QuranPageAyah[];
  selectedAyahId: number | null;
  isSaved: (ayahId: number) => boolean;
  onToggleSave: (ayah: QuranPageAyah) => void;
  onWordClick: (
    surah: number,
    ayah: number,
    position: number,
    word: string,
    event: React.MouseEvent,
    ayahText?: string,
  ) => void;
  onWordKey: (
    surah: number,
    ayah: number,
    position: number,
    word: string,
    element: HTMLElement,
    ayahText?: string,
  ) => void;
}) {
  const blocks: { surahId: number; surahName: string; ayahs: QuranPageAyah[] }[] = [];
  for (const ayah of ayahs) {
    const last = blocks[blocks.length - 1];
    if (last && last.surahId === ayah.surah_id) {
      last.ayahs.push(ayah);
    } else {
      blocks.push({ surahId: ayah.surah_id, surahName: ayah.surah, ayahs: [ayah] });
    }
  }

  return (
    <>
      {blocks.map((block, blockIndex) => {
        const firstAyah = block.ayahs[0];
        // Traditional mushaf: the surah header + basmala appear only at the
        // surah's actual start (ayah 1) — even mid-page — never repeated on
        // continuation pages. At-Tawbah (9) has no basmala; and when ayah 1's
        // text already IS the basmala (e.g. Hafs Al-Fatiha) we don't duplicate.
        const isSurahStart = firstAyah?.ayah === 1;
        const showBasmala =
          isSurahStart && block.surahId !== AT_TAWBAH_ID && !isBasmalaText(firstAyah?.text ?? "");
        return (
          <Fragment key={`${block.surahId}-${blockIndex}`}>
            {isSurahStart ? <SurahBanner surahName={block.surahName} /> : null}
            {showBasmala ? <BasmalaLine /> : null}
            <p className="qb-ayat-flow">
              {block.ayahs.map((ayah) => {
                const isSelected = ayah.is_selected || ayah.ayah_id === selectedAyahId;
                return (
                  <Fragment key={ayah.ayah_id}>
                    <span className={`qb-ayah-tok${isSelected ? " selected" : ""}`}>
                      {ayah.text
                        .trim()
                        .split(/\s+/)
                        .map((word, wordIndex) => (
                          <span
                            key={wordIndex}
                            className="qb-word"
                            role="button"
                            tabIndex={0}
                            aria-label={`تحليل الكلمة: ${word}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              onWordClick(ayah.surah_id, ayah.ayah, wordIndex + 1, word, event, ayah.text);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.stopPropagation();
                                onWordKey(ayah.surah_id, ayah.ayah, wordIndex + 1, word, event.currentTarget, ayah.text);
                              }
                            }}
                          >
                            {word}{" "}
                          </span>
                        ))}
                      <span className="qb-num-glyph">{`﴿${toArabicDigits(ayah.ayah)}﴾`}</span>
                      <button
                        type="button"
                        className={`qb-save-ayah${isSaved(ayah.ayah_id) ? " on" : ""}`}
                        aria-label={isSaved(ayah.ayah_id) ? "إزالة من الدفتر" : "حفظ في الدفتر"}
                        aria-pressed={isSaved(ayah.ayah_id)}
                        title={isSaved(ayah.ayah_id) ? "محفوظة في الدفتر" : "حفظ في الدفتر"}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleSave(ayah);
                        }}
                      >
                        <Icon name={isSaved(ayah.ayah_id) ? "bookmarkFilled" : "bookmark"} size={13} />
                      </button>
                    </span>
                    {/* inter-ayah space lives OUTSIDE the token so a selected
                        ayah's highlight/selection has no trailing space */}
                    {" "}
                  </Fragment>
                );
              })}
            </p>
          </Fragment>
        );
      })}
    </>
  );
}

function SurahBanner({ surahName }: { surahName: string }) {
  // Clean surah header: the name flanked by tapered gold rules — no bordered
  // ornaments. The basmala, when shown, is a separate line below (BasmalaLine).
  return (
    <div className="qb-surah-banner">
      <span className="rule" aria-hidden />
      <span className="name">سورة {surahName}</span>
      <span className="rule" aria-hidden />
    </div>
  );
}

function BasmalaLine() {
  return <div className="qb-basmala-line">{BASMALA}</div>;
}
