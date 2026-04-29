import type { KeyboardEvent, RefObject } from "react";

import type { MushafItem, SearchMode, SuggestionItem } from "@q-basair/shared";

export function SearchToolbar({
  theme,
  onThemeToggle,
  onResetSearch,
  drawerOpen,
  onDrawerToggle,
  onDrawerClose,
  toolsDrawerRef,
  loadingMushafs,
  mushafs,
  selectedMushaf,
  onMushafChange,
  searchPrefix,
  modeToggleLabel,
  inputRef,
  inputValue,
  suggestionsRef,
  suggestions,
  suggestionsOpen,
  activeSuggestionIndex,
  searchMode,
  query,
  chaklButtonVisible,
  modeControlsVisible,
  isSearching,
  onInputChange,
  onInputFocus,
  onInputBlur,
  onInputKeyDown,
  onSuggestionHover,
  onSuggestionHoverEnd,
  onSuggestionSelect,
  getSuggestionTypeLabel,
  isPhraseInputValue,
  hasArabicDiacritics,
  onSearchModeToggle,
  onSuggestionsWithChaklToggle,
  onRunSearch,
}: {
  theme: "dark" | "light";
  onThemeToggle: () => void;
  onResetSearch: () => void;
  drawerOpen: boolean;
  onDrawerToggle: () => void;
  onDrawerClose: () => void;
  toolsDrawerRef: RefObject<HTMLDivElement | null>;
  loadingMushafs: boolean;
  mushafs: MushafItem[];
  selectedMushaf: number;
  onMushafChange: (value: number) => void;
  searchPrefix: string;
  modeToggleLabel: string;
  inputRef: RefObject<HTMLInputElement | null>;
  inputValue: string;
  suggestionsRef: RefObject<HTMLDivElement | null>;
  suggestions: SuggestionItem[];
  suggestionsOpen: boolean;
  activeSuggestionIndex: number;
  searchMode: SearchMode;
  query: string;
  chaklButtonVisible: boolean;
  modeControlsVisible: boolean;
  isSearching: boolean;
  onInputChange: (value: string) => void;
  onInputFocus: () => void;
  onInputBlur: () => void;
  onInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSuggestionHover: (index: number) => void;
  onSuggestionHoverEnd: () => void;
  onSuggestionSelect: (item: SuggestionItem) => void;
  getSuggestionTypeLabel: (mode: SearchMode, item: SuggestionItem) => string;
  isPhraseInputValue: (value: string) => boolean;
  hasArabicDiacritics: (value: string) => boolean;
  onSearchModeToggle: () => void;
  onSuggestionsWithChaklToggle: () => void;
  onRunSearch: () => Promise<void>;
}) {
  return (
    <>
      <div className={`top-shell${drawerOpen ? " tools-open" : ""}`}>
        <button id="themeToggle" className="theme-toggle-btn" onClick={onThemeToggle} title="تبديل النمط" type="button">
          {theme === "dark" ? "☀️" : "🌙"}
        </button>

        <div className={`search-shell-top${drawerOpen ? " tools-open" : ""}`}>
          <button
            id="toolsDrawerToggle"
            className="tools-drawer-toggle"
            type="button"
            aria-expanded={drawerOpen}
            aria-controls="toolsDrawer"
            onClick={onDrawerToggle}
          >
            <span className="tools-drawer-toggle-label">الإعدادات</span>
          </button>

          <div id="toolsDrawer" ref={toolsDrawerRef} className="tools-drawer" aria-label="خيارات البحث">
            <div className="tools-drawer-header">
              <div className="tools-drawer-title">
                <span>خيارات البحث</span>
              </div>
              <button id="toolsDrawerClose" className="tools-drawer-close" type="button" onClick={onDrawerClose} aria-label="إغلاق الإعدادات">
                &times;
              </button>
            </div>

            <div className="mushaf-selector drawer-mushaf-selector">
              <label htmlFor="mushafSelect">الرواية:</label>
              <select
                id="mushafSelect"
                value={selectedMushaf}
                onChange={(event) => onMushafChange(Number(event.target.value))}
                disabled={loadingMushafs}
              >
                {loadingMushafs ? <option value={1}>جارٍ التحميل...</option> : null}
                {mushafs.map((mushaf) => (
                  <option key={mushaf.id} value={mushaf.id}>
                    {mushaf.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="tools-drawer-note">
              <span className="tools-note-label">قريبًا</span>
              <p>هذه المساحة مهيأة لاستقبال المرشحات النحوية وأدوات التنقل والوظائف البحثية المتقدمة.</p>
            </div>
          </div>
        </div>

        <header>
          <button
            id="brandReset"
            className="brand-reset"
            type="button"
            aria-label="إعادة تعيين مساحة البحث"
            onClick={onResetSearch}
          >
            <h1>بصائر القرآن</h1>
            <p className="brand-subtitle">أداة بحث قرآني</p>
          </button>
        </header>
      </div>

      <div id="searchShell" className={`search-shell${drawerOpen ? " tools-open" : ""}`}>
        <div className="search-box">
          <div className="input-wrapper">
            <span id="searchPrefix" className="search-prefix">
              {searchPrefix}
            </span>
            <input
              id="searchInput"
              ref={inputRef}
              type="text"
              defaultValue={inputValue}
              onChange={(event) => onInputChange(event.target.value)}
              onFocus={onInputFocus}
              onBlur={onInputBlur}
              onKeyDown={onInputKeyDown}
              placeholder="أدخل كلمة أو جذر أو عبارة للبحث"
              autoComplete="off"
            />
            <div
              id="suggestions"
              ref={suggestionsRef}
              className="suggestions-box"
              style={{ display: suggestionsOpen && suggestions.length > 0 ? "block" : "none" }}
            >
              {suggestions.map((item, index) => (
                <button
                  key={`${item.type}-${item.text}-${index}`}
                  className={`suggestion-item${activeSuggestionIndex === index ? " selected" : ""}`}
                  type="button"
                  onMouseEnter={() => onSuggestionHover(index)}
                  onMouseLeave={onSuggestionHoverEnd}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSuggestionSelect(item);
                  }}
                >
                  <span>{item.text}</span> <small>({getSuggestionTypeLabel(searchMode, item)})</small>
                </button>
              ))}
            </div>
          </div>

          <div className="toggles-wrapper" style={{ display: modeControlsVisible ? "flex" : "none" }}>
            {!isPhraseInputValue(query) ? (
              <button
                id="modeToggle"
                className={`mode-toggle ${searchMode === "root" ? "mode-exact" : "mode-root"}`}
                onClick={onSearchModeToggle}
                title="تبديل وضع البحث"
                type="button"
              >
                <span id="modeLabel">{modeToggleLabel}</span>
              </button>
            ) : null}
            {chaklButtonVisible ? (
              <button
                id="chaklToggle"
                className="mode-toggle chakl-toggle"
                type="button"
                onClick={onSuggestionsWithChaklToggle}
                title="تبديل عرض الاقتراحات المشكلة"
              >
                <span id="chaklLabel">{hasArabicDiacritics(query) ? "إزالة التشكيل" : "إضافة التشكيل"}</span>
              </button>
            ) : null}
          </div>

          <button
            id="searchSubmitBtn"
            className="search-submit-btn"
            type="button"
            onClick={() => void onRunSearch()}
            disabled={isSearching}
          >
            {isSearching ? "جارٍ البحث" : "بحث"}
          </button>
        </div>
      </div>
    </>
  );
}
