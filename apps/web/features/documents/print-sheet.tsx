"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import type { ResearchReference } from "@q-basair/shared";

import { useNumerals } from "@/lib/preferences-context";

import { researchMeta, type ShareableResearch } from "./carousel";
import { DocumentView } from "./document-view";

import { activeLocale, localeInfo, t } from "@/lib/i18n";

/**
 * «طباعة / PDF» — a print-only rendition of a research: a light page with the
 * title, summary, the read-only document (ayahs in the Quran face, notes,
 * references) and a footer. It is portalled to <body>; `@media print` in
 * documents.css hides everything else, so the browser's print dialog (or
 * «حفظ بصيغة PDF») gets just this sheet. Unmounts after printing.
 */
export function PrintSheet({
  research,
  references = [],
  surahName,
  onDone,
}: {
  research: ShareableResearch;
  references?: ResearchReference[];
  surahName: (surahId: number) => string;
  onDone: () => void;
}) {
  const formatNumber = useNumerals();
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Once per mount: print, then let the parent unmount the sheet.
  useEffect(() => {
    const finish = () => onDoneRef.current();
    window.addEventListener("afterprint", finish);
    // Let the sheet paint (and the Quran font settle) before opening the dialog.
    const timer = window.setTimeout(() => {
      void (document.fonts?.ready ?? Promise.resolve()).then(() => window.print());
    }, 80);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", finish);
    };
  }, []);

  const date = new Intl.DateTimeFormat(activeLocale(), { dateStyle: "long" }).format(new Date());

  return createPortal(
    <article className="qb-print-sheet light" dir={localeInfo(activeLocale()).dir} lang={activeLocale()} aria-hidden>
      <header>
        <div className="brand">{t("بصائر")}</div>
        <h1>{research.title}</h1>
        <div className="meta">{researchMeta(research, { surahName, formatNumber })}</div>
        {research.summary ? <p className="summary">{research.summary}</p> : null}
        {research.mode === "tafssir" ? (
          <p className="disclaimer">
            {t("قراءة تفسيرية")} <b>{t("تجريبية")}</b>{t(": فهمٌ بشري مُولَّد بمساعدة نموذج لغوي، يُناقَش ولا يُحتجّ به. الآيات هي الدليل.")}
          </p>
        ) : null}
      </header>
      <DocumentView sections={research.sections} references={references} surahName={surahName} />
      <footer>
        <span>{t("بصائر — مساحة بحث قرآنية")}</span>
        <span>{research.url ?? date}</span>
      </footer>
    </article>,
    document.body,
  );
}
