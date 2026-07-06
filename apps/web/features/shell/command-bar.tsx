"use client";

import { useEffect } from "react";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { Icon } from "@/components/icon";
import { modKey } from "@/lib/platform";
import { looksLikeQuestion, queueStudioAsk } from "@/lib/studio-prefill";

import { useShellMode } from "./mode-context";
import { useCommandShortcut } from "./use-command-shortcut";
import { useWorkspace } from "./workspace-context";

// Live intent parsing for the command-bar chip (design spec). Ask stays aligned
// with the Enter-routing (`looksLikeQuestion`) so the chip never contradicts what
// pressing Enter actually does; go/search are a display distinction.
type CommandIntent = "ask" | "go" | "search";
const INTERROGATIVE = /^(ما|من|لماذا|كيف|هل|أين|متى)\s/;
const NAV_LEAD = /^(صفحة|سورة|جزء)(\s|$)/;
const INTENT_LABEL: Record<CommandIntent, string> = {
  ask: "اسأل ✦",
  go: "انتقال",
  search: "جذر · ابحث",
};
// Screen-reader announcement of how Enter will act (the visual chip is
// decorative/aria-hidden; this live region gives SR users the same cue).
const INTENT_SR_LABEL: Record<CommandIntent, string> = {
  ask: "سيُفتح الإدخال كسؤال في الدراسة عند الضغط على Enter.",
  go: "سيُنفَّذ الإدخال كانتقال عند الضغط على Enter.",
  search: "سيُنفَّذ الإدخال كبحث عند الضغط على Enter.",
};

function detectIntent(raw: string): CommandIntent | null {
  const value = raw.trim();
  if (!value) return null;
  if (looksLikeQuestion(value) || INTERROGATIVE.test(value) || value.endsWith("؟")) return "ask";
  if (/[٠-٩\d]/.test(value) || NAV_LEAD.test(value)) return "go";
  return "search";
}

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
  const { mode, setMode } = useShellMode();

  // When the user starts typing or runs a search, surface the Search mode.
  // Use `replace` so this derived switch doesn't add a history entry.
  useEffect(() => {
    if (state.workspaceActive) {
      setMode("search", { replace: true });
    }
    // we only react to workspaceActive becoming true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.workspaceActive]);

  // Entering Search with nothing yet searched → focus the input so the user
  // can type immediately (the input is the point of the Search surface).
  useEffect(() => {
    if (mode === "search" && !state.workspaceVisible) {
      refs.inputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Intent routing: a natural-language question (not a highlighted suggestion,
  // not a short search term) hands off to the Studio — delivering the bar's
  // "اسأل" promise. Everything else falls through to the existing search path.
  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && state.activeSuggestionIndex < 0) {
      const value = event.currentTarget.value.trim();
      if (value && looksLikeQuestion(value)) {
        event.preventDefault();
        queueStudioAsk(value);
        event.currentTarget.value = "";
        actions.setQuery("");
        setMode("studio");
        return;
      }
    }
    actions.handleInputKeyDown(event);
  }

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

  // In Search mode with nothing typed yet, the command bar is the focal point:
  // highlight it and surface example chips directly beneath it.
  const searchActive = mode === "search";
  // Live intent chip — announces how the bar reads the current input as you type.
  const intent = detectIntent(state.inputValue);
  const showSearchHint =
    searchActive &&
    !state.workspaceVisible &&
    !state.isSearching &&
    !listboxOpen &&
    !state.inputValue.trim();

  return (
    <div className={`qb-cmd${searchActive ? " is-search-active" : ""}`}>
      <span className="qb-cmd-icon">
        <Icon name="search" size={16} />
      </span>
      <span
        role="status"
        aria-live="polite"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {intent ? INTENT_SR_LABEL[intent] : ""}
      </span>
      {intent ? (
        <span
          key={intent}
          className="qb-cmd-intent"
          data-intent={intent}
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "2px 9px",
            borderRadius: "var(--r-pill)",
            background: "var(--gold-a12)",
            border: "1px solid var(--border-strong)",
            color: "var(--gold-text)",
            fontSize: "10.5px",
            fontWeight: 800,
            whiteSpace: "nowrap",
            flexShrink: 0,
            animation: "qbPopIn var(--motion-dur-fast) var(--motion-ease-settle)",
          }}
        >
          {INTENT_LABEL[intent]}
        </span>
      ) : null}
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
        onKeyDown={onInputKeyDown}
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

      {showSearchHint ? (
        <div className="qb-cmd-hint" role="note">
          <span className="lead">ابدأ بكتابة جذر أو كلمة قرآنية للبحث</span>
          <div className="ex">
            <span className="lbl">جرّب</span>
            {state.quickExamples.map((example) => (
              <button
                key={example.label}
                type="button"
                onMouseDown={(event) => {
                  // keep input focus through the click
                  event.preventDefault();
                  actions.runQuickExample(example);
                }}
              >
                {example.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
