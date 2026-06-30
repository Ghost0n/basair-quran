"use client";

import { Fragment, useEffect, useRef, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { QuranPageAyah, SurahListItem } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";
import { toArabicDigits } from "@/lib/numerals";
import { ErrorState } from "@/components/error-state";
import { useWorkspace } from "@/features/shell/workspace-context";

import "./reading.css";

import { MushafHeader } from "./components/mushaf-header";
import { MushafFooter } from "./components/mushaf-footer";
import { MorphPopover, type MorphTarget } from "./components/morph-popover";
import { useMushaf } from "./mushaf-context";

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

export function MushafStage() {
  const { state } = useWorkspace();
  const mushaf = useMushaf();
  const selectedMushaf = state.selectedMushaf;

  const [surahs, setSurahs] = useState<SurahListItem[]>(surahCache ?? []);
  const [morphTarget, setMorphTarget] = useState<MorphTarget | null>(null);

  const mushafRef = useRef(selectedMushaf);
  const currentPageRef = useRef<number | null>(null);
  currentPageRef.current = mushaf.pageData?.page ?? null;

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

  // Initial page load — restores the last viewed page from localStorage.
  useEffect(() => {
    if (!mushaf.pageData && !mushaf.isLoading) {
      void mushaf.loadPage(selectedMushaf, mushaf.readLastPage(), { persist: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function handleWordClick(
    surah: number,
    ayah: number,
    position: number,
    word: string,
    event: React.MouseEvent,
  ) {
    const container = mushaf.bodyRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const top = event.clientY - rect.top + container.scrollTop + 22;
    const rawLeft = event.clientX - rect.left - 160;
    const left = Math.min(Math.max(rawLeft, 12), Math.max(rect.width - 332, 12));
    setMorphTarget({ surah, ayah, position, word, top, left });
  }

  // Keyboard path: anchor the popover off the focused word element instead of
  // a pointer position, so Enter/Space opens morphology without a mouse.
  function handleWordKey(
    surah: number,
    ayah: number,
    position: number,
    word: string,
    element: HTMLElement,
  ) {
    const container = mushaf.bodyRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const wordRect = element.getBoundingClientRect();
    const top = wordRect.bottom - rect.top + container.scrollTop + 6;
    const rawLeft = wordRect.left - rect.left + wordRect.width / 2 - 160;
    const left = Math.min(Math.max(rawLeft, 12), Math.max(rect.width - 332, 12));
    setMorphTarget({ surah, ayah, position, word, top, left });
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
    <div className="qb-mushaf-stage">
      <MushafHeader
        pageData={pageData}
        surahs={surahs}
        onJumpSurah={(surahId, ayah) => void mushaf.loadBySurah(selectedMushaf, surahId, ayah)}
        onJumpJuz={(juz) => void mushaf.loadByJuz(selectedMushaf, juz)}
      />

      <div
        className={`qb-mushaf-page${isLoading ? " is-loading" : ""}`}
        ref={mushaf.bodyRef}
        onClick={() => setMorphTarget(null)}
      >
        <AyatFlow
          ayahs={pageData.ayahs}
          selectedAyahId={mushaf.selectedAyahId}
          onWordClick={handleWordClick}
          onWordKey={handleWordKey}
        />
        {morphTarget ? (
          <MorphPopover target={morphTarget} onClose={() => setMorphTarget(null)} />
        ) : null}
      </div>

      <MushafFooter
        pageData={pageData}
        riwayahLabel={state.selectedMushafLabel || "—"}
        isLoading={isLoading}
        onPrev={() => pageData.page && void mushaf.loadPage(selectedMushaf, pageData.page - 1, { persist: true })}
        onNext={() => pageData.page && void mushaf.loadPage(selectedMushaf, pageData.page + 1, { persist: true })}
        onJumpPage={(targetPage) => void mushaf.loadPage(selectedMushaf, targetPage, { persist: true })}
      />
    </div>
  );
}

function AyatFlow({
  ayahs,
  selectedAyahId,
  onWordClick,
  onWordKey,
}: {
  ayahs: QuranPageAyah[];
  selectedAyahId: number | null;
  onWordClick: (
    surah: number,
    ayah: number,
    position: number,
    word: string,
    event: React.MouseEvent,
  ) => void;
  onWordKey: (
    surah: number,
    ayah: number,
    position: number,
    word: string,
    element: HTMLElement,
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
                              onWordClick(ayah.surah_id, ayah.ayah, wordIndex + 1, word, event);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.stopPropagation();
                                onWordKey(ayah.surah_id, ayah.ayah, wordIndex + 1, word, event.currentTarget);
                              }
                            }}
                          >
                            {word}{" "}
                          </span>
                        ))}
                      <span className="qb-num-glyph">{`﴿${toArabicDigits(ayah.ayah)}﴾`}</span>
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
