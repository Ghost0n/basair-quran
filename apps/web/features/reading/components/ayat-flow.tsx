"use client";

import { Fragment } from "react";

import type { QuranPageAyah } from "@q-basair/shared";

import { toArabicDigits } from "@/lib/numerals";
import { Icon } from "@/components/icon";

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

export type WordClickHandler = (
  surah: number,
  ayah: number,
  position: number,
  word: string,
  event: React.MouseEvent,
  ayahText?: string,
) => void;

export type WordKeyHandler = (
  surah: number,
  ayah: number,
  position: number,
  word: string,
  element: HTMLElement,
  ayahText?: string,
) => void;

/**
 * AyatFlow — the flowing Unicode mushaf: ayahs grouped into surah blocks with a
 * banner + basmala at each surah start, justified verse text with per-word
 * morphology triggers, an ayah-number glyph, and a save-to-library toggle.
 * Shared by the paged reader (one page) and the scroll reader (page after page).
 */
export function AyatFlow({
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
  onWordClick: WordClickHandler;
  onWordKey: WordKeyHandler;
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
