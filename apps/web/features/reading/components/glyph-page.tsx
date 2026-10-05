"use client";

import { Fragment } from "react";

import type { MushafLayoutLine, MushafLayoutGlyph } from "@q-basair/shared";

import { useAyahMarks, highlightProps, type AyahMark } from "@/features/themes/ayah-marks";
import { usePageRibbons } from "@/features/reading/use-saved-pages";
import { VerseOutlines } from "@/features/reading/components/verse-outlines";
import { usePickedWords, useVerseFocus, verseFocusClass, wordKey, type VerseFocus } from "@/features/reading/tools/word-selection";

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

const AYAH_NUMBER_END = /[0-9٠-٩۰-۹]+\s*$/;

/**
 * The last word of an ayah carries the verse-number ornament in its own glyph
 * string ("word␠ornament"). Split it so the ornament can be the verse's handle;
 * the characters (and so the line's measured width) are unchanged.
 */
export function splitAyahEnd(word: MushafLayoutGlyph): { glyph: string; mark: string | null } {
  const glyph = word.glyph ?? "";
  const cut = glyph.lastIndexOf(" ");
  if (cut <= 0 || !AYAH_NUMBER_END.test(word.text ?? "")) return { glyph, mark: null };
  return { glyph: glyph.slice(0, cut), mark: glyph.slice(cut + 1) };
}

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
  onToggleSave,
  onWordClick,
  onWordKey,
}: {
  /** The printed page number (tools read it from `data-page` for page-scoped counts). */
  page?: number;
  lines: MushafLayoutLine[];
  selectedAyahId: number | null;
  isSaved?: (ayahId: number) => boolean;
  /** The verse-number ornament was tapped: act on the whole ayah. */
  onToggleSave: (target: GlyphSaveTarget) => void;
  onWordClick: WordClick;
  onWordKey: WordKey;
}) {
  const isOpeningPage = lines.length < FULL_PAGE_LINES;
  const markOf = useAyahMarks();
  const isPicked = usePickedWords();
  const focusOf = useVerseFocus();
  const ribbons = usePageRibbons();
  const pageSurah = lines.find((line) => line.words?.length)?.words?.[0]?.surah ?? null;

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

  const renderWord = (word: MushafLayoutGlyph) => {
    // Ayah-number ornaments / page-straddle fragments carry a glyph but no
    // analyzable word text — NOT `.qb-glyph-word`, so roving word-nav skips
    // them. The ornament is the verse's own handle: a tap acts on the whole
    // ayah (select it, or save/highlight it — per the active tool).
    if (!(word.text ?? "").trim()) {
      return (
        <VerseMark
          key={word.word_key}
          glyph={word.glyph ?? ""}
          label={word.ayah}
          ayahId={word.ayah_id}
          onActivate={() =>
            onToggleSave({ ayahId: word.ayah_id, surahId: word.surah, ayah: word.ayah, text: ayahTextById.get(word.ayah_id) ?? "" })
          }
        />
      );
    }

    const wk = wordKey(word.surah, word.ayah, word.word_position);
    const split = splitAyahEnd(word);
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
        <span aria-hidden dangerouslySetInnerHTML={{ __html: split.glyph }} />
        <span className="qb-sr-only">{word.text}</span>
      </span>
    );

    if (split.mark === null) return <Fragment key={word.word_key}>{glyph}</Fragment>;
    return (
      <Fragment key={word.word_key}>
        {glyph}{" "}
        <VerseMark
          glyph={split.mark}
          label={word.ayah}
          ayahId={word.ayah_id}
          onActivate={() =>
            onToggleSave({ ayahId: word.ayah_id, surahId: word.surah, ayah: word.ayah, text: ayahTextById.get(word.ayah_id) ?? "" })
          }
        />
      </Fragment>
    );
  };

  return (
    <div className={`qb-glyph-page${isOpeningPage ? " is-opening" : ""}${ribbons.enabled ? " has-ribbon" : ""}`} data-page={page}>
      <PageRibbon page={page} surahId={pageSurah} />
      <VerseOutlines />
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
        // A «تظليل» focus/hover wins over both (it is what the reader acts on).
        const segments: { selected: boolean; focus: VerseFocus; mark: AyahMark; key: string; words: MushafLayoutGlyph[] }[] = [];
        for (const word of words) {
          const focus = focusOf(word.ayah_id);
          const selected = !focus && (Boolean(word.is_selected) || word.ayah_id === selectedAyahId);
          const mark = selected || focus ? null : markOf(word.ayah_id);
          const key = focus ? `vf:${focus}:${word.ayah_id}` : selected ? "sel" : mark?.color ? `hl:${word.ayah_id}` : "";
          const last = segments[segments.length - 1];
          if (last && last.key === key) last.words.push(word);
          else segments.push({ selected, focus, mark, key, words: [word] });
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
              const node = segment.focus ? (
                <span className={`qb-glyph-vf${verseFocusClass(segment.focus)}`} data-aid={segment.words[0]?.ayah_id} data-vf={segment.words[0]?.ayah_id}>
                  {inner}
                </span>
              ) : segment.selected ? (
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
 * Desktop: the page's ribbon at its upper-left corner — an outline on an
 * unsaved page, red on a saved one; a click saves / unsaves the page. Absent
 * on phones (they bookmark from the floating button beside the reader bar).
 */
export function PageRibbon({ page, surahId }: { page: number | null | undefined; surahId: number | null }) {
  const ribbons = usePageRibbons();
  if (!ribbons.enabled || page == null) return null;
  const saved = ribbons.isSaved(page);
  const label = saved ? t("إزالة الصفحة من المحفوظات") : t("احفظ هذه الصفحة");
  return (
    <button
      type="button"
      className={`qb-page-ribbon${saved ? " on" : ""}`}
      aria-pressed={saved}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        ribbons.toggle(page, surahId);
      }}
    >
      <svg viewBox="0 0 16 24" width="13" height="20" aria-hidden>
        <path d="M1.5 0.5h13v21l-6.5-4.6-6.5 4.6z" />
      </svg>
    </button>
  );
}

/**
 * The ayah-number ornament as the verse's handle (a tap acts on the whole
 * ayah). Pointer-only inside the text flow — keyboard users reach verses
 * through the word navigation — so it adds no tab stop.
 */
export function VerseMark({
  glyph,
  text,
  label,
  ayahId,
  className = "qb-glyph-mark",
  onActivate,
}: {
  glyph?: string;
  text?: string;
  label: number;
  /** The verse's id (lets a hover over the number light the whole verse). */
  ayahId?: number;
  className?: string;
  onActivate: () => void;
}) {
  return (
    <span
      className={`${className} qb-verse-mark`}
      data-aid={ayahId}
      role="button"
      aria-label={t("الآية {0}", { 0: label })}
      title={t("الآية كاملة")}
      onClick={(event) => {
        event.stopPropagation();
        onActivate();
      }}
      {...(glyph ? { dangerouslySetInnerHTML: { __html: glyph } } : { children: text })}
    />
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
  onToggleSave,
  onWordClick,
  onWordKey,
  ayahText,
  save,
}: {
  words: MushafLayoutGlyph[];
  fontFamily?: string | null;
  isSelected: boolean;
  isSaved?: (ayahId: number) => boolean;
  onToggleSave: (target: GlyphSaveTarget) => void;
  onWordClick: WordClick;
  onWordKey: WordKey;
  ayahText: string;
  save: GlyphSaveTarget;
}) {
  const mark = useAyahMarks()(save.ayahId);
  const isPicked = usePickedWords();
  const focus = useVerseFocus()(save.ayahId);
  const highlight = isSelected || focus ? { className: "" } : highlightProps(mark);
  return (
    <span
      className={`qb-glyph-ayah-row${isSelected && !focus ? " qb-glyph-sel" : ""}${highlight.className}${verseFocusClass(focus)}`}
      data-hl={highlight["data-hl"]}
      data-ayah-id={save.ayahId}
      data-vf={focus ? save.ayahId : undefined}
      style={{ fontFamily: fontFamily ?? undefined }}
    >
      {words.map((word) => {
        // Ayah-number ornaments / straddle fragments carry a glyph but no word.
        if (!(word.text ?? "").trim()) {
          return <VerseMark key={word.word_key} glyph={word.glyph ?? ""} label={save.ayah} ayahId={save.ayahId} onActivate={() => onToggleSave(save)} />;
        }
        const split = splitAyahEnd(word);
        return (
          <Fragment key={word.word_key}>
          <span
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
            <span aria-hidden dangerouslySetInnerHTML={{ __html: split.glyph }} />
            <span className="qb-sr-only">{word.text}</span>
            {" "}
          </span>
          {split.mark !== null ? <VerseMark glyph={split.mark} label={save.ayah} ayahId={save.ayahId} onActivate={() => onToggleSave(save)} /> : null}
          </Fragment>
        );
      })}
    </span>
  );
}
