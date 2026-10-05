"use client";

import { useEffect, useMemo, useState } from "react";

import type { MushafLayoutGlyph, MushafLayoutLine, MushafPageLayoutResponse } from "@q-basair/shared";

import { JUZ_STARTS } from "@/lib/quran-divisions.generated";
import { toArabicDigits } from "@/lib/numerals";
import { t } from "@/lib/i18n";

import { loadGlyphFont } from "../qcf-font-loader";
import { useMushafLayout } from "../use-mushaf-layout";

import "./print-mushaf.css";

/**
 * Print-faithful Madani page — PROTOTYPE.
 *
 * Renders a page the way the printed King Fahd mushaf lays it out, to compare
 * against the current reader before anything moves into it:
 *   - a fixed 15-line grid (8 lines inside the frame on pages 1–2);
 *   - the type size set per page from the widest line's measured glyph width,
 *     so the widest line fills the measure exactly, like the print;
 *   - full lines justified word to word, short closing lines centered at their
 *     natural width (detected from glyph width, not a list of pages);
 *   - surah titles drawn with the QCF_BSML ornamental frame and calligraphic
 *     surah-name glyphs, and the calligraphic basmala, from the font the reader
 *     already ships (no new asset or licence);
 *   - the running head (juz, surah) and the page number in the margins.
 * Read-only: no selection, morphology or tools.
 */

/** The Hafs mushaf id (src/app/core/config.py HAFS_MUSHAF_ID). */
const HAFS_MUSHAF_ID = 2;
const PAGE_COUNT = 604;

// QCF_BSML codepoints (King Fahd Complex QCF V1 ligature font).
const BSML_SURAH_WORD = "ﮌ"; // سُورَةُ
const BSML_FRAME = "ﰠ"; // the ornamental title frame (8em wide)
const BSML_BASMALA = "ﰡ"; // the calligraphic basmala (≈6.4em wide)

/** Calligraphic surah-name glyph: 1–37 from U+FB8D, 38–114 from U+FBD3. */
export function surahNameGlyph(surah: number): string {
  if (surah < 1 || surah > 114) return "";
  return String.fromCharCode(surah <= 37 ? 0xfb8d + surah - 1 : 0xfbd3 + surah - 38);
}

const JUZ_ORDINALS = [
  "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر",
  "الحادي عشر", "الثاني عشر", "الثالث عشر", "الرابع عشر", "الخامس عشر", "السادس عشر", "السابع عشر",
  "الثامن عشر", "التاسع عشر", "العشرون", "الحادي والعشرون", "الثاني والعشرون", "الثالث والعشرون",
  "الرابع والعشرون", "الخامس والعشرون", "السادس والعشرون", "السابع والعشرون", "الثامن والعشرون",
  "التاسع والعشرون", "الثلاثون",
];

function juzOf(surah: number, ayah: number): number {
  let juz = 1;
  JUZ_STARTS.forEach(([s, a], index) => {
    if (surah > s || (surah === s && ayah >= a)) juz = index + 1;
  });
  return juz;
}

/**
 * A surah's closing line is centered at its natural width when it is narrower
 * than this share of the widest line (pages 603–604); every other line
 * justifies, however loosely the print spaces it (e.g. page 207, line 9).
 */
const SHORT_LINE_RATIO = 0.88;

let measureContext: CanvasRenderingContext2D | null = null;

/** Natural width of a glyph run, in ems of its page font (needs the font loaded). */
function measureEm(text: string, family: string): number {
  if (typeof document === "undefined") return 0;
  measureContext ??= document.createElement("canvas").getContext("2d");
  if (!measureContext) return 0;
  measureContext.font = `100px "${family}"`;
  return measureContext.measureText(text).width / 100;
}

const lineGlyphs = (line: MushafLayoutLine) => (line.words ?? []).map((word) => word.glyph ?? "").join(" ");

type MeasuredLine = { line: MushafLayoutLine; em: number };

function measurePage(layout: MushafPageLayoutResponse): { lines: MeasuredLine[]; maxEm: number } {
  const lines = (layout.lines ?? []).map((line) => ({
    line,
    em: line.line_type === "ayah" ? measureEm(lineGlyphs(line), line.font_family ?? "") : 0,
  }));
  const maxEm = Math.max(1, ...lines.map((entry) => entry.em));
  return { lines, maxEm };
}

function usePrintLayout(page: number): MushafPageLayoutResponse | null {
  const { layout } = useMushafLayout({ enabled: page >= 1 && page <= PAGE_COUNT, mushafId: HAFS_MUSHAF_ID, page });
  const [bsmlReady, setBsmlReady] = useState(false);
  const base = layout?.font_base_path ?? "";
  useEffect(() => {
    if (!base) return;
    let alive = true;
    void loadGlyphFont(base, "qcf-bsml").then((ok) => alive && setBsmlReady(ok));
    return () => {
      alive = false;
    };
  }, [base]);
  return layout && bsmlReady && layout.page === page ? layout : null;
}

function PrintWord({ word }: { word: MushafLayoutGlyph }) {
  const text = (word.text ?? "").trim();
  return (
    <span className={text ? "qb-print-word" : "qb-print-mark"}>
      <span aria-hidden dangerouslySetInnerHTML={{ __html: word.glyph ?? "" }} />
      {text ? <span className="qb-sr-only">{text}</span> : null}
    </span>
  );
}

function SurahTitle({ surah }: { surah: number | null | undefined }) {
  return (
    <div className="qb-print-row qb-print-title" role="heading" aria-level={2}>
      <span className="frame" aria-hidden>
        {BSML_FRAME}
      </span>
      <span className="name" aria-hidden>
        <span>{BSML_SURAH_WORD}</span>
        <span>{surahNameGlyph(surah ?? 0)}</span>
      </span>
      <span className="qb-sr-only">{t("سورة")} {surah}</span>
    </div>
  );
}

export function PrintMushafPage({ page }: { page: number }) {
  const layout = usePrintLayout(page);
  const measured = useMemo(() => (layout ? measurePage(layout) : null), [layout]);
  const isOpening = page <= 2;

  if (!layout || !measured) {
    return (
      <article className={`qb-print-page${isOpening ? " is-opening" : ""} is-loading`} aria-busy>
        <div className="qb-print-block" />
      </article>
    );
  }

  const firstWord = (layout.lines ?? []).flatMap((line) => line.words ?? [])[0];
  const juz = firstWord ? juzOf(firstWord.surah, firstWord.ayah) : null;
  const headSurah = layout.surahs?.[0];
  const rows = isOpening ? measured.lines.length : 15;

  return (
    <article className={`qb-print-page${isOpening ? " is-opening" : ""}`} data-page={page} aria-label={t("الصفحة {0}", { 0: page })}>
      {!isOpening ? (
        <header className="qb-print-head">
          <span>{juz ? `${t("الجزء")} ${JUZ_ORDINALS[juz - 1]}` : null}</span>
          <span className="surah">{headSurah ? `${t("سورة")} ${headSurah.name}` : null}</span>
        </header>
      ) : null}
      <div className="qb-print-frame">
        <div
          className="qb-print-block"
          style={{ "--rows": rows, "--fit": measured.maxEm } as React.CSSProperties}
        >
          {measured.lines.map(({ line, em }, index) => {
            if (line.line_type === "surah_name") return <SurahTitle key={line.line_number} surah={line.surah_number} />;
            if (line.line_type === "basmalah") {
              return (
                <div key={line.line_number} className="qb-print-row qb-print-basmala" aria-label={t("البسملة")}>
                  <span aria-hidden>{BSML_BASMALA}</span>
                </div>
              );
            }
            const next = measured.lines[index + 1]?.line;
            const closesSurah = next ? next.line_type === "surah_name" : page === PAGE_COUNT;
            const centered = Boolean(line.is_centered) || (closesSurah && em < measured.maxEm * SHORT_LINE_RATIO);
            return (
              <div
                key={line.line_number}
                className={`qb-print-row qb-print-line${centered ? " is-centered" : ""}`}
                style={{ fontFamily: line.font_family ?? undefined }}
              >
                {(line.words ?? []).map((word) => (
                  <PrintWord key={word.word_key} word={word} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <footer className="qb-print-folio">{toArabicDigits(page)}</footer>
    </article>
  );
}

function readPageParam(): number {
  if (typeof window === "undefined") return 1;
  const value = Number(new URLSearchParams(window.location.search).get("page"));
  return Number.isInteger(value) && value >= 1 && value <= PAGE_COUNT ? value : 1;
}

/** Opening pair: odd pages sit on the right of a spread, as in the bound mushaf. */
const spreadStart = (page: number) => (page % 2 === 1 ? page : page - 1);

function useWideScreen(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1100px) and (min-aspect-ratio: 5/4)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

export function PrintMushafPrototype() {
  const [page, setPage] = useState(1);
  const wide = useWideScreen();
  const step = wide ? 2 : 1;

  useEffect(() => setPage(readPageParam()), []);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("page", String(page));
    window.history.replaceState(null, "", url);
  }, [page]);

  const go = (delta: number) => setPage((current) => Math.min(PAGE_COUNT, Math.max(1, current + delta)));

  useEffect(() => {
    // Right-to-left book: the left arrow turns forward.
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === "ArrowLeft") go(step);
      if (event.key === "ArrowRight") go(-step);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const pages = wide ? [spreadStart(page), spreadStart(page) + 1].filter((p) => p <= PAGE_COUNT) : [page];

  return (
    <main className="qb-print-proto" dir="rtl">
      <nav className="qb-print-toolbar" aria-label={t("التنقل بين الصفحات")}>
        <span className="badge">{t("نموذج تجريبي: مصحف مطابق للطبعة")}</span>
        <button type="button" onClick={() => go(-step)} disabled={page <= 1} aria-label={t("الصفحة السابقة")}>
          ›
        </button>
        <label>
          <span className="qb-sr-only">{t("رقم الصفحة")}</span>
          <input
            type="number"
            min={1}
            max={PAGE_COUNT}
            value={page}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isInteger(value) && value >= 1 && value <= PAGE_COUNT) setPage(value);
            }}
          />
        </label>
        <button type="button" onClick={() => go(step)} disabled={page >= PAGE_COUNT} aria-label={t("الصفحة التالية")}>
          ‹
        </button>
      </nav>
      <div className={`qb-print-spread${pages.length > 1 ? " is-pair" : ""}`}>
        {pages.map((p) => (
          <PrintMushafPage key={p} page={p} />
        ))}
      </div>
    </main>
  );
}
