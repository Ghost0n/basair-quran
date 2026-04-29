import { Fragment, type RefObject } from "react";

import type { QuranPageResponse } from "@q-basair/shared";

import { renderHighlightedVerseText } from "@/lib/quran-ui";

export function ReaderPane({
  readerData,
  isLoadingReader,
  readerBodyRef,
  readerPageDraft,
  selectedHighlights,
  onPageDraftChange,
  onPageSubmit,
}: {
  readerData: QuranPageResponse | null;
  isLoadingReader: boolean;
  readerBodyRef: RefObject<HTMLDivElement | null>;
  readerPageDraft: string;
  selectedHighlights: number[];
  onPageDraftChange: (value: string) => void;
  onPageSubmit: (page: number) => Promise<void>;
}) {
  return (
    <section id="readerPane" className={`reader-pane${isLoadingReader ? " page-loading" : ""}`} aria-label="المصحف">
      <div className="pane-header reader-header">
        <div className="pane-title pane-title-minimal reader-title reader-title-minimal">
          <span className="pane-label reader-label">المصحف</span>
        </div>

        <div className="reader-page-controls" aria-label="التنقل بين صفحات المصحف">
          <button
            id="readerPrevPage"
            className="reader-page-btn"
            type="button"
            disabled={!readerData?.has_previous || isLoadingReader}
            onClick={() => readerData?.page && void onPageSubmit(readerData.page - 1)}
          >
            →
          </button>

          <div className="reader-page-jump">
            <span id="readerPageLabel">صفحة</span>
            <input
              id="readerPageInput"
              type="number"
              min={readerData?.min_page ?? 1}
              max={readerData?.max_page ?? 1}
              value={readerPageDraft}
              inputMode="numeric"
              aria-label="رقم صفحة المصحف"
              disabled={!readerData?.page || isLoadingReader}
              onChange={(event) => onPageDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  const rawValue = (event.target as HTMLInputElement).value.trim();
                  const value = Number(rawValue);
                  if (rawValue && Number.isFinite(value)) {
                    void onPageSubmit(value);
                  } else {
                    onPageDraftChange(readerData?.page ? String(readerData.page) : "");
                  }
                }
              }}
              onBlur={(event) => {
                const rawValue = event.target.value.trim();
                const value = Number(rawValue);
                if (rawValue && Number.isFinite(value)) {
                  void onPageSubmit(value);
                } else {
                  onPageDraftChange(readerData?.page ? String(readerData.page) : "");
                }
              }}
            />
            <span>{readerData?.max_page ? `من ${readerData.max_page}` : "-"}</span>
          </div>

          <button
            id="readerNextPage"
            className="reader-page-btn"
            type="button"
            disabled={!readerData?.has_next || isLoadingReader}
            onClick={() => readerData?.page && void onPageSubmit(readerData.page + 1)}
          >
            ←
          </button>
        </div>
      </div>

      {!readerData?.ayahs?.length ? (
        <div id="readerEmptyState" className="reader-empty">
          اختر نتيجة من اليسار لفتح صفحتها في المصحف مع تمييز الآية المختارة.
        </div>
      ) : (
        <div id="readerBody" className="reader-body" ref={readerBodyRef}>
          <div className="quran-page-card">
            <div className="quran-page-text">
              {readerData.ayahs.map((ayah, index) => {
                const previousSurahId = index > 0 ? readerData.ayahs[index - 1]?.surah_id : null;
                const showSurahBreak = ayah.surah_id !== previousSurahId;

                return (
                  <Fragment key={`${ayah.ayah_id}-${ayah.ayah}`}>
                    {showSurahBreak ? <div className="reader-surah-break">{`سورة ${ayah.surah}`}</div> : null}
                    <span className={`quran-page-ayah${ayah.is_selected ? " selected" : ""}`}>
                      {ayah.is_selected ? renderHighlightedVerseText(ayah.text.trim(), selectedHighlights) : ayah.text.trim()}
                      <span className="quran-ayah-number">{`﴿${ayah.ayah}﴾`}</span>
                    </span>
                    {" "}
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
