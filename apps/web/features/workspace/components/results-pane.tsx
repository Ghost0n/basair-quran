import type { RefObject } from "react";

import type { PaginatedSearchResult, SearchVerse } from "@q-basair/shared";

import { getVerseSelectionKey, renderHighlightedVerseText } from "@/lib/quran-ui";

import { ResultPagination } from "./result-pagination";

export function ResultsPane({
  results,
  resultPageDrafts,
  selectedVerseKey,
  resultsAreaRef,
  onSelectVerse,
  onResultPageDraftChange,
  onPageChange,
}: {
  results: PaginatedSearchResult[];
  resultPageDrafts: Record<string, string>;
  selectedVerseKey: string | null;
  resultsAreaRef: RefObject<HTMLDivElement | null>;
  onSelectVerse: (verse: SearchVerse, resultKey: string, switchToReader?: boolean) => Promise<void>;
  onResultPageDraftChange: (resultKey: string, value: string) => void;
  onPageChange: (resultKey: string, page: number) => Promise<void>;
}) {
  return (
    <section id="resultsPane" className="results-pane" aria-label="نتائج البحث">
      <div className="pane-header">
        <div className="pane-title pane-title-minimal">
          <span className="pane-label">مساحة البحث</span>
        </div>
      </div>

      <div id="resultsArea" ref={resultsAreaRef}>
        {results.map((result) => (
          <div key={result.result_key} className="result-card" data-result-key={result.result_key}>
            {result.total_pages > 1 ? (
              <ResultPagination
                current={result.page}
                total={result.total_pages}
                draftValue={resultPageDrafts[result.result_key] ?? String(result.page)}
                onDraftChange={(value) => onResultPageDraftChange(result.result_key, value)}
                onPageChange={(page) => void onPageChange(result.result_key, page)}
              />
            ) : null}

            <div className="verses-list">
              {result.verses.map((verse) => {
                const selectionKey = getVerseSelectionKey(result.result_key, verse);
                const isActive = selectionKey === selectedVerseKey;

                return (
                  <div
                    key={selectionKey}
                    className={`verse-item interactive${isActive ? " active" : ""}`}
                    tabIndex={0}
                    role="button"
                    aria-pressed={isActive}
                    aria-label={`افتح صفحة سورة ${verse.surah} آية ${verse.ayah} في المصحف`}
                    onClick={() => void onSelectVerse(verse, result.result_key, true)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void onSelectVerse(verse, result.result_key, true);
                      }
                    }}
                  >
                    <div className="verse-meta">
                      <span className="surah-name">{`سورة ${verse.surah}`}</span>
                      <span className="ayah-num">{` - آية ${verse.ayah}`}</span>
                    </div>
                    <p className="verse-text">{renderHighlightedVerseText(verse.text, verse.highlights)}</p>
                  </div>
                );
              })}
            </div>

            {result.total_pages > 1 ? (
              <ResultPagination
                current={result.page}
                total={result.total_pages}
                draftValue={resultPageDrafts[result.result_key] ?? String(result.page)}
                onDraftChange={(value) => onResultPageDraftChange(result.result_key, value)}
                onPageChange={(page) => void onPageChange(result.result_key, page)}
              />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
