"use client";

import { Fragment, useMemo, type CSSProperties } from "react";

import type { MushafLayoutGlyph, MushafLayoutLine, MushafPageLayoutResponse } from "@q-basair/shared";

import { useAyahMarks, highlightProps, type AyahMark } from "@/features/themes/ayah-marks";
import { usePageRibbons } from "@/features/reading/use-saved-pages";
import { VerseOutlines } from "@/features/reading/components/verse-outlines";
import { usePickedWords, useVerseFocus, verseFocusClass, wordKey, type VerseFocus } from "@/features/reading/tools/word-selection";
import { isGlyphFontReady } from "@/features/reading/qcf-font-loader";
import { JUZ_STARTS } from "@/lib/quran-divisions.generated";
import { toArabicDigits } from "@/lib/numerals";

import { t } from "@/lib/i18n";

// The basmala when the QCF_BSML font is unavailable: compact Unicode text in
// the display font.
const BASMALA_UNICODE = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";

// QCF_BSML codepoints (King Fahd Complex QCF V1 ligature font, shipped with
// the page fonts as bsml.woff2).
const BSML_SURAH_WORD = "\uFB8C"; // سُورَةُ
const BSML_FRAME = "\uFC20"; // the surah title's ornamental frame (≈8em wide)
const BSML_BASMALA = "\uFC21"; // the calligraphic basmala (≈6.4em wide)

/** Calligraphic surah-name glyph (QCF_BSML): 1–37 from U+FB8D, 38–114 from U+FBD3. */
export function surahNameGlyph(surah: number): string {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) return "";
  return String.fromCharCode(surah <= 37 ? 0xfb8d + surah - 1 : 0xfbd3 + surah - 38);
}

// The running head names the juz the way the printed page does.
// i18n-ignore — the printed page's own furniture stays Arabic in every language.
const JUZ_ORDINALS = [
  "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر",
  "الحادي عشر", "الثاني عشر", "الثالث عشر", "الرابع عشر", "الخامس عشر", "السادس عشر", "السابع عشر",
  "الثامن عشر", "التاسع عشر", "العشرون", "الحادي والعشرون", "الثاني والعشرون", "الثالث والعشرون",
  "الرابع والعشرون", "الخامس والعشرون", "السادس والعشرون", "السابع والعشرون", "الثامن والعشرون",
  "التاسع والعشرون", "الثلاثون",
];

/** The running head's juz line, e.g. «الجزء الأول». */
export function juzHeading(juz: number): string {
  // i18n-ignore — printed furniture (see JUZ_ORDINALS).
  return juz >= 1 && juz <= 30 ? `الجزء ${JUZ_ORDINALS[juz - 1]}` : "";
}

/** The running head's surah line, e.g. «سورة البقرة». */
export function surahHeading(name: string | null | undefined): string {
  // i18n-ignore — printed furniture (see JUZ_ORDINALS).
  return name ? `سورة ${name}` : "";
}

/** The juz an ayah falls in (from the generated juz starts). */
export function juzOf(surah: number, ayah: number): number {
  let juz = 1;
  JUZ_STARTS.forEach(([s, a], index) => {
    if (surah > s || (surah === s && ayah >= a)) juz = index + 1;
  });
  return juz;
}

/** The last page of the mushaf (its final line closes a surah with no title after it). */
const LAST_PAGE = 604;

/** A printed Madani page has 15 lines (the opening pages 1–2 fewer). */
const FULL_PAGE_LINES = 15;

/**
 * A line that closes a surah is centred at its natural width when it is
 * narrower than this share of the page's widest line (e.g. pages 603–604);
 * every other line justifies, however loosely the print spaces it.
 */
export const SHORT_LINE_RATIO = 0.88;

let measureContext: CanvasRenderingContext2D | null = null;

/** Natural width of a glyph run, in ems of its page font (the font must be loaded). */
function measureEm(text: string, family: string): number {
  if (typeof document === "undefined" || !family) return 0;
  measureContext ??= document.createElement("canvas").getContext("2d");
  if (!measureContext) return 0;
  measureContext.font = `100px "${family}"`;
  return measureContext.measureText(text).width / 100;
}

const lineGlyphs = (line: MushafLayoutLine) => (line.words ?? []).map((word) => word.glyph ?? "").join(" ");

/**
 * Each ayah line's natural width (in ems) and the page's widest: the type size
 * is set so that the widest line fills the measure exactly, as in the print.
 */
export function measurePage(lines: MushafLayoutLine[], measure = measureEm): { widths: number[]; maxEm: number } {
  const widths = lines.map((line) => (line.line_type === "ayah" ? measure(lineGlyphs(line), line.font_family ?? "") : 0));
  return { widths, maxEm: Math.max(1, ...widths) };
}

/** Whether an ayah line is a surah's short closing line, centred rather than justified. */
export function isCenteredLine(
  lines: MushafLayoutLine[],
  index: number,
  widths: number[],
  maxEm: number,
  page: number,
): boolean {
  const line = lines[index];
  if (line.is_centered) return true;
  const next = lines[index + 1];
  const closesSurah = next ? next.line_type === "surah_name" : page === LAST_PAGE;
  return closesSurah && widths[index] > 0 && widths[index] < maxEm * SHORT_LINE_RATIO;
}

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
 * GlyphPage — the authentic Madani page, laid out like the printed King Fahd
 * mushaf (its drawn borders aside):
 *   - a fixed grid of 15 lines (pages 1–2: their few lines, centred in an
 *     inset column like the printed opening);
 *   - the type size set per page from the widest line's measured glyph width,
 *     so that line fills the measure exactly; the other lines justify word to
 *     word, and a surah's short closing line is centred at its natural width;
 *   - surah titles in the QCF_BSML ornamental frame with the calligraphic
 *     surah name, and the calligraphic basmala;
 *   - the running head (juz, surah) and the page number in the margins.
 * The page's size comes from the reading area (CSS container units, see
 * reading.css «Printed page»); everything inside scales with it.
 *
 * Interaction is unchanged: consecutive selected / highlighted / lit words of
 * a line are wrapped in one span so a marked ayah reads as one block; words
 * open morphology; the verse-number ornament acts on the whole ayah.
 *
 * Glyph strings are trusted, server-generated private-use codepoints (never user
 * input), so `dangerouslySetInnerHTML` is safe.
 */
export function GlyphPage({
  layout,
  selectedAyahId,
  onToggleSave,
  onWordClick,
  onWordKey,
}: {
  layout: MushafPageLayoutResponse;
  selectedAyahId: number | null;
  isSaved?: (ayahId: number) => boolean;
  /** The verse-number ornament was tapped: act on the whole ayah. */
  onToggleSave: (target: GlyphSaveTarget) => void;
  onWordClick: WordClick;
  onWordKey: WordKey;
}) {
  const lines = useMemo(() => layout.lines ?? [], [layout]);
  const page = layout.page ?? 0;
  const isOpeningPage = page >= 1 && page <= 2;
  const markOf = useAyahMarks();
  const isPicked = usePickedWords();
  const focusOf = useVerseFocus();
  const ribbons = usePageRibbons();
  // The layout only arrives once its page font is loaded, so it can be measured now.
  const measured = useMemo(() => measurePage(lines), [lines]);
  const calligraphy = isGlyphFontReady(layout.font_base_path ?? "", "qcf-bsml");
  const firstWord = lines.find((line) => line.words?.length)?.words?.[0];
  const pageSurah = firstWord?.surah ?? null;
  const juz = firstWord ? juzOf(firstWord.surah, firstWord.ayah) : null;
  const headSurah = layout.surahs?.[0]?.name ?? null;

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
    <div
      className={`qb-glyph-page qb-print-page${isOpeningPage ? " is-opening" : ""}${ribbons.enabled ? " has-ribbon" : ""}`}
      data-page={page}
      style={{ "--rows": isOpeningPage ? lines.length : FULL_PAGE_LINES, "--fit": measured.maxEm } as CSSProperties}
    >
      <PageRibbon page={page} surahId={pageSurah} />
      <VerseOutlines />
      {!isOpeningPage ? (
        <div className="qb-print-head" aria-hidden="true">
          <span>{juz ? juzHeading(juz) : null}</span>
          <span className="surah">{surahHeading(headSurah)}</span>
        </div>
      ) : null}
      <div className="qb-print-block">
        {lines.map((line, index) => {
          if (line.line_type === "surah_name") {
            return <SurahTitle key={line.line_number} surah={line.surah_number} name={line.surah_name} calligraphy={calligraphy} />;
          }

          if (line.line_type === "basmalah") {
            return calligraphy ? (
              <div key={line.line_number} className="qb-print-row qb-print-basmala" role="img" aria-label={BASMALA_UNICODE}>
                <span aria-hidden="true">{BSML_BASMALA}</span>
              </div>
            ) : (
              <div key={line.line_number} className="qb-print-row qb-print-basmala is-text">
                {BASMALA_UNICODE}
              </div>
            );
          }

          const words = line.words ?? [];
          const centered = isCenteredLine(lines, index, measured.widths, measured.maxEm, page);

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
              className={`qb-print-row qb-glyph-line qb-glyph-ayah${centered ? " is-centered" : ""}`}
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
                  <span className="qb-glyph-sel" data-ayah-id={segment.words[0]?.ayah_id} data-vf={segment.words[0]?.ayah_id}>
                    {inner}
                  </span>
                ) : highlight.className ? (
                  <span className={`qb-glyph-hl${highlight.className}`} data-hl={highlight["data-hl"]} data-vf={segment.words[0]?.ayah_id}>
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
      <div className="qb-print-folio" aria-hidden="true">
        {page ? toArabicDigits(page) : null}
      </div>
    </div>
  );
}

/** A surah title: the QCF_BSML ornamental frame with the calligraphic name inside. */
function SurahTitle({
  surah,
  name,
  calligraphy,
}: {
  surah: number | null | undefined;
  name: string | null | undefined;
  calligraphy: boolean;
}) {
  const label = `${t("سورة")} ${name ?? surah ?? ""}`;
  if (!calligraphy) {
    return (
      <div className="qb-print-row qb-print-title is-text" role="heading" aria-level={2}>
        <span className="name">{label}</span>
      </div>
    );
  }
  return (
    <div className="qb-print-row qb-print-title" role="heading" aria-level={2} aria-label={label}>
      <span className="frame" aria-hidden="true">
        {BSML_FRAME}
      </span>
      <span className="name" aria-hidden="true">
        <span>{BSML_SURAH_WORD}</span>
        <span>{surahNameGlyph(surah ?? 0)}</span>
      </span>
    </div>
  );
}

/**
 * Verse by verse: a surah's opening drawn as on the printed page — the framed
 * calligraphic title, then the calligraphic basmala when the surah has one.
 */
export function PrintSurahHead({
  surah,
  name,
  basmala,
  fontBasePath,
}: {
  surah: number;
  name: string;
  basmala: boolean;
  fontBasePath: string;
}) {
  const calligraphy = isGlyphFontReady(fontBasePath, "qcf-bsml");
  return (
    <div className="qb-ayah-print-head">
      <SurahTitle surah={surah} name={name} calligraphy={calligraphy} />
      {basmala ? (
        calligraphy ? (
          <div className="qb-print-row qb-print-basmala" role="img" aria-label={BASMALA_UNICODE}>
            <span aria-hidden="true">{BSML_BASMALA}</span>
          </div>
        ) : (
          <div className="qb-print-row qb-print-basmala is-text">{BASMALA_UNICODE}</div>
        )
      ) : null}
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
      data-vf={focus || isSelected || highlight["data-hl"] ? save.ayahId : undefined}
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
