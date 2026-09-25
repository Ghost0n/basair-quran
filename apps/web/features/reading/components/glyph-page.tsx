"use client";

import { Fragment } from "react";

import type { MushafLayoutLine, MushafLayoutGlyph } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { useAyahMarks, highlightProps, type AyahMark } from "@/features/themes/ayah-marks";
import { usePickedWords, wordKey } from "@/features/reading/tools/word-selection";
import { flyToNotebook } from "@/lib/fly-to-notebook";

import { t } from "@/lib/i18n";

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
  page,
  lines,
  selectedAyahId,
  isSaved,
  onToggleSave,
  onWordClick,
  onWordKey,
}: {
  /** The printed page number (tools read it from `data-page` for page-scoped counts). */
  page?: number;
  lines: MushafLayoutLine[];
  selectedAyahId: number | null;
  isSaved: (ayahId: number) => boolean;
  onToggleSave: (target: GlyphSaveTarget) => void;
  onWordClick: WordClick;
  onWordKey: WordKey;
}) {
  const isOpeningPage = lines.length < FULL_PAGE_LINES;
  const markOf = useAyahMarks();
  const isPicked = usePickedWords();

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
    // Ayah-number ornaments / page-straddle fragments carry a glyph but no
    // analyzable word text. Render them as decorative — no role/label/tabstop,
    // and NOT `.qb-glyph-word` so roving word-nav skips them — instead of
    // shipping a bare "button: تحليل الكلمة:" to the accessibility tree.
    if (!(word.text ?? "").trim()) {
      return (
        <Fragment key={word.word_key}>
          <span className="qb-glyph-mark" aria-hidden dangerouslySetInnerHTML={{ __html: word.glyph ?? "" }} />
        </Fragment>
      );
    }

    const wk = wordKey(word.surah, word.ayah, word.word_position);
    const glyph = (
      <span
        className={`qb-glyph-word${isPicked(wk) ? " qb-word-picked" : ""}`}
        data-wk={wk}
        data-aid={word.ayah_id}
        // Roving focus: tabbing stops on the reader container, not each word. No
        // role=button + "analyze the word" label (a screen reader would announce
        // a stream of buttons). The QCF codepoints are private-use, so the glyph
        // itself is aria-hidden and the REAL word is exposed as sr-only text; the
        // analyze action is described once via the shared #qb-word-hint.
        tabIndex={-1}
        aria-describedby="qb-word-hint"
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
      >
        <span aria-hidden dangerouslySetInnerHTML={{ __html: word.glyph ?? "" }} />
        <span className="qb-sr-only">{word.text}</span>
      </span>
    );

    if (!ayahEndKeys.has(word.word_key)) return <Fragment key={word.word_key}>{glyph}</Fragment>;

    const saved = isSaved(word.ayah_id);
    const mark = markOf(word.ayah_id);
    // The bookmark is absolutely positioned so it never changes the line's
    // intrinsic width (which the fit measurement relies on).
    return (
      <span key={word.word_key} className="qb-glyph-end">
        {glyph}
        <button
          type="button"
          className={`qb-glyph-save${saved ? " on" : ""}${mark && mark.themes > 1 ? " multi" : ""}`}
          data-hl={mark?.color ?? undefined}
          aria-label={saved ? t("المواضيع والحفظ") : t("حفظ في الدفتر")}
          aria-haspopup="dialog"
          title={saved ? t("محفوظة — المواضيع") : t("حفظ الآية وتظليلها")}
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
    <div className={`qb-glyph-page${isOpeningPage ? " is-opening" : ""}`} data-page={page}>
      {lines.map((line) => {
        if (line.line_type === "surah_name") {
          return (
            <div key={line.line_number} className="qb-surah-banner qb-glyph-banner">
              <span className="rule" aria-hidden />
              <span className="name">{t("سورة")} {line.surah_name}</span>
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

        // Group consecutive words by selection / theme highlight so a marked ayah
        // renders as one continuous block (covering the justified gaps), not
        // per-word. Selection wins over a theme colour.
        const segments: { selected: boolean; mark: AyahMark; key: string; words: MushafLayoutGlyph[] }[] = [];
        for (const word of words) {
          const selected = Boolean(word.is_selected) || word.ayah_id === selectedAyahId;
          const mark = selected ? null : markOf(word.ayah_id);
          const key = selected ? "sel" : mark?.color ? `hl:${word.ayah_id}` : "";
          const last = segments[segments.length - 1];
          if (last && last.key === key) last.words.push(word);
          else segments.push({ selected, mark, key, words: [word] });
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
              const highlight = highlightProps(segment.mark);
              const node = segment.selected ? (
                <span className="qb-glyph-sel" data-ayah-id={segment.words[0]?.ayah_id}>
                  {inner}
                </span>
              ) : highlight.className ? (
                <span className={`qb-glyph-hl${highlight.className}`} data-hl={highlight["data-hl"]}>
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

/**
 * GlyphAyah — one ayah rendered as authentic QCF glyph words in a flowing row,
 * for the ayah-by-ayah reader (Ḥafṣ + authentic). Mirrors GlyphPage's word
 * treatment: the private-use glyph is aria-hidden and the real word is sr-only
 * (a screen reader reads Arabic, not gibberish), words are roving-focusable and
 * open morphology, and an inline save toggle sits at the ayah end. Words come
 * from the page layout grouped by `ayah_id`; the size follows `--fs-ayah` (the
 * slider drives it directly here — there is no page-fit to normalise it away).
 */
export function GlyphAyah({
  words,
  fontFamily,
  isSelected,
  isSaved,
  onToggleSave,
  onWordClick,
  onWordKey,
  ayahText,
  save,
}: {
  words: MushafLayoutGlyph[];
  fontFamily?: string | null;
  isSelected: boolean;
  isSaved: (ayahId: number) => boolean;
  onToggleSave: (target: GlyphSaveTarget) => void;
  onWordClick: WordClick;
  onWordKey: WordKey;
  ayahText: string;
  save: GlyphSaveTarget;
}) {
  const saved = isSaved(save.ayahId);
  const mark = useAyahMarks()(save.ayahId);
  const isPicked = usePickedWords();
  const highlight = isSelected ? { className: "" } : highlightProps(mark);
  return (
    <span
      className={`qb-glyph-ayah-row${isSelected ? " qb-glyph-sel" : ""}${highlight.className}`}
      data-hl={highlight["data-hl"]}
      data-ayah-id={save.ayahId}
      style={{ fontFamily: fontFamily ?? undefined }}
    >
      {words.map((word) => {
        // Ayah-number ornaments / straddle fragments carry a glyph but no word.
        if (!(word.text ?? "").trim()) {
          return (
            <span key={word.word_key} className="qb-glyph-mark" aria-hidden dangerouslySetInnerHTML={{ __html: word.glyph ?? "" }} />
          );
        }
        return (
          <span
            key={word.word_key}
            className={`qb-glyph-word${isPicked(wordKey(word.surah, word.ayah, word.word_position)) ? " qb-word-picked" : ""}`}
            data-wk={wordKey(word.surah, word.ayah, word.word_position)}
            data-aid={word.ayah_id}
            tabIndex={-1}
            aria-describedby="qb-word-hint"
            onClick={(event) => {
              event.stopPropagation();
              onWordClick(word.surah, word.ayah, word.word_position, word.text ?? "", event, ayahText);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onWordKey(word.surah, word.ayah, word.word_position, word.text ?? "", event.currentTarget, ayahText);
              }
            }}
          >
            <span aria-hidden dangerouslySetInnerHTML={{ __html: word.glyph ?? "" }} />
            <span className="qb-sr-only">{word.text}</span>
            {" "}
          </span>
        );
      })}
      <button
        type="button"
        className={`qb-save-ayah${saved ? " on" : ""}${mark && mark.themes > 1 ? " multi" : ""}`}
        data-hl={mark?.color ?? undefined}
        aria-label={saved ? t("المواضيع والحفظ") : t("حفظ في الدفتر")}
        aria-haspopup="dialog"
        title={saved ? t("محفوظة — المواضيع") : t("حفظ الآية وتظليلها")}
        onClick={(event) => {
          event.stopPropagation();
          if (!saved) flyToNotebook(event.currentTarget, save.text);
          onToggleSave(save);
        }}
      >
        <Icon name={saved ? "bookmarkFilled" : "bookmark"} size={13} />
      </button>
    </span>
  );
}
