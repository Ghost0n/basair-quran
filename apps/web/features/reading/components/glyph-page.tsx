"use client";

import { Fragment } from "react";

import type { MushafLayoutLine, MushafLayoutGlyph } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { flyToNotebook } from "@/lib/fly-to-notebook";

// The basmala is rendered as compact, unambiguous Unicode text (in the display
// font) rather than the QCF "line-filling" ligature, which spreads its segments
// across the whole line and reads as disconnected.
const BASMALA_UNICODE = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";

// A normal Madani page is 15 lines; the framed opening pages (1, 2) and the
// final page have fewer. On those, a narrower column keeps the few words from
// spreading edge-to-edge.
const FULL_PAGE_LINES = 15;

type WordClick = (
  surah: number,
  ayah: number,
  position: number,
  word: string,
  event: React.MouseEvent,
  ayahText?: string,
) => void;

type WordKey = (
  surah: number,
  ayah: number,
  position: number,
  word: string,
  element: HTMLElement,
  ayahText?: string,
) => void;

/** Minimal ayah info emitted by the reader when saving from a word. */
export type GlyphSaveTarget = {
  ayahId: number;
  surahId: number;
  ayah: number;
  text: string;
};

/**
 * GlyphPage — the authentic line-faithful Madani (QCF) renderer.
 *
 * Each printed line is one row. Surah-name lines reuse the banner; the basmala
 * is compact Unicode; ayah lines are justified with `text-align-last: justify`
 * (native justification, like the simple reader) so the printed line-filling is
 * reproduced while a selected ayah can be highlighted as one continuous block
 * (consecutive selected words on a line are wrapped in a single background).
 *
 * Glyph strings are trusted, server-generated private-use codepoints (never user
 * input), so `dangerouslySetInnerHTML` is safe. Word interactions reuse the same
 * handlers as the simple reader with `word_position`, keeping morphology + ayah
 * selection coherent across both renderers.
 */
export function GlyphPage({
  lines,
  selectedAyahId,
  isSaved,
  onToggleSave,
  onWordClick,
  onWordKey,
}: {
  lines: MushafLayoutLine[];
  selectedAyahId: number | null;
  isSaved: (ayahId: number) => boolean;
  onToggleSave: (target: GlyphSaveTarget) => void;
  onWordClick: WordClick;
  onWordKey: WordKey;
}) {
  const isOpeningPage = lines.length < FULL_PAGE_LINES;

  // Per-ayah text (joined from the page's words) so the morphology lookup can
  // match the verse by skeleton — robust even where word tokenisation might
  // diverge from the Kufan source. Partial (page-straddling) ayāt simply fall
  // back to the (surah, ayah) number on the backend, which is correct for Hafs.
  const ayahTextById = new Map<number, string>();
  for (const line of lines) {
    for (const word of line.words ?? []) {
      const prev = ayahTextById.get(word.ayah_id);
      ayahTextById.set(word.ayah_id, prev ? `${prev} ${word.text ?? ""}` : word.text ?? "");
    }
  }

  // The last word of each ayah that COMPLETES on this page carries the end-of-
  // ayah marker (its glyph includes the number). We anchor a save toggle there,
  // mirroring the simple reader's bookmark after ﴿n﴾. A word is an ayah end when
  // the next word in reading order belongs to a different ayah — a trailing
  // ayah that spills onto the next page is intentionally left for that page.
  const ayahEndKeys = new Set<string | number>();
  const flat = lines.flatMap((line) => line.words ?? []);
  for (let i = 0; i < flat.length - 1; i++) {
    if (flat[i + 1].ayah_id !== flat[i].ayah_id) ayahEndKeys.add(flat[i].word_key);
  }

  const renderWord = (word: MushafLayoutGlyph) => {
    const glyph = (
      <span
        className="qb-glyph-word"
        role="button"
        // Roving focus: tabbing stops on the reader container, not each word.
        tabIndex={-1}
        aria-label={`تحليل الكلمة: ${word.text ?? ""}`}
        onClick={(event) => {
          event.stopPropagation();
          onWordClick(word.surah, word.ayah, word.word_position, word.text ?? "", event, ayahTextById.get(word.ayah_id));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onWordKey(word.surah, word.ayah, word.word_position, word.text ?? "", event.currentTarget, ayahTextById.get(word.ayah_id));
          }
        }}
        dangerouslySetInnerHTML={{ __html: word.glyph ?? "" }}
      />
    );

    if (!ayahEndKeys.has(word.word_key)) return <Fragment key={word.word_key}>{glyph}</Fragment>;

    const saved = isSaved(word.ayah_id);
    // The bookmark is absolutely positioned so it never changes the line's
    // intrinsic width (which the fit measurement relies on).
    return (
      <span key={word.word_key} className="qb-glyph-end">
        {glyph}
        <button
          type="button"
          className={`qb-glyph-save${saved ? " on" : ""}`}
          aria-label={saved ? "إزالة من الدفتر" : "حفظ في الدفتر"}
          aria-pressed={saved}
          title={saved ? "محفوظة في الدفتر" : "حفظ الآية في الدفتر"}
          onClick={(event) => {
            event.stopPropagation();
            if (!saved) flyToNotebook(event.currentTarget, ayahTextById.get(word.ayah_id) ?? word.text ?? "");
            onToggleSave({
              ayahId: word.ayah_id,
              surahId: word.surah,
              ayah: word.ayah,
              text: ayahTextById.get(word.ayah_id) ?? word.text ?? "",
            });
          }}
        >
          <Icon name={saved ? "bookmarkFilled" : "bookmark"} size={12} />
        </button>
      </span>
    );
  };

  return (
    <div className={`qb-glyph-page${isOpeningPage ? " is-opening" : ""}`}>
      {lines.map((line) => {
        if (line.line_type === "surah_name") {
          return (
            <div key={line.line_number} className="qb-surah-banner qb-glyph-banner">
              <span className="rule" aria-hidden />
              <span className="name">سورة {line.surah_name}</span>
              <span className="rule" aria-hidden />
            </div>
          );
        }

        if (line.line_type === "basmalah") {
          return (
            <div key={line.line_number} className="qb-glyph-line qb-glyph-basmala">
              {BASMALA_UNICODE}
            </div>
          );
        }

        const words = line.words ?? [];
        // Full Madani lines justify edge-to-edge; a genuinely partial trailing
        // line (1–3 words) flows naturally rather than stretching.
        const isFull = words.length >= 4;

        // Group consecutive words by selection so a selected ayah renders as one
        // continuous highlight block (covering the justified gaps), not per-word.
        const segments: { selected: boolean; words: MushafLayoutGlyph[] }[] = [];
        for (const word of words) {
          const selected = Boolean(word.is_selected) || word.ayah_id === selectedAyahId;
          const last = segments[segments.length - 1];
          if (last && last.selected === selected) last.words.push(word);
          else segments.push({ selected, words: [word] });
        }

        return (
          <div
            key={line.line_number}
            className={`qb-glyph-line qb-glyph-ayah${isFull ? "" : " short"}`}
            style={{ fontFamily: line.font_family ?? undefined }}
          >
            {segments.map((segment, segmentIndex) => {
              const inner = segment.words.map((word, wordIndex) => (
                <Fragment key={word.word_key}>
                  {renderWord(word)}
                  {wordIndex < segment.words.length - 1 ? " " : null}
                </Fragment>
              ));
              const node = segment.selected ? (
                <span className="qb-glyph-sel" data-ayah-id={segment.words[0]?.ayah_id}>
                  {inner}
                </span>
              ) : (
                inner
              );
              return (
                <Fragment key={segmentIndex}>
                  {node}
                  {segmentIndex < segments.length - 1 ? " " : null}
                </Fragment>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
