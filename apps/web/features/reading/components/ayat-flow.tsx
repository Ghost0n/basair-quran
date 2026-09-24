"use client";

import { Fragment } from "react";

import type { QuranPageAyah } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { highlightProps, useAyahMarks } from "@/features/themes/ayah-marks";
import { flyToNotebook } from "@/lib/fly-to-notebook";
import { useNumerals } from "@/lib/preferences-context";

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

/** Whether a standalone basmala line should precede this ayah (a surah start,
 *  not At-Tawbah, and its ayah text isn't itself the basmala). */
export function basmalaVisibleFor(ayah: QuranPageAyah): boolean {
  return ayah.ayah === 1 && ayah.surah_id !== AT_TAWBAH_ID && !isBasmalaText(ayah.text);
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

type AyahTokensProps = {
  ayah: QuranPageAyah;
  selectedAyahId: number | null;
  isSaved: (ayahId: number) => boolean;
  onToggleSave: (ayah: QuranPageAyah) => void;
  onWordClick: WordClickHandler;
  onWordKey: WordKeyHandler;
  /** Show the trailing ﴿N﴾ marker (the ayah reader uses its own leading chip). */
  showNumber?: boolean;
};

/**
 * AyahTokens — one ayah rendered as clickable word spans (each opening
 * morphology), the ayah-number glyph, and a save-to-library toggle. Selection
 * puts `.qb-ayah-tok.selected` on the wrapper (also the scroll-into-view hook's
 * target). Shared by the flowing reader and the ayah-by-ayah reader.
 */
export function AyahTokens({
  ayah,
  selectedAyahId,
  isSaved,
  onToggleSave,
  onWordClick,
  onWordKey,
  showNumber = true,
}: AyahTokensProps) {
  const formatNumber = useNumerals();
  const isSelected = ayah.is_selected || ayah.ayah_id === selectedAyahId;
  const mark = useAyahMarks()(ayah.ayah_id);
  const highlight = isSelected ? { className: "" } : highlightProps(mark);
  return (
    <span
      className={`qb-ayah-tok${isSelected ? " selected" : ""}${highlight.className}`}
      data-hl={highlight["data-hl"]}
      data-ayah-id={ayah.ayah_id}
      // The ayah is a readable unit: a screen reader announces "آية" and then
      // reads the verse as prose (the words below are plain text, not buttons).
      role="group"
      aria-roledescription="آية"
    >
      {ayah.text
        .trim()
        .split(/\s+/)
        // Drop empty tokens: an entirely blank ayah would otherwise emit a bare
        // word with no name in the accessibility tree.
        .filter((word) => word.length > 0)
        .map((word, wordIndex) => (
          <span
            key={wordIndex}
            className="qb-word"
            // Roving focus: words are focusable but not tabbable — the reader
            // container is the tab stop and arrows walk words (useWordNav). No
            // role=button + "analyze the word" label: that made a screen reader
            // announce a stream of buttons instead of the verse as prose. The
            // word is now plain text named by itself; the analyze action is
            // described once via the shared #qb-word-hint.
            tabIndex={-1}
            aria-describedby="qb-word-hint"
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
      {showNumber ? <span className="qb-num-glyph">{`﴿${formatNumber(ayah.ayah)}﴾`}</span> : null}
      <button
        type="button"
        className={`qb-save-ayah${isSaved(ayah.ayah_id) ? " on" : ""}${mark && mark.themes > 1 ? " multi" : ""}`}
        data-hl={mark?.color ?? undefined}
        aria-label={isSaved(ayah.ayah_id) ? "المواضيع والحفظ" : "حفظ في الدفتر"}
        aria-haspopup="dialog"
        title={isSaved(ayah.ayah_id) ? "محفوظة — المواضيع" : "حفظ الآية وتظليلها"}
        onClick={(event) => {
          event.stopPropagation();
          // Ghost flight to the notebook only on SAVE (not un-save).
          if (!isSaved(ayah.ayah_id)) flyToNotebook(event.currentTarget, ayah.text.trim());
          onToggleSave(ayah);
        }}
      >
        <Icon name={isSaved(ayah.ayah_id) ? "bookmarkFilled" : "bookmark"} size={13} />
      </button>
    </span>
  );
}

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
        // continuation pages.
        const isSurahStart = firstAyah?.ayah === 1;
        const showBasmala = Boolean(firstAyah) && basmalaVisibleFor(firstAyah);
        return (
          <Fragment key={`${block.surahId}-${blockIndex}`}>
            {isSurahStart ? <SurahBanner surahName={block.surahName} /> : null}
            {showBasmala ? <BasmalaLine /> : null}
            <p className="qb-ayat-flow">
              {block.ayahs.map((ayah) => (
                <Fragment key={ayah.ayah_id}>
                  <AyahTokens
                    ayah={ayah}
                    selectedAyahId={selectedAyahId}
                    isSaved={isSaved}
                    onToggleSave={onToggleSave}
                    onWordClick={onWordClick}
                    onWordKey={onWordKey}
                  />
                  {/* inter-ayah space lives OUTSIDE the token so a selected
                      ayah's highlight/selection has no trailing space */}
                  {" "}
                </Fragment>
              ))}
            </p>
          </Fragment>
        );
      })}
    </>
  );
}

export function SurahBanner({ surahName }: { surahName: string }) {
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

export function BasmalaLine() {
  return <div className="qb-basmala-line">{BASMALA}</div>;
}
