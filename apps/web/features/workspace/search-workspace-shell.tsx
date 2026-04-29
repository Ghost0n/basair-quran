"use client";

import { ReaderPane } from "./components/reader-pane";
import { ResultsPane } from "./components/results-pane";
import { SearchToolbar } from "./components/search-toolbar";
import { WorkspaceInsightsBar } from "./components/workspace-insights-bar";
import { WorkspaceSwitch } from "./components/workspace-switch";
import { useSearchWorkspace } from "./hooks/use-search-workspace";

export function SearchWorkspaceShell() {
  const { refs, state, actions, helpers } = useSearchWorkspace();

  return (
    <div className="container">
      <SearchToolbar
        theme={state.theme}
        onThemeToggle={actions.toggleTheme}
        onResetSearch={actions.resetSearch}
        drawerOpen={state.drawerOpen}
        onDrawerToggle={() => actions.setDrawerOpen((current) => !current)}
        onDrawerClose={() => actions.setDrawerOpen(false)}
        toolsDrawerRef={refs.toolsDrawerRef}
        loadingMushafs={state.loadingMushafs}
        mushafs={state.mushafs}
        selectedMushaf={state.selectedMushaf}
        onMushafChange={actions.setSelectedMushaf}
        searchPrefix={state.searchPrefix}
        modeToggleLabel={state.modeToggleLabel}
        inputRef={refs.inputRef}
        inputValue={state.inputValue}
        suggestionsRef={refs.suggestionsRef}
        suggestions={state.suggestions}
        suggestionsOpen={state.suggestionsOpen}
        activeSuggestionIndex={state.activeSuggestionIndex}
        searchMode={state.searchMode}
        query={state.query}
        chaklButtonVisible={state.chaklButtonVisible}
        modeControlsVisible={state.modeControlsVisible}
        isSearching={state.isSearching}
        onInputChange={actions.setQuery}
        onInputFocus={actions.openSuggestions}
        onInputBlur={actions.closeSuggestions}
        onInputKeyDown={actions.handleInputKeyDown}
        onSuggestionHover={actions.previewSuggestion}
        onSuggestionHoverEnd={actions.revertSuggestionPreview}
        onSuggestionSelect={actions.applySuggestion}
        getSuggestionTypeLabel={helpers.getSuggestionTypeLabel}
        isPhraseInputValue={helpers.isPhraseInputValue}
        hasArabicDiacritics={helpers.hasArabicDiacritics}
        onSearchModeToggle={actions.toggleSearchMode}
        onSuggestionsWithChaklToggle={actions.toggleSuggestionsWithChakl}
        onRunSearch={actions.runSearch}
      />

      <WorkspaceInsightsBar
        visible={state.workspaceVisible}
        isSearching={state.isSearching}
        hasResults={state.results.length > 0}
        selectedMushafLabel={state.selectedMushafLabel}
        searchMode={state.searchMode}
        resultsSummary={state.resultsSummary}
        insightSummary={state.insightSummary}
        quickExamples={state.quickExamples}
        onRunQuickExample={actions.runQuickExample}
      />

      <div className={state.errorMessage ? "" : "hidden"} id="errorArea">
        {state.errorMessage ? <div className="error-message">{state.errorMessage}</div> : null}
        {state.didYouMean ? (
          <div className="did-you-mean">
            <span>هل تقصد:</span>
            <button type="button" className="did-you-mean-btn" onClick={actions.applyDidYouMean}>
              {state.didYouMean.text}
            </button>
          </div>
        ) : null}
      </div>

      <WorkspaceSwitch
        visible={state.workspaceVisible}
        workspaceView={state.workspaceView}
        collapsing={state.isWorkspaceCollapsing}
        onViewChange={actions.setWorkspaceView}
      />

      <div
        id="searchWorkspace"
        className={`search-workspace${state.workspaceVisible ? "" : " hidden"}${state.isWorkspaceCollapsing ? " workspace-collapsing" : ""}`}
        data-view={state.workspaceView}
      >
        <ResultsPane
          results={state.results}
          resultPageDrafts={state.resultPageDrafts}
          selectedVerseKey={state.selectedVerseKey}
          resultsAreaRef={refs.resultsAreaRef}
          onSelectVerse={actions.selectVerse}
          onResultPageDraftChange={actions.setResultPageDraft}
          onPageChange={actions.loadResultPage}
        />
        <ReaderPane
          readerData={state.readerData}
          isLoadingReader={state.isLoadingReader}
          readerBodyRef={refs.readerBodyRef}
          readerPageDraft={state.readerPageDraft}
          selectedHighlights={state.selectedHighlights}
          onPageDraftChange={actions.setReaderPageDraft}
          onPageSubmit={actions.loadReaderPage}
        />
      </div>
    </div>
  );
}
