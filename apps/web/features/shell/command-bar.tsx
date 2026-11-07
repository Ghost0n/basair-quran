"use client";

import { useEffect, useRef, useState } from "react";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { Icon } from "@/components/icon";
import { canHover } from "@/lib/can-hover";
import { modKey } from "@/lib/platform";
import { isPhraseInputValue } from "@/lib/quran-ui";
import { useWebDesign } from "@/lib/use-web-design";
import { looksLikeQuestion, queueStudioAsk } from "@/lib/studio-prefill";
import { useMushaf } from "@/features/reading/mushaf-context";

import { useShellMode } from "./mode-context";
import { useWorkspace } from "./workspace-context";
import { parseNavCommand } from "@/lib/quran-nav";

import { t, tn } from "@/lib/i18n";

// Live intent parsing for the command-bar chip (design spec). Ask stays aligned
// with the Enter-routing (`looksLikeQuestion`) so the chip never contradicts what
// pressing Enter actually does; go/search are a display distinction.
type CommandIntent = "ask" | "go" | "search";
const INTERROGATIVE = /^(ما|من|لماذا|كيف|هل|أين|متى)\s/;

const INTENT_LABEL: Record<CommandIntent, string> = {
  get ask() {
    return t("اسأل ✦");
  },
  get go() {
    return t("انتقال");
  },
  get search() {
    return t("جذر · ابحث");
  },
};
// Screen-reader announcement of how Enter will act (the visual chip is
// decorative/aria-hidden; this live region gives SR users the same cue).
const INTENT_SR_LABEL: Record<CommandIntent, string> = {
  get ask() {
    return t("سيُفتح الإدخال كسؤال في الدراسة عند الضغط على Enter.");
  },
  get go() {
    return t("سيُنفَّذ الإدخال كانتقال عند الضغط على Enter.");
  },
  get search() {
    return t("سيُنفَّذ الإدخال كبحث عند الضغط على Enter.");
  },
};

function detectIntent(raw: string): CommandIntent | null {
  const value = raw.trim();
  if (!value) return null;
  if (looksLikeQuestion(value) || INTERROGATIVE.test(value) || value.endsWith("؟")) return "ask";
  if (parseNavCommand(value)) return "go";
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
// «التشكيل» is shown by its own sign, the Arabic word for a vowel mark, bare
// or vowelled (a glyph, not a label: it reads the same in every language).
const CHAKL_SIGN_OFF = "حركة";
const CHAKL_SIGN_ON = "حَرَكَة";

export function CommandBar() {
  const { state, actions, refs, helpers } = useWorkspace();
  const web = useWebDesign();
  const { mode, setMode } = useShellMode();
  const mushaf = useMushaf();

  // When the user starts typing or runs a search, surface the Search mode.
  // Use `replace` so this derived switch doesn't add a history entry.
  // Only a change counts: the web design mounts the bar on every page (top-bar.tsx),
  // and mounting while a search is active must not pull the page into Search.
  const wasActive = useRef(state.workspaceActive);
  useEffect(() => {
    if (state.workspaceActive && !wasActive.current) {
      setMode("search", { replace: true });
    }
    wasActive.current = state.workspaceActive;
    // we only react to workspaceActive becoming true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.workspaceActive]);

  // Entering Search with nothing yet searched → focus the input so the user
  // can type immediately (the input is the point of the Search surface).
  // Not when a search is already on its way in (Home, a suggestion, a chip):
  // focusing would reopen the suggestion list over the results.
  useEffect(() => {
    if (mode === "search" && !state.workspaceVisible && !state.inputValue.trim()) {
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
      const nav = value ? parseNavCommand(value) : null;
      if (nav) {
        event.preventDefault();
        const m = state.selectedMushaf;
        if (nav.type === "page") void mushaf.loadPage(m, nav.page, { persist: true });
        else if (nav.type === "surah") void mushaf.loadBySurah(m, nav.surah);
        else if (nav.type === "ayah") void mushaf.loadBySurah(m, nav.surah, nav.ayah);
        else void mushaf.loadByJuz(m, nav.juz);
        event.currentTarget.value = "";
        actions.setQuery("");
        setMode("reading");
        return;
      }
    }
    actions.handleInputKeyDown(event);
  }

  // The "/" shortcut is a keyboard's: touch screens get the plain invitation
  // (known after mount, so the server's render matches the first client one).
  const [pointer, setPointer] = useState(false);
  useEffect(() => setPointer(canHover()), []);
  const placeholder = pointer ? t("ابحث · انتقل · اسأل  —  /") : t("ابحث بكلمة أو جذر، أو اطرح سؤالاً");
  const listboxOpen = state.suggestionsOpen && state.suggestions.length > 0;
  const activeOptionId =
    listboxOpen && state.activeSuggestionIndex >= 0
      ? `qb-cmd-opt-${state.activeSuggestionIndex}`
      : undefined;

  // Announced politely to assistive tech as search state changes.
  const liveMessage = state.isSearching
    ? t("جارٍ البحث…")
    : state.errorMessage
      ? state.errorMessage
      : state.resultsSummary
        ? `${tn("{0} آية", state.resultsSummary.totalVerses, { 0: state.resultsSummary.totalVerses })} · ${tn("{0} مجموعة", state.resultsSummary.cards, { 0: state.resultsSummary.cards })}`
        : "";

  // In Search mode the command bar is the focal point (a gold ring). The
  // example chips live in the Search panel's empty state, not in a layer
  // floating over the panel.
  const searchActive = mode === "search";
  // Live intent chip — announces how the bar reads the current input as you type.
  const intent = detectIntent(state.inputValue);

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
      {state.searchPrefix && !web ? <span className="qb-cmd-mode">{state.searchPrefix}</span> : null}
      <input
        id="searchInput"
        ref={refs.inputRef}
        data-qb-command-input
        dir="auto"
        type="text"
        defaultValue={state.inputValue}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => actions.setQuery(event.currentTarget.value)}
        onFocus={actions.openSuggestions}
        onBlur={actions.closeSuggestions}
        onKeyDown={onInputKeyDown}
        aria-label={t("مساحة الأمر — بحث وتصفّح")}
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
      {/* Web: the search's own switches, once something is typed — «كلمة /
          جذر» (a phrase is always word by word) and «التشكيل» (add or remove
          the vowel marks; words only). mousedown keeps the field focused. */}
      {web && state.inputValue.trim() ? (
        <span className="qb-cmd-switches">
          <span className="qb-cmd-seg" role="group" aria-label={t("طريقة البحث")}>
            {(["exact", "root"] as const).map((mode) => {
              const on = state.searchMode === mode;
              const phrase = isPhraseInputValue(state.inputValue);
              return (
                <button
                  key={mode}
                  type="button"
                  className={on ? "on" : ""}
                  aria-pressed={on}
                  disabled={mode === "root" && phrase}
                  title={mode === "root" && phrase ? t("العبارة تُبحث كلمةً كلمة") : undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => actions.chooseSearchMode(mode)}
                >
                  {mode === "root" ? t("جذر") : phrase ? t("عبارة") : t("كلمة")}
                </button>
              );
            })}
          </span>
          {state.searchMode === "exact" ? (
            <button
              type="button"
              className={`qb-cmd-chakl${state.chaklOn ? " on" : ""}`}
              aria-pressed={state.chaklOn}
              aria-label={state.chaklOn ? t("إزالة التشكيل") : t("إضافة التشكيل")}
              title={state.chaklOn ? t("إزالة التشكيل") : t("إضافة التشكيل")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void actions.toggleChakl()}
            >
              <span aria-hidden="true">{state.chaklOn ? CHAKL_SIGN_ON : CHAKL_SIGN_OFF}</span>
            </button>
          ) : null}
        </span>
      ) : null}
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
