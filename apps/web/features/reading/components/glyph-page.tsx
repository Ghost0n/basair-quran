"use client";

import { Fragment, useRef } from "react";

import type { MushafLayoutLine, MushafLayoutGlyph } from "@q-basair/shared";

import { useGlyphFit } from "../use-glyph-fit";

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
  onWordClick,
  onWordKey,
}: {
  lines: MushafLayoutLine[];
  selectedAyahId: number | null;
  onWordClick: WordClick;
  onWordKey: WordKey;
}) {
  const isOpeningPage = lines.length < FULL_PAGE_LINES;

  // Scale the font down so every printed line stays on one visual line, however
  // narrow the viewport gets (fit-to-width). Re-measures when the page changes.
  const pageRef = useRef<HTMLDivElement | null>(null);
  useGlyphFit(pageRef, [lines]);

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

  const renderWord = (word: MushafLayoutGlyph) => (
    <span
      key={word.word_key}
      className="qb-glyph-word"
      role="button"
      tabIndex={0}
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

  return (
    <div ref={pageRef} className={`qb-glyph-page${isOpeningPage ? " is-opening" : ""}`}>
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
                <span className="qb-glyph-sel">{inner}</span>
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
