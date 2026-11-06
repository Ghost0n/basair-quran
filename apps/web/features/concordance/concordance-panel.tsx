"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { useRouter } from "next/navigation";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { SearchVerse } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { Ribbon, SURAH_NAMES } from "@/components/ribbon";
import { useTopBarSlots } from "@/features/shell/top-bar-slots";
import { DEFAULT_MUSHAF_ID } from "@/lib/mushaf-defaults";
import { useRootSpread } from "@/lib/use-root-spread";
import { useWebDesign } from "@/lib/use-web-design";

import "./concordance.web.css";
import { API_BASE_URL } from "@/lib/config";
import { useNotebookSync } from "@/lib/notebook-sync";
import { useIsMobile } from "@/lib/use-is-mobile";
import { useNumerals } from "@/lib/preferences-context";
import { getVerseSelectionKey, renderHighlightedVerseText } from "@/lib/quran-ui";
import { useRecitation } from "@/features/recitation/recitation-context";
import { useShellMode } from "@/features/shell/mode-context";
import { useWorkspace } from "@/features/shell/workspace-context";
import { useSaveAyah } from "@/features/themes/save-ayah-context";

import { t, tn } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

/**
 * Where the results were scrolled when a verse opened the reader: coming back
 * lands on the same verse card (the panel remounts on phones). Keyed by the
 * results shown (query and page), so a new search starts at the top.
 */
let savedScroll: { key: string; top: number } | null = null;

/** The element that scrolls the results: the panel on phones, its body on wider screens. */
function resultsScroller(panel: HTMLElement | null): HTMLElement | null {
  if (!panel) return null;
  const body = panel.querySelector<HTMLElement>(":scope > .qb-side-body");
  for (const element of [panel, body]) {
    if (!element) continue;
    const overflow = getComputedStyle(element).overflowY;
    if (overflow === "auto" || overflow === "scroll") return element;
  }
  return body;
}

/**
 * Concordance panel — search results as a side panel that overlays the
 * live Mushaf. Clicking a verse jumps the Mushaf (via selectVerse →
 * useMushaf.loadByAyah). Consumes the shared search hook. Results are always
 * full verse cards.
 */
export function ConcordancePanel() {
  const { state, actions } = useWorkspace();
  const { openSave } = useSaveAyah();
  const { mode: shellMode, setMode } = useShellMode();
  const formatNumber = useNumerals();
  // Web design: the root's spread across the surahs, and a panel that can widen.
  const web = useWebDesign();
  const router = useRouter();
  // At ≤1000 px the reader isn't mounted beside the results, so a verse tap must
  // switch the shell to the reader surface (Back returns to the results). At wide
  // widths the reader is already visible beside the panel — no mode switch needed.
  const isCompact = useIsMobile(1000);
  // Web design, desktop: the panel's heading lives in the shell's top bar — the
  // root and its counts before the command bar, the panel's actions after it.
  const topSlots = useTopBarSlots(shellMode === "search");

  const panelRef = useRef<HTMLElement | null>(null);
  const recitation = useRecitation();
  const resultsKey = state.results.map((result) => `${result.result_key}@${result.page}`).join("|");

  function openVerse(verse: SearchVerse, resultKey: string) {
    const scroller = resultsScroller(panelRef.current);
    savedScroll = scroller ? { key: resultsKey, top: scroller.scrollTop } : null;
    void actions.selectVerse(verse, resultKey);
    if (isCompact) setMode("reading");
  }

  // Back from the reader: the results exactly where they were left. The
  // scroll is tried until it holds (about a second at most): the screen's
  // layout settles a moment after it mounts (the search page's own CSS, the
  // rows' fonts, a view transition), and a scroll set too early is lost.
  useEffect(() => {
    const saved = savedScroll;
    if (!saved || !resultsKey) return;
    if (saved.key !== resultsKey) {
      savedScroll = null;
      return;
    }
    let frame = 0;
    const started = performance.now();
    const apply = () => {
      const scroller = resultsScroller(panelRef.current);
      const searchLaidOut = document.documentElement.dataset.shellMode === "search";
      if (scroller && searchLaidOut) {
        scroller.scrollTop = saved.top;
        if (Math.abs(scroller.scrollTop - saved.top) < 2) {
          savedScroll = null;
          return;
        }
      }
      if (performance.now() - started < 1200) frame = requestAnimationFrame(apply);
      else savedScroll = null;
    };
    apply();
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultsKey]);

  // Another page of results starts at its top, like a new page.
  async function goToPage(resultKey: string, page: number) {
    await actions.loadResultPage(resultKey, page);
    savedScroll = null;
    resultsScroller(panelRef.current)?.scrollTo({ top: 0 });
  }

  // ▶ on a result: that verse alone, then the recitation ends (the capsule
  // at the top of the screen shows it while it plays).
  function playVerse(verse: SearchVerse) {
    const current = recitation.current;
    if (current && current.surah === verse.surah_id && current.ayah === verse.ayah) {
      recitation.toggle();
      return;
    }
    recitation.playVerseOnce(verse.surah_id, verse.ayah);
  }

  const [pinnedAyahIds, setPinnedAyahIds] = useState<Set<number>>(new Set());
  const [rootFollowed, setRootFollowed] = useState(false);
  const results = state.results;
  const primary = results[0];
  const totalOccurrences = results.reduce((sum, r) => sum + r.total_occurrences, 0);
  const totalVerses = results.reduce((sum, r) => sum + r.total_verses, 0);
  // B2: use the server-computed count across the full result set, not just the current page.
  const surahCount = results.reduce((sum, r) => sum + (r.total_surahs ?? 0), 0);

  // Seed the pin markers from the notebook on mount so already-saved verses show
  // as pinned (previously the set started empty and lied until a live change).
  useEffect(() => {
    let cancelled = false;
    api
      .getNotebook()
      .then((items) => {
        if (cancelled) return;
        const ids = new Set<number>();
        for (const item of items) if (item.ayah_id != null) ids.add(item.ayah_id);
        setPinnedAyahIds(ids);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset + re-seed the "followed" state whenever the primary root changes, so it
  // reflects the CURRENT root rather than staying stale from the previous search.
  const primaryRoot = primary?.root;
  const { counts: spreadCounts } = useRootSpread(web && primary?.search_type === "root" ? primary.root : null, DEFAULT_MUSHAF_ID);
  useEffect(() => {
    if (!primaryRoot) {
      setRootFollowed(false);
      return;
    }
    let cancelled = false;
    setRootFollowed(false);
    api
      .getRoots()
      .then((roots) => {
        if (cancelled) return;
        setRootFollowed(roots.some((r) => r.root_text === primaryRoot));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [primaryRoot]);

  // Keep the pin markers honest when the same ayah is saved/removed elsewhere
  // (the reader beside this panel, or the library).
  useNotebookSync((change) => {
    if (change.kind === "added") {
      if (change.item.ayah_id != null) {
        setPinnedAyahIds((current) => new Set(current).add(change.item.ayah_id as number));
      }
    } else if (change.kind === "removed" && change.ayahId != null) {
      setPinnedAyahIds((current) => {
        if (!current.has(change.ayahId as number)) return current;
        const next = new Set(current);
        next.delete(change.ayahId as number);
        return next;
      });
    }
  });

  // Saving a verse opens the same theme sheet as the reader (useSaveAyah): the
  // verse is saved on «تمّ», tagged with the searched root, with the themes
  // picked there. A verse already saved opens the sheet to edit its themes.
  function pinVerse(verse: SearchVerse) {
    openSave({
      ayah_id: verse.ayah_id,
      mushaf_id: verse.mushaf_id,
      surah_id: verse.surah_id,
      surah: verse.surah,
      ayah: verse.ayah,
      text: verse.text.trim(),
      collection: primary?.root,
    });
  }

  async function followRoot() {
    if (!primary || rootFollowed) return;
    setRootFollowed(true);
    try {
      await api.followRoot({
        root_text: primary.root,
        root_id: primary.root_id ?? undefined,
        occurrences: totalOccurrences,
      });
    } catch {
      setRootFollowed(false);
    }
  }

  const heading = (
    <div className="qb-conc-heading">
      <div className="kicker">{t("المطابقة")}</div>
      <h3>{primary ? primary.root : t("البحث")}</h3>
      <div className="meta">
        {primary
          ? tn("{0} موضع", totalOccurrences, { 0: formatNumber(totalOccurrences) }) + t("، ") + tn("{0} آية", totalVerses, { 0: formatNumber(totalVerses) })
          : t("اكتب جذراً أو كلمة في شريط الأوامر")}
      </div>
    </div>
  );
  const headActions = (
    <div className="qb-side-head-actions">
      {primary ? (
        <button
          type="button"
          className="close"
          title={t("بحث جديد")}
          aria-label={t("مسح البحث وبدء بحث جديد")}
          onClick={() => actions.resetSearch()}
        >
          <Icon name="history" size={15} />
        </button>
      ) : null}
      {/* The web design leaves the panel through the rail, like every page: no close. */}
      {web ? null : (
        <button type="button" className="close dismiss" title={t("إغلاق")} aria-label={t("إغلاق لوحة المطابقة")} onClick={() => setMode("reading")}>
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );

  return (
    <aside className={`qb-side-panel${primary ? "" : " is-empty"}`} ref={panelRef} aria-label={t("لوحة المطابقة")}>
      {/* Web design: the panel's own summary (the root, its counts) already
          heads the page, so the top bar carries only the command bar and the
          actions — no second summary beside the search field. */}
      {topSlots ? (
        createPortal(headActions, topSlots.end)
      ) : (
        <div className="qb-side-head">
          {heading}
          {headActions}
        </div>
      )}

      <div className="qb-side-body">
        {state.errorMessage ? (
          <div className="qb-conc-error" role="alert">
            {state.errorMessage}
            {state.didYouMean ? (
              <div className="did-you-mean">
                <span>{t("هل تقصد:")}</span>
                <button type="button" onClick={actions.applyDidYouMean}>
                  {state.didYouMean.text}
                </button>
              </div>
            ) : (
              <div className="did-you-mean">
                <button type="button" onClick={() => void actions.runSearch()}>
                  <Icon name="history" size={13} /> {t("إعادة المحاولة")}
                </button>
              </div>
            )}
          </div>
        ) : null}

        {state.isSearching && results.length === 0 ? (
          <>
            <div className="qb-conc-skeleton" />
            <div className="qb-conc-skeleton" />
            <div className="qb-conc-skeleton" />
          </>
        ) : null}

        {!state.isSearching && !state.errorMessage && results.length === 0 ? (
          <div className="qb-conc-empty">
            <div className="qb-conc-empty-art" aria-hidden>
              <Icon name="search" size={26} />
            </div>
            <p className="qb-conc-empty-lead">
              {t("اكتب جذراً أو كلمة قرآنية في شريط الأوامر بالأعلى ↑ لتبدأ البحث.")}
            </p>
            {state.quickExamples.length ? (
              <div className="qb-conc-examples">
                <span className="lbl">{t("جرّب")}</span>
                {state.quickExamples.map((example) => (
                  <button key={example.label} type="button" onClick={() => actions.runQuickExample(example)}>
                    {example.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="qb-conc-watermark" aria-hidden>
              {t("ب · ص · ر")}
            </div>
          </div>
        ) : null}

        {primary ? (
          <div className="qb-root-summary">
            <div className="root-disp">{web && primary.search_type === "root" ? [...primary.root.replace(/\s/g, "")].join(" ") : primary.root}</div>
            <div className="root-gloss">
              {primary.search_type === "root" ? t("جذر قرآني") : t("بحث لفظي")} · {tn("{0} مجموعة", results.length, { 0: formatNumber(results.length) })}
            </div>
            <div className="root-stats">
              <div className="s">
                <div className="v">{formatNumber(totalOccurrences)}</div>
                <div className="l">{t("موضع")}</div>
              </div>
              <div className="s">
                <div className="v">{formatNumber(totalVerses)}</div>
                <div className="l">{t("آية")}</div>
              </div>
              <div className="s">
                <div className="v">{formatNumber(surahCount)}</div>
                <div className="l">{t("سورة")}</div>
              </div>
            </div>
            <button
              type="button"
              className={`qb-follow-root${rootFollowed ? " on" : ""}`}
              onClick={() => void followRoot()}
              disabled={rootFollowed}
            >
              <Icon name={rootFollowed ? "check" : "tree"} size={12} />
              {rootFollowed ? t("جذر مُتابَع") : t("تابِع هذا الجذر")}
            </button>
            {web && spreadCounts ? (
              <>
                <Ribbon
                  className="qb-conc-ribbon"
                  counts={spreadCounts}
                  label={t("انتشار الجذر في السور")}
                  height={64}
                  focus={state.surahFilter ? state.surahFilter - 1 : null}
                  readout={(i) => t("{0}: {1}", { 0: SURAH_NAMES[i], 1: formatNumber(spreadCounts[i]) })}
                  restReadout={t("المس سورة لتعرض مواضعها فيها")}
                  onPick={(i) => {
                    // A surah without the root has nothing to show; picking the
                    // filtered surah again (or Esc) shows every surah.
                    if (i == null || state.surahFilter === i + 1) void actions.filterBySurah(null);
                    else if (spreadCounts[i]) void actions.filterBySurah(i + 1);
                  }}
                />
                {state.surahFilter ? (
                  <button type="button" className="qb-conc-filter" onClick={() => void actions.filterBySurah(null)} aria-label={t("اعرض كل السور")}>
                    {t("سورة {0}", { 0: SURAH_NAMES[state.surahFilter - 1] })}
                    <Icon name="close" size={13} />
                  </button>
                ) : null}
              </>
            ) : null}
            <button
              type="button"
              className="qb-follow-root"
              style={{ marginTop: 6 }}
              onClick={() => router.push(`/?mode=heatmap&root=${encodeURIComponent(primary.root)}`)}
            >
              <Icon name="graph" size={12} />
              {t("خريطة انتشار الجذر")}
            </button>
          </div>
        ) : null}

        {results.map((result) => (
          <div key={result.result_key}>
            {results.length > 1 ? (
              <div className="kicker" style={{ margin: "8px 0", fontSize: 10, color: "var(--fg-3)" }}>
                {result.root}
              </div>
            ) : null}
            {result.verses.map((verse, verseIndex) => {
              const selectionKey = getVerseSelectionKey(result.result_key, verse);
              const isSelected = selectionKey === state.selectedVerseKey;
              const isPinned = pinnedAyahIds.has(verse.ayah_id);
              const isReciting = recitation.current?.surah === verse.surah_id && recitation.current?.ayah === verse.ayah;
              const isPlaying = isReciting && recitation.isPlaying;
              return (
                // Card is the primary action (select the verse); the pin is a
                // nested but real <button>. The row uses role="button" rather
                // than a <button> element so the pin isn't an invalid
                // button-in-button. The keydown guard ignores events that
                // bubble up from the pin.
                <div
                  key={selectionKey}
                  className={`qb-verse-row${isSelected ? " selected" : ""}`}
                  style={{ "--i": Math.min(verseIndex, 8) } as CSSProperties}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => openVerse(verse, result.result_key)}
                  onKeyDown={(event) => {
                    if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      openVerse(verse, result.result_key);
                    }
                  }}
                >
                  <div className="vmeta">
                    <span className="surah">{t("سورة")} {verse.surah}</span>
                    <span className="ayah-ref">
                      {formatNumber(verse.surah_id)}:{formatNumber(verse.ayah)}
                    </span>
                    <button
                      type="button"
                      className={`pin listen${isReciting ? " on" : ""}`}
                      aria-label={isPlaying ? t("إيقاف") : t("تلاوة الآية")}
                      aria-pressed={isPlaying}
                      title={t("تلاوة الآية")}
                      onClick={(event) => {
                        event.stopPropagation();
                        playVerse(verse);
                      }}
                    >
                      <Icon name={isPlaying ? "pause" : "play"} size={12} />
                    </button>
                    <button
                      type="button"
                      className={`pin${isPinned ? " on" : ""}`}
                      aria-label={isPinned ? t("مثبّت في الدفتر") : t("ثبّت في الدفتر")}
                      aria-pressed={isPinned}
                      title={t("ثبّت في الدفتر")}
                      onClick={(event) => {
                        event.stopPropagation();
                        // Nothing is saved until «تمّ» in the sheet, so no
                        // fly-to-notebook flourish here.
                        pinVerse(verse);
                      }}
                    >
                      <Icon name={isPinned ? "pinFilled" : "pin"} size={12} />
                    </button>
                  </div>
                  <div className="vtext">{renderHighlightedVerseText(verse.text.trim(), verse.highlights)}</div>
                </div>
              );
            })}
            {result.total_pages > 1 ? (
              <div className="qb-conc-pager">
                <button
                  type="button"
                  disabled={result.page <= 1}
                  onClick={() => void goToPage(result.result_key, result.page - 1)}
                >
                  {t("السابق")}
                </button>
                <span className="count" dir="ltr">
                  {formatNumber(result.page)} / {formatNumber(result.total_pages)}
                </span>
                <button
                  type="button"
                  disabled={result.page >= result.total_pages}
                  onClick={() => void goToPage(result.result_key, result.page + 1)}
                >
                  {t("التالي")}
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </aside>
  );
}
