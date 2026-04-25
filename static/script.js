const API_URL = "/api";

const input = document.getElementById('searchInput');
const suggestionsBox = document.getElementById('suggestions');
const resultsArea = document.getElementById('resultsArea');
const ayahReaderBody = document.getElementById('readerBody');
const ayahReaderSurahName = document.getElementById('readerSurahName');
const resultsPaneTitle = document.getElementById('resultsPaneTitle');
const resultsPaneStats = document.getElementById('resultsPaneStats');
const readerEmptyState = document.getElementById('readerEmptyState');
const readerPageLabel = document.getElementById('readerPageLabel');
const readerPageInput = document.getElementById('readerPageInput');
const readerPrevPageBtn = document.getElementById('readerPrevPage');
const readerNextPageBtn = document.getElementById('readerNextPage');
const readerViewSwitch = document.getElementById('readerViewSwitch');
const showResultsViewBtn = document.getElementById('showResultsView');
const showReaderViewBtn = document.getElementById('showReaderView');
const searchWorkspace = document.getElementById('searchWorkspace');
const readerPane = document.getElementById('readerPane');
const brandReset = document.getElementById('brandReset');
const searchShell = document.getElementById('searchShell');
const toolsDrawer = document.getElementById('toolsDrawer');
const toolsDrawerToggle = document.getElementById('toolsDrawerToggle');
const toolsDrawerClose = document.getElementById('toolsDrawerClose');
const toolsDrawerValue = document.getElementById('toolsDrawerValue');

let searchMode = 'root';
let withChakl = true;
let originalChaklQuery = "";
let selectedMushaf = parseInt(localStorage.getItem('selectedMushaf')) || 1;
let ignoreRootsOnce = false;
let readerState = {
    hasSelection: false,
    mushafId: null,
    selectedAyahId: null,
    selectedVerseKey: null,
    selectedResultKey: null,
    selectedHighlights: [],
    ayahs: [],
    page: null,
    minPage: 1,
    maxPage: 1,
    hasPrevious: false,
    hasNext: false,
    loading: false
};
let workspaceView = 'results';
let readerRequestId = 0;

// Debounce utility
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// Initialize mushaf selector from saved preference
// Initialize mushaf selector from saved preference
document.addEventListener('DOMContentLoaded', () => {
    loadMushafs();
});

function setToolsDrawerOpen(isOpen) {
    if (!searchShell) return;
    const nextState = Boolean(isOpen);
    searchShell.classList.toggle('tools-open', nextState);
    if (toolsDrawerToggle) {
        toolsDrawerToggle.setAttribute('aria-expanded', nextState ? 'true' : 'false');
    }
}

function updateMushafBadge() {
    const mushafSelect = document.getElementById('mushafSelect');
    if (!mushafSelect || !toolsDrawerValue) return;
    const selectedOption = mushafSelect.options[mushafSelect.selectedIndex];
    toolsDrawerValue.textContent = selectedOption ? selectedOption.textContent : 'الرواية';
}

async function loadMushafs() {
    const mushafSelect = document.getElementById('mushafSelect');
    try {
        const res = await fetch(`${API_URL}/mushafs`);
        const mushafs = await res.json();

        mushafSelect.innerHTML = '';
        mushafs.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            opt.title = m.description || m.name;
            mushafSelect.appendChild(opt);
        });

        // Restore selection or default to 1 (Qaloun)
        if (selectedMushaf) {
            // Check if selected exists in new list
            const exists = mushafs.find(m => m.id === selectedMushaf);
            if (exists) {
                mushafSelect.value = selectedMushaf;
            } else {
                // If saved one doesn't exist, default to first (usually Qaloun ID=1)
                selectedMushaf = mushafs[0].id;
                mushafSelect.value = selectedMushaf;
                localStorage.setItem('selectedMushaf', selectedMushaf);
            }
        }
        updateMushafBadge();
    } catch (e) {
        console.error("Failed to load mushafs:", e);
        // Fallback or leave as is (HTML hardcoded ones might remain if fetch fails, but we cleared innerHTML? 
        // Best to leave HTML hardcoded as loading placeholder or fallback.)
        // Actually, if we clear innerHTML, we lose fallback.
        // Let's rely on API.
    }
}

function changeMushaf() {
    const mushafSelect = document.getElementById('mushafSelect');
    selectedMushaf = parseInt(mushafSelect.value);
    localStorage.setItem('selectedMushaf', selectedMushaf);
    updateMushafBadge();
    if (document.body.classList.contains('search-active')) {
        setToolsDrawerOpen(false);
    }
    resetReaderWorkspace();

    // Clear current results and re-search if there's a query
    if (input.value.trim()) {
        performSearch();
    }
}

function normalizeChakl(text) {
    if (!text) return "";
    return text
        .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g, '')
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ء/g, '');
}


function removeQuranicMarks(text) {
    if (!text || typeof text !== 'string') return "";
    // Removes:
    // \u0610-\u061A (Honorifics, marks)
    // \u06D6-\u06ED (Pause marks, Rub El Hizb, Sajdah, etc.)
    return text.replace(/[\u0610-\u061A\u06D6-\u06ED]/g, '');
}

// Helper to clean and deduplicate a list of suggestion items
function hasChakl(text) {
    if (!text) return false;
    // Checks for specific Arabic diacritics (064B-0652, 0670)
    // Fathatan, Dammatan, Kasratan, Fatha, Damma, Kasra, Shadda, Sukun, Dagger Alif
    return /[\u064B-\u0652\u0670]/.test(text);
}

// Update `removeChakl` to also strip these symbols
function removeChakl(text) {
    if (!text || typeof text !== 'string') return "";
    // Removes: Tashkeel (064B-065F), Dagger Alif (0670), and Quranic Marks
    return text.replace(/[\u064B-\u065F\u0670\u0610-\u061A\u06D6-\u06ED]/g, '');
}

// Helper to clean and deduplicate a list of suggestion items
function cleanAndDeduplicate(items) {
    const uniqueItems = new Map();
    items.forEach(item => {
        // Clean textual content (keep Chakl, remove Pause Marks)
        const cleanText = removeQuranicMarks(item.text);

        // Use cleanText for display and key
        // We create a new item object to avoid mutating the original unexpected ways
        const newItem = { ...item, text: cleanText };

        const key = `${newItem.text}_${newItem.type}`;
        if (!uniqueItems.has(key)) {
            uniqueItems.set(key, newItem);
        }
    });
    return Array.from(uniqueItems.values());
}

async function processBackgroundYamli(yamliSuggestions, withChaklRequest = suggestionChaklMode) {
    const searchId = ++currentSearchId;
    const MAX_CANDIDATES = 5;
    const activeQuery = input.value;
    const suggestionContext = getSuggestionContext(activeQuery);

    // Collect valid candidates
    const candidates = [];
    const seenCandidates = new Set();

    // YAMLI UI TEXTS blocklist is defined above in global scope

    for (let i = 0; i < yamliSuggestions.length; i++) {
        let word = (yamliSuggestions[i].trans) ? yamliSuggestions[i].trans : yamliSuggestions[i];

        if (typeof word === 'string') {
            word = word.trim();
            // Valid Arabic check + blocklist check
            if (word && !seenCandidates.has(word) && !YAMLI_UI_TEXTS.has(word) && /[\u0600-\u06FF]/.test(word)) {
                candidates.push(word);
                seenCandidates.add(word);
                if (candidates.length >= MAX_CANDIDATES) break;
            }
        }
    }

    if (candidates.length === 0) return;

    const queries = suggestionContext.prefixQuery
        ? candidates.map((candidate) => `${suggestionContext.prefixQuery} ${candidate}`)
        : candidates;

    try {
        // Optimized: Send single batch request
        const res = await fetch(`${API_URL}/suggest-batch`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                queries,
                mushaf: selectedMushaf,
                mode: searchMode,
                with_chakl: withChaklRequest
            })
        });

        if (searchId !== currentSearchId) return;

        const rawSuggestions = await res.json();
        const cleanedSuggestions = cleanAndDeduplicate(rawSuggestions);

        displaySuggestions(cleanedSuggestions);

    } catch (e) {
        // Silently fail on network errors
    }
}

// ... displaySuggestions uses removeChakl internally, which is now updated ...

async function fetchAppSuggestions(query, withChaklRequest = suggestionChaklMode) {
    const suggestionContext = getSuggestionContext(query);
    if (!suggestionContext.sourceQuery || suggestionContext.sourceQuery.length < 2) {
        hideSuggestions();
        return;
    }

    try {
        const requestQuery = suggestionContext.prefixQuery ? query.trim() : suggestionContext.sourceQuery;
        const res = await fetch(`${API_URL}/suggest?q=${encodeURIComponent(requestQuery)}&mushaf=${selectedMushaf}&mode=${searchMode}&with_chakl=${withChaklRequest}`);
        const data = await res.json();
        const contextualData = suggestionContext.prefixQuery ? data : applySuggestionContextToItems(query, data);
        const cleanedData = cleanAndDeduplicate(contextualData);
        displaySuggestions(cleanedData);
        lastValue = getInputTrackingValue(input.value);
    } catch (err) {
        suggestionsBox.style.display = 'none';
    }
}

async function fetchVocalizedSuggestionsForCurrentInput() {
    const query = input.value.trim();
    if (!query) return;

    suggestionChaklMode = true;
    const existingSuggestions = currentSuggestionData.slice();

    try {
        if (/[a-zA-Z]/.test(query) && existingSuggestions.length > 0) {
            const queries = existingSuggestions
                .filter(item => item.type === 'word')
                .map(item => removeChakl(item.text))
                .filter(Boolean)
                .slice(0, 5);

            if (queries.length > 0) {
                const res = await fetch(`${API_URL}/suggest-batch`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        queries,
                        mushaf: selectedMushaf,
                        mode: 'exact',
                        with_chakl: true
                    })
                });
                const data = await res.json();
                suggestionChaklMode = true;
                displaySuggestions(cleanAndDeduplicate(data));
                lastValue = getInputTrackingValue(input.value);
                return;
            }
        }

        await fetchAppSuggestions(query, true);
        suggestionChaklMode = true;
        lastValue = getInputTrackingValue(input.value);
    } catch (err) {
        suggestionsBox.style.display = 'none';
    }
}

function toggleChaklMode() {
    if (withChakl) {
        // REMOVING CHAKL: commit a plain search immediately.
        originalChaklQuery = input.value;
        input.value = removeChakl(input.value);
        withChakl = false;
        suggestionChaklMode = false;
        lastValue = getInputTrackingValue(input.value);
        hideSuggestions();
        updateModeUI();
        updateUiState(input.value);
        updateChaklUI();
        performSearch();
        return;
    }

    // ADDING CHAKL: only open vocalized suggestions. Do not mutate the input or committed state yet.
    suggestionChaklMode = true;
    ignoreRootsOnce = true;
    lastValue = null;
    updateChaklUI();
    fetchVocalizedSuggestionsForCurrentInput();
}

function updateChaklUI() {
    const chaklToggle = document.getElementById('chaklToggle');
    const chaklLabel = document.getElementById('chaklLabel');

    if (searchMode === 'root') {
        chaklToggle.style.display = 'none';
        return;
    }

    // Only show if we have a query or valid state
    if (input.value.trim()) {
        chaklToggle.style.display = 'inline-block';
        if (withChakl) {
            chaklLabel.textContent = 'إزالة التشكيل';
        } else {
            chaklLabel.textContent = 'إضافة التشكيل';
        }
    } else {
        chaklToggle.style.display = 'none';
    }
}

function toggleSearchMode() {
    if (isPhraseInputValue(input.value)) {
        searchMode = 'exact';
        updateModeUI();
        updateChaklUI();
        return;
    }

    searchMode = searchMode === 'root' ? 'exact' : 'root';
    updateModeUI();

    // Sync chakl state with actual text content when switching modes
    if (searchMode === 'exact' && input.value.trim()) {
        withChakl = hasChakl(input.value);
    }

    updateChaklUI();

    if (input.value.trim()) {
        if (searchMode === 'exact') {
            // When switching to Word mode, treat current input as potential base for chakl
            originalChaklQuery = input.value;
        }
        performSearch();
    }
}

function updateModeUI() {
    const modeLabel = document.getElementById('modeLabel');
    const modeToggle = document.getElementById('modeToggle');

    if (searchMode === 'root') {
        modeLabel.textContent = 'كلمة';
        modeToggle.className = 'mode-toggle mode-exact';
    } else {
        modeLabel.textContent = 'جذر';
        modeToggle.className = 'mode-toggle mode-root';
    }

    if (modeToggle && isPhraseInputValue(input.value)) {
        modeToggle.style.display = 'none';
    }

    updateSearchPrefixLabel(input.value);
}

const themeToggleBtn = document.getElementById('themeToggle');
const savedTheme = localStorage.getItem('theme');

if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
    themeToggleBtn.textContent = '🌙';
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    themeToggleBtn.textContent = isLight ? '🌙' : '☀️';
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
}

// Debounced API call for regular input
const debouncedFetch = debounce(fetchAppSuggestions, 200);

// Debounced Yamli processing
const debouncedYamliProcess = debounce(processBackgroundYamli, 200);

let yamliInitialized = false;

function initYamli() {
    if (yamliInitialized) return tryHookYamli();
    yamliInitialized = true;

    // Create style to hide Yamli visually but keep it rendered
    const style = document.createElement('style');
    style.innerHTML = `
        #yamli_div, .yamliapi_parent, .yamliapi_menuBorder, .yamliapi_menuContent {
            /* We use opacity 0 to keep it rendered in the DOM so it updates, but invisible to user */
            opacity: 0 !important;
            pointer-events: none !important;
            position: absolute !important;
            z-index: -1000 !important;
            /* Do NOT set display:none or visibility:hidden as that might stop Yamli from updating */
        }
    `;
    document.head.appendChild(style);

    // Keyboard navigation handlers
    document.addEventListener('keydown', function (e) {
        if (document.activeElement === input) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopImmediatePropagation();
                if (suggestionsBox.style.display === 'block' && currentSuggestionData.length > 0) {
                    isKeyboardNavigating = true;
                    selectedSuggestionIndex = (selectedSuggestionIndex + 1) % currentSuggestionData.length;
                    updateSuggestionHighlight();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopImmediatePropagation();
                if (suggestionsBox.style.display === 'block' && currentSuggestionData.length > 0) {
                    isKeyboardNavigating = true;
                    selectedSuggestionIndex = selectedSuggestionIndex <= 0 ? currentSuggestionData.length - 1 : selectedSuggestionIndex - 1;
                    updateSuggestionHighlight();
                }
            } else if (e.key === 'Enter') {
                // Only prevent default if we're actually selecting a suggestion
                if (suggestionsBox.style.display === 'block' && selectedSuggestionIndex >= 0) {
                    e.preventDefault();
                    selectSuggestion(selectedSuggestionIndex);
                } else {
                    // Let Yamli handle the Enter key for transliteration if needed, 
                    // or just perform search
                    performSearch();
                }
            } else if (e.key === 'Escape') {
                if (suggestionsBox.style.display === 'block') {
                    revertSuggestionPreview();
                    suggestionsBox.style.display = 'none';
                    selectedSuggestionIndex = -1;
                    suggestionPreviewOriginalValue = null;
                    suggestionPreviewSource = null;
                }
            }
        }
    }, true);

    // DOM Observer to catch Yamli updates if hook fails or in addition to it
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            const target = mutation.target;
            if (target && (target.classList.contains('yamliapi_menuContent') || target.closest('.yamliapi_menuContent'))) {
                const menuContent = target.classList.contains('yamliapi_menuContent') ? target : target.closest('.yamliapi_menuContent');
                if (menuContent) {
                    const suggestions = [];
                    menuContent.querySelectorAll('div').forEach(div => {
                        const text = div.textContent.trim();
                        if (text) suggestions.push(text);
                    });

                    if (suggestions.length > 0) {
                        debouncedYamliProcess(suggestions, suggestionChaklMode);
                    }
                }
            }

            // Enforce hiding style on added nodes just in case
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1 && (node.id === 'yamli_div' || node.classList.contains('yamliapi_parent'))) {
                    node.style.opacity = '0';
                    node.style.pointerEvents = 'none';
                    node.style.zIndex = '-1000';
                }
            });
        });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    tryHookYamli();
}

function tryHookYamli() {
    if (typeof Yamli === 'object' && Yamli.global) {
        if (Yamli.global.setKeyboardEnabled) {
            Yamli.global.setKeyboardEnabled(false);
        }

        if (!Yamli.global._originalRegister) {
            Yamli.global._originalRegister = Yamli.global.registerTransliteration;
            Yamli.global.registerTransliteration = function (word, suggestions, index) {
                // Enforce style on parents
                document.querySelectorAll('.yamliapi_parent, .yamliapi_menuBorder, #yamli_div').forEach(el => {
                    el.style.setProperty('opacity', '0', 'important');
                    el.style.setProperty('pointer-events', 'none', 'important');
                    el.style.setProperty('z-index', '-1000', 'important');
                });

                const res = Yamli.global._originalRegister.apply(this, arguments);

                if (suggestions && suggestions.length > 0) {
                    debouncedYamliProcess([...suggestions], suggestionChaklMode);
                }
                return res;
            };
        }
    } else {
        // Retry hooking if Yamli not ready yet
        setTimeout(tryHookYamli, 500);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initYamli();
    updateModeUI();
    document.querySelector('.toggles-wrapper').style.display = 'none';
    document.getElementById('modeToggle').style.display = 'none';
    const prefix = document.getElementById('searchPrefix');
    if (prefix) prefix.style.display = 'none';
    initQuranReaderWorkspace();
    updateMushafBadge();
    setToolsDrawerOpen(true);
    if (brandReset) {
        brandReset.addEventListener('click', resetSearchExperience);
        brandReset.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                resetSearchExperience();
            }
        });
    }
    if (toolsDrawerToggle) {
        toolsDrawerToggle.addEventListener('click', () => {
            setToolsDrawerOpen(!searchShell?.classList.contains('tools-open'));
        });
    }
    if (toolsDrawerClose) {
        toolsDrawerClose.addEventListener('click', () => setToolsDrawerOpen(false));
    }
});

let lastValue = "";
let currentSearchId = 0;
let selectedSuggestionIndex = -1;
let currentSuggestionData = [];
let isKeyboardNavigating = false;
let suggestionPreviewOriginalValue = null;
let suggestionPreviewOriginalMode = null;
let suggestionPreviewOriginalWithChakl = null;
let suggestionPreviewSource = null;
let suggestionChaklMode = false;

// Common Yamli UI strings to ignore
const YAMLI_UI_TEXTS = new Set([
    "اعرض المزيد", "كلمة ناقصة", "أغلق", "خيارات", "مساعدة",
    "تفعيل الخدمة", "تعطيل الخدمة", "من اليسار إلى اليمين",
    "من اليمين إلى اليسار", "نصائح سريعة", "Powered by Yamli.com"
]);



function isPhraseInputValue(value) {
    return value.trim().includes(' ');
}

function isPhraseExactInput(value) {
    return searchMode === 'exact' && isPhraseInputValue(value);
}

function getSuggestionContext(query) {
    if (!isPhraseExactInput(query)) {
        return { sourceQuery: query.trim(), prefixQuery: '' };
    }

    const tokens = query.trim().split(/\s+/);
    return {
        sourceQuery: tokens[tokens.length - 1],
        prefixQuery: tokens.slice(0, -1).join(' ')
    };
}

function applySuggestionContextToItems(query, items) {
    const suggestionContext = getSuggestionContext(query);
    if (!suggestionContext.prefixQuery) {
        return items;
    }

    const prefix = `${suggestionContext.prefixQuery} `;
    return items
        .filter(item => item.type === 'word')
        .map(item => ({
            ...item,
            text: `${prefix}${item.text}`,
            label: `${prefix}${item.label || item.text}`
        }));
}

function updateSearchPrefixLabel(value = '') {
    const prefix = document.getElementById('searchPrefix');
    if (!prefix) return;

    if (searchMode === 'root') {
        prefix.textContent = 'جذر';
        return;
    }

    prefix.textContent = isPhraseExactInput(value || input.value || '') ? 'عبارة' : 'كلمة';
}

function hideSuggestions() {
    suggestionsBox.innerHTML = '';
    suggestionsBox.style.display = 'none';
    selectedSuggestionIndex = -1;
    currentSuggestionData = [];
    suggestionPreviewOriginalValue = null;
    suggestionPreviewOriginalMode = null;
    suggestionPreviewOriginalWithChakl = null;
    suggestionPreviewSource = null;
    suggestionChaklMode = false;
}

function getSuggestionTypeLabel(item) {
    if (item.type === 'root') {
        return 'جذر';
    }

    if (searchMode === 'exact' && item.text && item.text.trim().includes(' ')) {
        return 'عبارة';
    }

    return 'كلمة';
}

function displaySuggestions(data) {
    suggestionsBox.innerHTML = '';
    selectedSuggestionIndex = -1;
    suggestionPreviewOriginalValue = null;
    suggestionPreviewOriginalMode = null;
    suggestionPreviewOriginalWithChakl = null;
    suggestionPreviewSource = null;
    if (ignoreRootsOnce) {
        data = data.filter(item => item.type !== 'root');
        ignoreRootsOnce = false;
    }

    currentSuggestionData = data.slice(0, 10);

    if (currentSuggestionData.length > 0) {
        currentSuggestionData.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.setAttribute('data-index', index);

            let htmlContent = '';

            // Add normalized option if it's a word and has chakl (and normalized is different)
            const normText = removeChakl(item.text);
            if (false && item.type === 'word' && normText !== item.text) {
                htmlContent += `<div class="suggestion-normalized" onclick="selectSuggestion(${index}, true)"><span>${normText} ←</span></div>`;
            }

            htmlContent += `<span>${item.text}</span> <small>(${getSuggestionTypeLabel(item)})</small>`;
            div.innerHTML = htmlContent;

            div.onclick = (e) => {
                // Prevent double trigger if normalized clicked
                if (e.target.closest('.suggestion-normalized')) return;
                selectSuggestion(index, false);
            };
            div.onmouseenter = () => {
                if (!isKeyboardNavigating) {
                    selectedSuggestionIndex = index;
                    updateSuggestionHighlight();
                }
            };
            div.onmousemove = () => {
                isKeyboardNavigating = false;
            };
            suggestionsBox.appendChild(div);
        });
        suggestionsBox.style.display = 'block';
    } else {
        suggestionsBox.style.display = 'none';
    }
}

function getInputTrackingValue(value) {
    const suggestionContext = getSuggestionContext(value);
    return suggestionContext.prefixQuery ? `${suggestionContext.prefixQuery}|${suggestionContext.sourceQuery}` : value;
}

function getSuggestionInputValue(item, forceNormalized = false) {
    return forceNormalized ? removeChakl(item.text) : item.text;
}

function applySuggestionToInput(item, forceNormalized = false, commit = true) {
    const nextValue = getSuggestionInputValue(item, forceNormalized);
    input.value = nextValue;
    lastValue = getInputTrackingValue(nextValue);
    searchMode = item.type === 'root' ? 'root' : 'exact';

    if (commit) {
        withChakl = !forceNormalized && hasChakl(nextValue);
        originalChaklQuery = forceNormalized ? item.text : nextValue;
        suggestionChaklMode = false;
        updateModeUI();
        updateUiState(nextValue);
        updateChaklUI();
    } else {
        updateModeUI();
        updateSearchPrefixLabel(nextValue);
    }
}

function previewSuggestion(index, source = 'keyboard') {
    if (index < 0 || index >= currentSuggestionData.length) return;

    if (suggestionPreviewOriginalValue === null) {
        suggestionPreviewOriginalValue = input.value;
        suggestionPreviewOriginalMode = searchMode;
        suggestionPreviewOriginalWithChakl = withChakl;
    }
    suggestionPreviewSource = source;

    applySuggestionToInput(currentSuggestionData[index], false, false);
}

function revertSuggestionPreview(source = null) {
    if (suggestionPreviewOriginalValue === null) return;
    if (source && suggestionPreviewSource !== source) return;

    const originalValue = suggestionPreviewOriginalValue;
    const originalMode = suggestionPreviewOriginalMode;
    const originalWithChakl = suggestionPreviewOriginalWithChakl;
    input.value = originalValue;
    searchMode = originalMode || searchMode;
    if (originalWithChakl !== null) {
        withChakl = originalWithChakl;
    }
    lastValue = getInputTrackingValue(originalValue);
    suggestionPreviewOriginalValue = null;
    suggestionPreviewOriginalMode = null;
    suggestionPreviewOriginalWithChakl = null;
    suggestionPreviewSource = null;
    selectedSuggestionIndex = -1;
    updateModeUI();
    updateUiState(originalValue);
    updateChaklUI();
    updateSuggestionHighlight();
}

function selectSuggestion(index, forceNormalized = false) {
    if (index >= 0 && index < currentSuggestionData.length) {
        const item = currentSuggestionData[index];

        applySuggestionToInput(item, forceNormalized);
        suggestionsBox.innerHTML = '';
        suggestionsBox.style.display = 'none';
        selectedSuggestionIndex = -1;
        suggestionPreviewOriginalValue = null;
        suggestionPreviewOriginalMode = null;
        suggestionPreviewOriginalWithChakl = null;
        suggestionPreviewSource = null;
        suggestionChaklMode = false;
        performSearch();
    }
}

function updateSuggestionHighlight() {
    const items = suggestionsBox.querySelectorAll('.suggestion-item');
    items.forEach((item, idx) => {
        if (idx === selectedSuggestionIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            if (isKeyboardNavigating) {
                previewSuggestion(idx, 'keyboard');
            }
        } else {
            item.classList.remove('selected');
        }
    });
}

// Old fetchAppSuggestions removed

async function handleInput(keepSuggestionMode = false) {
    const val = input.value;
    if (!keepSuggestionMode) {
        if (suggestionPreviewOriginalValue !== null) {
            suggestionPreviewOriginalValue = null;
            suggestionPreviewOriginalMode = null;
            suggestionPreviewOriginalWithChakl = null;
            suggestionPreviewSource = null;
            suggestionChaklMode = false;
        } else {
            suggestionChaklMode = false;
        }
    }
    updateUiState(val);

    if (/[a-zA-Z]/.test(val)) {
        // Do nothing else, Yamli observer will handle suggestions
        return;
    }

    const suggestionContext = getSuggestionContext(val);
    const effectiveValue = suggestionContext.prefixQuery ? `${suggestionContext.prefixQuery}|${suggestionContext.sourceQuery}` : val;
    if (effectiveValue === lastValue && val.length > 0) return;
    lastValue = effectiveValue;

    if (!suggestionContext.sourceQuery || suggestionContext.sourceQuery.length < 2) {
        hideSuggestions();
        return;
    }

    // Debounced call
    debouncedFetch(val, suggestionChaklMode);
}

function updateUiState(val, options = {}) {
    const togglesWrapper = document.querySelector('.toggles-wrapper');
    const modeToggle = document.getElementById('modeToggle');
    const chaklToggle = document.getElementById('chaklToggle');
    const prefix = document.getElementById('searchPrefix');

    if (val.length > 0) {
        const isPhrase = isPhraseInputValue(val);
        if (isPhrase && searchMode !== 'exact') {
            searchMode = 'exact';
            updateModeUI();
        }

        if (togglesWrapper) togglesWrapper.style.display = 'flex';
        modeToggle.style.display = isPhrase ? 'none' : 'block';
        if (prefix) {
            prefix.style.display = 'inline';
            updateSearchPrefixLabel(val);
        }

        updateChaklUI();
    } else {
        if (togglesWrapper) togglesWrapper.style.display = 'none';
        modeToggle.style.display = 'none';
        chaklToggle.style.display = 'none';
        if (prefix) prefix.style.display = 'none';
        if (!options.preserveSearchShell) {
            document.body.classList.remove('search-active', 'search-loading');
        }
    }
}

input.addEventListener('input', handleInput);
input.addEventListener('change', handleInput);
input.addEventListener('keyup', handleInput);
input.addEventListener('click', handleInput);
setInterval(() => {
    if (getInputTrackingValue(input.value) !== lastValue) {
        handleInput();
    }
}, 200);

document.addEventListener('click', (e) => {
    if (
        e.target !== input
        && e.target.closest('#suggestions') === null
        && e.target.closest('.toggles-wrapper') === null
    ) {
        hideSuggestions();
    }

    if (
        document.body.classList.contains('search-active')
        && searchShell?.classList.contains('tools-open')
        && e.target.closest('#toolsDrawer') === null
        && e.target.closest('#toolsDrawerToggle') === null
    ) {
        setToolsDrawerOpen(false);
    }
});

async function performSearch() {
    const query = input.value.trim();
    if (!query) return;
    document.body.classList.add('search-active', 'search-loading');
    setToolsDrawerOpen(false);
    resetReaderWorkspace();
    withChakl = hasChakl(query);
    suggestionChaklMode = false;
    updateChaklUI();

    const nextSearchContext = {
        q: query,
        mode: searchMode,
        mushaf: selectedMushaf
    };

    if (resultsArea) {
        resultsArea.innerHTML = '';
    }
    document.getElementById('errorArea').classList.add('hidden');
    document.getElementById('loading').classList.remove('hidden');
    setWorkspaceVisible(false);

    try {
        const response = await fetch(`${API_URL}/search-v2?q=${encodeURIComponent(query)}&mode=${searchMode}&mushaf=${selectedMushaf}&page_size=${ITEMS_PER_PAGE}`);
        const data = await response.json();

        document.getElementById('loading').classList.add('hidden');
        document.body.classList.remove('search-loading');

        if (!response.ok || !data.found) {
            currentResults = [];
            currentSearchContext = null;
            resultPageState = new Map();
            resetReaderWorkspace();
            showError("\u0644\u0645 \u064a\u062a\u0645 \u0627\u0644\u0639\u062b\u0648\u0631 \u0639\u0644\u0649 \u0646\u062a\u0627\u0626\u062c. \u062d\u0627\u0648\u0644 \u0628\u0643\u0644\u0645\u0629 \u0623\u062e\u0631\u0649.", data.did_you_mean);
            return;
        }

        currentSearchContext = nextSearchContext;
        renderResults(data.results);
    } catch (error) {
        currentResults = [];
        currentSearchContext = null;
        resultPageState = new Map();
        resetReaderWorkspace();
        document.getElementById('loading').classList.add('hidden');
        document.body.classList.remove('search-loading');
        showError("\u062d\u062f\u062b \u062e\u0637\u0623 \u0641\u064a \u0627\u0644\u0627\u062a\u0635\u0627\u0644 \u0628\u0627\u0644\u062e\u0627\u062f\u0645.");
    }
}

function resetResultsPaneSummary() {
    if (resultsPaneTitle) {
        resultsPaneTitle.textContent = 'نتائج البحث';
    }
    if (resultsPaneStats) {
        resultsPaneStats.textContent = '';
        resultsPaneStats.classList.add('hidden');
    }
}

function resetSearchExperience() {
    currentResults = [];
    currentSearchContext = null;
    resultPageState = new Map();
    readerRequestId += 1;
    input.value = '';
    lastValue = '';
    originalChaklQuery = '';
    withChakl = false;
    suggestionChaklMode = false;
    searchMode = 'root';
    setToolsDrawerOpen(false);
    hideSuggestions();
    if (resultsArea) {
        resultsArea.innerHTML = '';
        resultsArea.classList.add('hidden');
    }
    document.getElementById('errorArea').classList.add('hidden');
    document.getElementById('loading').classList.add('hidden');
    document.body.classList.remove('search-loading');
    updateModeUI();
    updateUiState('', { preserveSearchShell: true });
    updateChaklUI();

    const finishReset = () => {
        searchWorkspace?.classList.remove('workspace-collapsing');
        readerViewSwitch?.classList.remove('workspace-collapsing');
        resetResultsPaneSummary();
        resetReaderWorkspace();
        document.body.classList.remove('search-active');
        setToolsDrawerOpen(true);
        input.focus();
    };

    if (searchWorkspace && !searchWorkspace.classList.contains('hidden')) {
        searchWorkspace.classList.add('workspace-collapsing');
        readerViewSwitch?.classList.add('workspace-collapsing');
        setTimeout(finishReset, 240);
    } else {
        finishReset();
    }
}

function applyDidYouMeanSuggestion(text) {
    input.value = text;
    lastValue = text;
    originalChaklQuery = text;
    withChakl = hasChakl(text);
    searchMode = 'exact';
    updateModeUI();
    updateUiState(text);
    updateChaklUI();
    hideSuggestions();
    performSearch();
}

function showError(msg, didYouMean = null) {
    const errDiv = document.getElementById('errorArea');
    errDiv.innerHTML = '';

    const message = document.createElement('div');
    message.className = 'error-message';
    message.textContent = msg;
    errDiv.appendChild(message);

    if (didYouMean && didYouMean.text) {
        const suggestion = document.createElement('div');
        suggestion.className = 'did-you-mean';

        const label = document.createElement('span');
        label.textContent = '\u0647\u0644 \u062a\u0642\u0635\u062f:';
        suggestion.appendChild(label);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'did-you-mean-btn';
        button.textContent = didYouMean.text;
        button.onclick = () => applyDidYouMeanSuggestion(didYouMean.text);
        suggestion.appendChild(button);

        errDiv.appendChild(suggestion);
    }

    errDiv.classList.remove('hidden');
}

function renderHighlightedVerseText(text, highlights = []) {
    const highlightSet = new Set(highlights || []);
    return text.split(' ').map((word, index) => {
        if (highlightSet.has(index + 1)) {
            return `<span class="highlight">${word}</span>`;
        }
        return word;
    }).join(' ');
}

function resetReaderState() {
    readerState = {
        hasSelection: false,
        mushafId: null,
        selectedAyahId: null,
        selectedVerseKey: null,
        selectedResultKey: null,
        selectedHighlights: [],
        ayahs: [],
        page: null,
        minPage: 1,
        maxPage: 1,
        hasPrevious: false,
        hasNext: false,
        loading: false
    };
}

function setWorkspaceVisible(isVisible) {
    if (!searchWorkspace) return;
    if (isVisible) {
        searchWorkspace.classList.remove('workspace-collapsing');
        readerViewSwitch?.classList.remove('workspace-collapsing');
    }
    searchWorkspace.classList.toggle('hidden', !isVisible);
    if (readerViewSwitch) {
        readerViewSwitch.classList.toggle('hidden', !isVisible);
    }
}

function setWorkspaceView(view) {
    workspaceView = view === 'reader' ? 'reader' : 'results';
    if (searchWorkspace) {
        searchWorkspace.dataset.view = workspaceView;
    }
    if (showResultsViewBtn) {
        showResultsViewBtn.classList.toggle('active', workspaceView === 'results');
        showResultsViewBtn.setAttribute('aria-pressed', workspaceView === 'results' ? 'true' : 'false');
    }
    if (showReaderViewBtn) {
        showReaderViewBtn.classList.toggle('active', workspaceView === 'reader');
        showReaderViewBtn.setAttribute('aria-pressed', workspaceView === 'reader' ? 'true' : 'false');
    }
}

function updateReaderPageControls() {
    const hasPage = Number.isFinite(readerState.page);
    if (readerPageLabel) {
        readerPageLabel.textContent = hasPage ? `صفحة ${readerState.page} من ${readerState.maxPage}` : 'صفحة -';
    }
    if (readerPageInput) {
        readerPageInput.disabled = !hasPage || readerState.loading;
        readerPageInput.min = readerState.minPage || 1;
        readerPageInput.max = readerState.maxPage || 1;
        readerPageInput.value = hasPage ? readerState.page : '';
    }
    if (readerPrevPageBtn) {
        readerPrevPageBtn.disabled = !hasPage || !readerState.hasPrevious || readerState.loading;
    }
    if (readerNextPageBtn) {
        readerNextPageBtn.disabled = !hasPage || !readerState.hasNext || readerState.loading;
    }
}

function setReaderLoading(isLoading) {
    readerState.loading = isLoading;
    if (readerPane) {
        readerPane.classList.toggle('page-loading', isLoading);
    }
    if (readerEmptyState) {
        readerEmptyState.classList.toggle('hidden', isLoading || readerState.hasSelection);
    }
    if (ayahReaderBody) {
        ayahReaderBody.classList.toggle('hidden', !readerState.hasSelection);
    }
}

function resetReaderWorkspace() {
    readerRequestId += 1;
    resetReaderState();
    setWorkspaceView('results');
    setWorkspaceVisible(false);
    if (ayahReaderBody) {
        ayahReaderBody.innerHTML = '';
        ayahReaderBody.classList.add('hidden');
    }
    if (readerEmptyState) {
        readerEmptyState.classList.remove('hidden');
    }
    if (ayahReaderSurahName) {
        ayahReaderSurahName.textContent = 'اختر آية من النتائج';
    }
    if (readerPageLabel) {
        readerPageLabel.textContent = 'صفحة -';
    }
    if (readerPageInput) {
        readerPageInput.value = '';
        readerPageInput.removeAttribute('max');
    }
    resetResultsPaneSummary();
    updateReaderPageControls();
}

function initQuranReaderWorkspace() {
    if (showResultsViewBtn) {
        showResultsViewBtn.addEventListener('click', () => setWorkspaceView('results'));
    }
    if (showReaderViewBtn) {
        showReaderViewBtn.addEventListener('click', () => setWorkspaceView('reader'));
    }
    if (readerPrevPageBtn) {
        readerPrevPageBtn.addEventListener('click', () => loadReaderPage(readerState.page - 1));
    }
    if (readerNextPageBtn) {
        readerNextPageBtn.addEventListener('click', () => loadReaderPage(readerState.page + 1));
    }
    if (readerPageInput) {
        readerPageInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                goToReaderInputPage();
            }
        });
        readerPageInput.addEventListener('blur', () => goToReaderInputPage());
    }
    resetReaderWorkspace();
}

function getVerseSelectionKey(resultKey, verse) {
    const highlightKey = Array.isArray(verse.highlights) ? verse.highlights.join(',') : '';
    return `${resultKey || 'result'}:${verse.ayah_id}:${highlightKey}`;
}

function getResultLabelText(result) {
    if (result.search_type === 'exact') {
        return result.match_type === 'phrase' ? 'العبارة' : 'الكلمة';
    }
    return 'الجذر';
}

function updateResultsPaneSummary() {
    if (!resultsPaneTitle || !resultsPaneStats) return;

    if (!currentResults || currentResults.length === 0) {
        resetResultsPaneSummary();
        return;
    }

    if (currentResults.length === 1) {
        const result = currentResults[0];
        resultsPaneTitle.textContent = `${getResultLabelText(result)}: ${result.root}`;
        resultsPaneStats.textContent = '';
        resultsPaneStats.classList.add('hidden');
        return;
    }

    const query = currentSearchContext?.q || input.value.trim();
    resultsPaneTitle.textContent = query ? `نتائج: ${query}` : 'نتائج البحث';
    resultsPaneStats.textContent = '';
    resultsPaneStats.classList.add('hidden');
}

function getFirstResultSelection() {
    for (const result of currentResults) {
        const verses = Array.isArray(result.verses) ? result.verses : [];
        if (verses.length > 0) {
            return { resultKey: result.result_key, verse: verses[0] };
        }
    }
    return null;
}

function primeReaderSelection(selection) {
    if (!selection) {
        return;
    }

    const { verse, resultKey } = selection;
    readerState.hasSelection = true;
    readerState.mushafId = verse.mushaf_id || selectedMushaf;
    readerState.selectedAyahId = verse.ayah_id;
    readerState.selectedVerseKey = getVerseSelectionKey(resultKey, verse);
    readerState.selectedResultKey = resultKey;
    readerState.selectedHighlights = Array.isArray(verse.highlights) ? verse.highlights : [];
}

function getReaderSurahTitle() {
    if (!readerState.ayahs.length) {
        return 'اختر آية من النتائج';
    }

    const names = [];
    readerState.ayahs.forEach((ayah) => {
        if (ayah.surah && !names.includes(ayah.surah)) {
            names.push(ayah.surah);
        }
    });
    return names.length ? `سورة ${names.join('، ')}` : 'صفحة من المصحف';
}

function renderQuranPage() {
    if (!ayahReaderBody) return;

    ayahReaderBody.innerHTML = '';

    if (!readerState.hasSelection) {
        updateReaderPageControls();
        return;
    }

    const pageCard = document.createElement('div');
    pageCard.className = 'quran-page-card';

    const pageText = document.createElement('div');
    pageText.className = 'quran-page-text';

    let currentSurahId = null;
    readerState.ayahs.forEach((ayah) => {
        if (ayah.surah_id !== currentSurahId) {
            currentSurahId = ayah.surah_id;
            const surahBreak = document.createElement('div');
            surahBreak.className = 'reader-surah-break';
            surahBreak.textContent = `سورة ${ayah.surah}`;
            pageText.appendChild(surahBreak);
        }

        const ayahSpan = document.createElement('span');
        ayahSpan.className = `quran-page-ayah${ayah.is_selected ? ' selected' : ''}`;
        ayahSpan.dataset.ayahId = ayah.ayah_id;
        const cleanAyahText = (ayah.text || '').trim();

        const ayahText = ayah.is_selected
            ? renderHighlightedVerseText(cleanAyahText, readerState.selectedHighlights)
            : cleanAyahText;

        ayahSpan.innerHTML = `${ayahText}<span class="quran-ayah-number">﴿${ayah.ayah}﴾</span>`;
        pageText.appendChild(ayahSpan);
    });

    pageCard.appendChild(pageText);
    ayahReaderBody.appendChild(pageCard);

    if (ayahReaderSurahName) {
        ayahReaderSurahName.textContent = getReaderSurahTitle();
    }
    updateReaderPageControls();

    const selectedAyah = ayahReaderBody.querySelector('.quran-page-ayah.selected');
    if (selectedAyah) {
        selectedAyah.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
}

function applyQuranPagePayload(data) {
    readerState.mushafId = data.mushaf_id;
    readerState.ayahs = Array.isArray(data.ayahs) ? data.ayahs : [];
    readerState.page = data.page;
    readerState.minPage = data.min_page || 1;
    readerState.maxPage = data.max_page || data.total_pages || 1;
    readerState.hasPrevious = Boolean(data.has_previous);
    readerState.hasNext = Boolean(data.has_next);
    readerState.hasSelection = true;
}

async function loadReaderPage(page) {
    if (!readerState.hasSelection || readerState.loading) {
        return;
    }

    const requestedPage = clampPage(page, readerState.maxPage || 1);
    const requestId = ++readerRequestId;
    setReaderLoading(true);
    updateReaderPageControls();

    try {
        const response = await fetch(
            `${API_URL}/quran-page?mushaf=${readerState.mushafId || selectedMushaf}&page=${requestedPage}&selected_ayah_id=${readerState.selectedAyahId}`
        );
        const data = await response.json();
        if (!response.ok || !data.found) {
            throw new Error('Failed to load Quran page');
        }
        if (requestId !== readerRequestId) {
            return;
        }

        applyQuranPagePayload(data);
        renderQuranPage();
    } catch (error) {
        showError('حدث خطأ في تحميل صفحة المصحف.');
    } finally {
        if (requestId === readerRequestId) {
            setReaderLoading(false);
            updateReaderPageControls();
        }
    }
}

function goToReaderInputPage() {
    if (!readerPageInput || !readerState.hasSelection) return;
    const requestedPage = parseInt(readerPageInput.value, 10);
    if (!Number.isFinite(requestedPage)) return;
    const nextPage = clampPage(requestedPage, readerState.maxPage || 1);
    if (nextPage === readerState.page) {
        readerPageInput.value = readerState.page;
        return;
    }
    loadReaderPage(nextPage);
}

async function selectSearchResultVerse(verse, resultKey, options = {}) {
    if (!verse || !verse.ayah_id) return;

    const selectionKey = getVerseSelectionKey(resultKey, verse);
    readerState.hasSelection = true;
    readerState.mushafId = verse.mushaf_id || selectedMushaf;
    readerState.selectedAyahId = verse.ayah_id;
    readerState.selectedVerseKey = selectionKey;
    readerState.selectedResultKey = resultKey;
    readerState.selectedHighlights = Array.isArray(verse.highlights) ? verse.highlights : [];
    const requestId = ++readerRequestId;
    setWorkspaceVisible(true);
    setWorkspaceView(options.switchToReader ? 'reader' : workspaceView);
    if (!options.skipResultsRender) {
        syncActiveResultSelection();
    }
    setReaderLoading(true);
    updateReaderPageControls();

    try {
        const response = await fetch(
            `${API_URL}/quran-page?mushaf=${readerState.mushafId}&ayah_id=${verse.ayah_id}`
        );
        const data = await response.json();
        if (!response.ok || !data.found) {
            throw new Error('Failed to load Quran page');
        }
        if (requestId !== readerRequestId) {
            return;
        }

        applyQuranPagePayload(data);
        renderQuranPage();
    } catch (error) {
        showError('حدث خطأ في تحميل صفحة المصحف.');
    } finally {
        if (requestId === readerRequestId) {
            setReaderLoading(false);
            updateReaderPageControls();
        }
    }
}

// Pagination state
const ITEMS_PER_PAGE = 10;
let currentResults = [];
let currentSearchContext = null;
let resultPageState = new Map();

function clampPage(page, totalPages) {
    return Math.max(1, Math.min(page, totalPages));
}

function renderResults(results) {
    currentResults = Array.isArray(results) ? results : [];
    resultPageState = new Map();
    document.body.classList.add('search-active');
    setWorkspaceVisible(currentResults.length > 0);
    setWorkspaceView('results');

    currentResults.forEach((result) => {
        const totalPages = Math.max(result.total_pages || 1, 1);
        const currentPage = clampPage(result.page || 1, totalPages);
        result.page = currentPage;
        resultPageState.set(result.result_key, currentPage);
    });

    const firstSelection = getFirstResultSelection();
    primeReaderSelection(firstSelection);
    updateResultsPaneSummary();
    renderCurrentResults();
    if (firstSelection) {
        requestAnimationFrame(() => {
            selectSearchResultVerse(firstSelection.verse, firstSelection.resultKey, {
                switchToReader: false,
                skipResultsRender: true
            });
        });
    }
}

function renderCurrentResults() {
    const container = resultsArea;
    if (!container) return;
    container.innerHTML = '';
    container.classList.remove('hidden');

    if (!currentResults || currentResults.length === 0) return;

    const fragment = document.createDocumentFragment();
    currentResults.forEach((rootData) => {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.dataset.resultKey = rootData.result_key;

        const header = document.createElement('div');
        header.className = 'root-header';
        header.innerHTML = `
            <div class="stats">${rootData.total_occurrences} \u062a\u0643\u0631\u0627\u0631 \u0641\u064a ${rootData.total_verses} \u0622\u064a\u0629</div>
        `;
        card.appendChild(header);

        const versesList = document.createElement('div');
        versesList.className = 'verses-list';

        const totalPages = Math.max(rootData.total_pages || 1, 1);
        const currentPage = clampPage(resultPageState.get(rootData.result_key) || rootData.page || 1, totalPages);
        rootData.page = currentPage;
        resultPageState.set(rootData.result_key, currentPage);
        if (totalPages > 1) {
            const topPagination = createPaginationControls(rootData.result_key, currentPage, totalPages, 'top');
            card.appendChild(topPagination);
        }
        const versesToShow = Array.isArray(rootData.verses) ? rootData.verses : [];

        versesToShow.forEach((verse) => {
            const item = document.createElement('div');
            const selectionKey = getVerseSelectionKey(rootData.result_key, verse);
            item.className = `verse-item interactive${selectionKey === readerState.selectedVerseKey ? ' active' : ''}`;
            item.dataset.selectionKey = selectionKey;
            item.tabIndex = 0;
            item.setAttribute('role', 'button');
            item.setAttribute('aria-label', `افتح صفحة سورة ${verse.surah} آية ${verse.ayah} في المصحف`);
            item.setAttribute('aria-pressed', selectionKey === readerState.selectedVerseKey ? 'true' : 'false');
            item.onclick = () => selectSearchResultVerse(verse, rootData.result_key, { switchToReader: true });
            item.onkeydown = (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectSearchResultVerse(verse, rootData.result_key, { switchToReader: true });
                }
            };

            const highlightedText = renderHighlightedVerseText(verse.text, verse.highlights);

            item.innerHTML = `
                <div class="verse-meta">
                    <span class="surah-name">\u0633\u0648\u0631\u0629 ${verse.surah}</span>
                    <span class="ayah-num"> - \u0622\u064a\u0629 ${verse.ayah}</span>
                </div>
                <p class="verse-text">${highlightedText}</p>
            `;
            versesList.appendChild(item);
        });

        card.appendChild(versesList);

        // Add pagination controls if needed
        if (totalPages > 1) {
            const pagination = createPaginationControls(rootData.result_key, currentPage, totalPages, 'bottom');
            card.appendChild(pagination);
        }

        fragment.appendChild(card);
    });

    container.appendChild(fragment);

}

function syncActiveResultSelection() {
    if (!resultsArea) return;

    resultsArea.querySelectorAll('.verse-item.interactive').forEach((item) => {
        const isActive = item.dataset.selectionKey === readerState.selectedVerseKey;
        item.classList.toggle('active', isActive);
        item.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

function scrollResultCardToTop(resultKey) {
    if (!resultsArea) return;

    const targetCard = Array.from(resultsArea.querySelectorAll('.result-card'))
        .find((card) => card.dataset.resultKey === resultKey);

    if (targetCard) {
        const offsetTop = targetCard.offsetTop - resultsArea.offsetTop;
        resultsArea.scrollTo({ top: Math.max(offsetTop, 0), behavior: 'smooth' });
        return;
    }

    resultsArea.scrollTo({ top: 0, behavior: 'smooth' });
}

function createPaginationControls(resultKey, current, total, position = 'bottom') {
    const pagination = document.createElement('div');
    pagination.className = 'pagination';
    pagination.classList.add(position === 'top' ? 'pagination-top' : 'pagination-bottom');

    const controls = document.createElement('div');
    controls.className = 'pagination-controls';

    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.className = `pagination-btn ${current === 1 ? 'disabled' : ''}`;
    prevBtn.innerHTML = '→';
    prevBtn.disabled = current === 1;
    prevBtn.onclick = () => goToPage(resultKey, current - 1);
    controls.appendChild(prevBtn);

    // Page numbers
    const pageNumbers = document.createElement('div');
    pageNumbers.className = 'page-numbers';

    const maxVisiblePages = 5;
    let startPage = Math.max(1, current - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(total, startPage + maxVisiblePages - 1);

    if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    // First page + ellipsis
    if (startPage > 1) {
        pageNumbers.appendChild(createPageButton(resultKey, 1, current));
        if (startPage > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'pagination-ellipsis';
            ellipsis.textContent = '...';
            pageNumbers.appendChild(ellipsis);
        }
    }

    // Page buttons
    for (let i = startPage; i <= endPage; i++) {
        pageNumbers.appendChild(createPageButton(resultKey, i, current));
    }

    // Last page + ellipsis
    if (endPage < total) {
        if (endPage < total - 1) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'pagination-ellipsis';
            ellipsis.textContent = '...';
            pageNumbers.appendChild(ellipsis);
        }
        pageNumbers.appendChild(createPageButton(resultKey, total, current));
    }

    controls.appendChild(pageNumbers);

    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.className = `pagination-btn ${current === total ? 'disabled' : ''}`;
    nextBtn.innerHTML = '←';
    nextBtn.disabled = current === total;
    nextBtn.onclick = () => goToPage(resultKey, current + 1);
    controls.appendChild(nextBtn);

    // Page info
    const pageInfo = document.createElement('div');
    pageInfo.className = 'page-info';
    pageInfo.textContent = `صفحة ${current} من ${total}`;
    controls.appendChild(pageInfo);

    pagination.appendChild(controls);

    return pagination;
}

function createPageButton(resultKey, pageNum, currentPage) {
    const btn = document.createElement('button');
    btn.className = `page-btn ${pageNum === currentPage ? 'active' : ''}`;
    btn.textContent = pageNum;
    btn.onclick = () => goToPage(resultKey, pageNum);
    return btn;
}

async function goToPage(resultKey, page) {
    if (!currentSearchContext) return;

    const currentResult = currentResults.find((result) => result.result_key === resultKey);
    if (!currentResult) return;

    const totalPages = Math.max(currentResult.total_pages || 1, 1);
    const requestedPage = clampPage(page, totalPages);
    const currentPage = clampPage(resultPageState.get(resultKey) || currentResult.page || 1, totalPages);
    if (requestedPage === currentPage) return;

    document.getElementById('errorArea').classList.add('hidden');

    try {
        const response = await fetch(
            `${API_URL}/search-result-page?q=${encodeURIComponent(currentSearchContext.q)}&mode=${currentSearchContext.mode}&mushaf=${currentSearchContext.mushaf}&result_key=${encodeURIComponent(resultKey)}&page=${requestedPage}&page_size=${ITEMS_PER_PAGE}`
        );
        const data = await response.json();

        if (!response.ok || !data.found || !data.result) {
            throw new Error('Failed to load result page');
        }

        const nextResult = data.result;
        const nextTotalPages = Math.max(nextResult.total_pages || 1, 1);
        const nextPage = clampPage(nextResult.page || requestedPage, nextTotalPages);
        nextResult.page = nextPage;
        resultPageState.set(resultKey, nextPage);
        currentResults = currentResults.map((result) => result.result_key === resultKey ? nextResult : result);
        renderCurrentResults();
        scrollResultCardToTop(resultKey);
    } catch (error) {
        showError("\u062d\u062f\u062b \u062e\u0637\u0623 \u0641\u064a \u062c\u0644\u0628 \u0627\u0644\u0635\u0641\u062d\u0629 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629.");
    }
}
