"use client";

import { useEffect } from "react";

import { Icon } from "@/components/icon";
import { modKey } from "@/lib/platform";

import { useShellMode } from "./mode-context";
import { useCommandShortcut } from "./use-command-shortcut";
import { useWorkspace } from "./workspace-context";

/**
 * The single command bar — `⌘K` / `/` opens it.
 *
 * Phase 1: routes typed input through the legacy useSearchWorkspace hook
 * via WorkspaceContext, so search behavior is unchanged. The input owns
 * id="searchInput" — Yamli (Latin → Arabic) and the existing inputRef
 * both expect that id.
 *
 * Phase 2+ will teach the input to parse intent (root vs word vs ayah
 * jump vs research question) and dispatch accordingly.
 */
export function CommandBar() {
  useCommandShortcut();

  const { state, actions, refs, helpers } = useWorkspace();
  const { setMode } = useShellMode();

  // When the user starts typing or runs a search, surface the Search mode.
  // Use `replace` so this derived switch doesn't add a history entry.
  useEffect(() => {
    if (state.workspaceActive) {
      setMode("search", { replace: true });
    }
    // we only react to workspaceActive becoming true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.workspaceActive]);

  const placeholder = "ابحث · انتقل · اسأل  —  /";
  const listboxOpen = state.suggestionsOpen && state.suggestions.length > 0;
  const activeOptionId =
    listboxOpen && state.activeSuggestionIndex >= 0
      ? `qb-cmd-opt-${state.activeSuggestionIndex}`
      : undefined;

  // Announced politely to assistive tech as search state changes.
  const liveMessage = state.isSearching
    ? "جارٍ البحث…"
    : state.errorMessage
      ? state.errorMessage
      : state.resultsSummary
        ? `${state.resultsSummary.totalVerses} آية في ${state.resultsSummary.cards} مجموعة`
        : "";

  return (
    <div className="qb-cmd">
      <span className="qb-cmd-icon">
        <Icon name="search" size={16} />
      </span>
      {state.searchPrefix ? <span className="qb-cmd-mode">{state.searchPrefix}</span> : null}
      <input
        id="searchInput"
        ref={refs.inputRef}
        data-qb-command-input
        dir="rtl"
        type="text"
        defaultValue={state.inputValue}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => actions.setQuery(event.currentTarget.value)}
        onFocus={actions.openSuggestions}
        onBlur={actions.closeSuggestions}
        onKeyDown={actions.handleInputKeyDown}
        aria-label="مساحة الأمر — بحث وتصفّح"
        role="combobox"
        aria-expanded={listboxOpen}
        aria-controls="qb-cmd-listbox"
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
        suppressHydrationWarning
      />
      <span className="qb-sr-only" role="status" aria-live="polite">
        {liveMessage}
      </span>
      {/* U2: platform-aware modifier key — suppressHydrationWarning covers SSR→client delta */}
      <span className="qb-cmd-kbd" aria-hidden suppressHydrationWarning>
        <kbd suppressHydrationWarning>{modKey()}</kbd>
        <kbd>K</kbd>
      </span>

      {listboxOpen ? (
        <div ref={refs.suggestionsRef} id="qb-cmd-listbox" className="qb-cmd-suggestions" role="listbox">
          {state.suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.type}-${suggestion.text}-${index}`}
              id={`qb-cmd-opt-${index}`}
              type="button"
              className={`qb-cmd-suggestion${index === state.activeSuggestionIndex ? " active" : ""}`}
              onMouseEnter={() => actions.previewSuggestion(index)}
              onMouseLeave={actions.revertSuggestionPreview}
              onMouseDown={(event) => {
                // mousedown fires before blur so the input keeps focus through the click
                event.preventDefault();
                actions.applySuggestion(suggestion);
              }}
              role="option"
              aria-selected={index === state.activeSuggestionIndex}
            >
              <span>{suggestion.text}</span>
              <span className="type">{helpers.getSuggestionTypeLabel(state.searchMode, suggestion)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
