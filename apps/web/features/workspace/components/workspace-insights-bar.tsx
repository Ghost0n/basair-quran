import type { SearchMode } from "@q-basair/shared";

function getAyahLabel(totalVerses: number) {
  if (totalVerses === 1) {
    return "آية واحدة";
  }
  if (totalVerses === 2) {
    return "آيتين";
  }
  return totalVerses < 11 ? "آيات" : "آية";
}

function formatAyahCount(totalVerses: number) {
  if (totalVerses === 1 || totalVerses === 2) {
    return getAyahLabel(totalVerses);
  }
  return `${totalVerses} ${getAyahLabel(totalVerses)}`;
}

export function WorkspaceInsightsBar({
  visible,
  isSearching,
  hasResults,
  selectedMushafLabel,
  searchMode,
  resultsSummary,
  insightSummary,
  quickExamples,
  onRunQuickExample,
  onOpenResearch,
}: {
  visible: boolean;
  isSearching: boolean;
  hasResults: boolean;
  selectedMushafLabel: string;
  searchMode: SearchMode;
  resultsSummary: { cards: number; totalOccurrences: number; totalVerses: number } | null;
  insightSummary: { termLabel: string; term: string; totalOccurrences: number; totalVerses: number } | null;
  quickExamples: Array<{ label: string; query: string; mode: SearchMode }>;
  onRunQuickExample: (example: { query: string; mode: SearchMode }) => void;
  onOpenResearch: () => void;
}) {
  const isGuidanceState = !isSearching && !hasResults;
  const modeLabel = searchMode === "root" ? "جذر" : "كلمة";
  const primaryKicker = isSearching ? "جارٍ التحليل" : hasResults ? "ملخص البحث" : "إرشاد";
  const primaryTitle =
    isSearching
      ? "نجهز النتائج والقارئ معًا"
      : hasResults && insightSummary
        ? `ورد ${insightSummary.totalOccurrences} تكرار لـ ${insightSummary.termLabel}: ${insightSummary.term}`
        : "ابحث بكلمة أو جذر أو عبارة";
  const primaryDescription =
    isSearching
      ? "سيظهر ملخص البحث هنا حالما تكتمل الاستجابة."
      : hasResults && insightSummary
        ? `في ${insightSummary.totalVerses} آية من القرآن بحسب رواية ${selectedMushafLabel}.`
        : "اكتب كلمة مفردة للبحث المباشر، أو بدّل إلى الجذر عند البحث بالاشتقاق، أو أدخل عبارة متتابعة داخل الآية.";
  const summaryDescription =
    hasResults && insightSummary
      ? `${insightSummary.totalOccurrences} تكرار في ${formatAyahCount(insightSummary.totalVerses)} من القرآن الكريم بحسب رواية ${selectedMushafLabel}.`
      : primaryDescription;

  return (
    <section className={`workspace-insights${visible ? " active" : ""}`} aria-label="لوحة المساعدة البحثية">
      <div className={`workspace-insights-primary${isGuidanceState ? " guidance-state" : ""}`}>
        <div className={`workspace-insights-copy${hasResults ? " has-results" : ""}`}>
          <span className="workspace-kicker">{primaryKicker}</span>
          <h2>{hasResults && insightSummary ? `${insightSummary.termLabel}: ${insightSummary.term}` : primaryTitle}</h2>
          <p className={isGuidanceState ? "guidance-copy" : undefined}>{summaryDescription}</p>
        </div>
      </div>

      <div className="workspace-insights-secondary">
        {hasResults && resultsSummary ? (
          <div className="workspace-stats-grid">
            <div className="workspace-stat-chip">
              <span>الرواية</span>
              <strong>{selectedMushafLabel}</strong>
            </div>
            <div className="workspace-stat-chip">
              <span>أسلوب البحث</span>
              <strong>{modeLabel}</strong>
            </div>
            <div className="workspace-stat-chip">
              <span>إجمالي التكرار</span>
              <strong>{resultsSummary.totalOccurrences}</strong>
            </div>
            <div className="workspace-stat-chip">
              <span>إجمالي الآيات</span>
              <strong>{resultsSummary.totalVerses}</strong>
            </div>
          </div>
        ) : (
          <>
            <button type="button" className="workspace-research-launch" onClick={onOpenResearch}>
              <strong>افتح الباحث الذكي</strong>
              <span>للأسئلة الحرة التي تُترجم إلى ألفاظ قرآنية ثم تُعرض معها الآيات ذات الصلة</span>
            </button>

            <div className="quick-examples" aria-label="أمثلة بحث سريعة">
              {quickExamples.map((example) => (
                <button
                  key={`${example.mode}-${example.query}`}
                  type="button"
                  className="quick-example-chip"
                  onClick={() => onRunQuickExample(example)}
                >
                  <span>{example.label}</span>
                  <small>{example.mode === "root" ? "جذر" : example.query.includes(" ") ? "عبارة" : "كلمة"}</small>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
