"use client";

import { useEffect, useState, type CSSProperties } from "react";

import { useRouter } from "next/navigation";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { SearchVerse } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { API_BASE_URL } from "@/lib/config";
import { flyToNotebook } from "@/lib/fly-to-notebook";
import { emitNotebookChange, useNotebookSync } from "@/lib/notebook-sync";
import { useIsMobile } from "@/lib/use-is-mobile";
import { useNumerals } from "@/lib/preferences-context";
import { getVerseSelectionKey, kwicWindow, renderHighlightedVerseText } from "@/lib/quran-ui";
import { useShellMode } from "@/features/shell/mode-context";
import { useWorkspace } from "@/features/shell/workspace-context";

import { t, tn } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

/**
 * Concordance panel — search results as a side panel that overlays the
 * live Mushaf. Clicking a verse jumps the Mushaf (via selectVerse →
 * useMushaf.loadByAyah). Consumes the shared search hook.
 */
const DENSITY_KEY = "qb.concordanceDensity";

/** One-line key-word-in-context rendering of a result verse. */
function CompactVerse({ text, highlights }: { text: string; highlights?: number[] }) {
  const { words, before, after } = kwicWindow(text, highlights ?? []);
  return (
    <>
      {before ? <span className="ell">… </span> : null}
      {words.map((item, index) => (
        <span key={item.position}>
          {item.hit ? <span className="highlight">{item.word}</span> : item.word}
          {index < words.length - 1 ? " " : null}
        </span>
      ))}
      {after ? <span className="ell"> …</span> : null}
    </>
  );
}

export function ConcordancePanel() {
  const { state, actions } = useWorkspace();
  const { setMode } = useShellMode();
  const formatNumber = useNumerals();
  const router = useRouter();
  // At ≤1000 px the reader isn't mounted beside the results, so a verse tap must
  // switch the shell to the reader surface (Back returns to the results). At wide
  // widths the reader is already visible beside the panel — no mode switch needed.
  const isCompact = useIsMobile(1000);

  function openVerse(verse: SearchVerse, resultKey: string) {
    void actions.selectVerse(verse, resultKey);
    if (isCompact) setMode("reading");
  }

  const [pinnedAyahIds, setPinnedAyahIds] = useState<Set<number>>(new Set());
  const [rootFollowed, setRootFollowed] = useState(false);
  // Result density: full verse cards, or one KWIC line per result (scan many
  // hits fast, open the verse in the mushaf for context). Remembered per device.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    try {
      setCompact(window.localStorage.getItem(DENSITY_KEY) === "compact");
    } catch {
      /* default: full cards */
    }
  }, []);
  function toggleDensity() {
    setCompact((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(DENSITY_KEY, next ? "compact" : "full");
      } catch {
        /* per-device convenience only */
      }
      return next;
    });
  }

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

  async function pinVerse(verse: SearchVerse) {
    if (pinnedAyahIds.has(verse.ayah_id)) return;
    setPinnedAyahIds((current) => new Set(current).add(verse.ayah_id));
    try {
      const created = await api.addNotebookItem({
        ayah_id: verse.ayah_id,
        mushaf_id: verse.mushaf_id,
        surah_id: verse.surah_id,
        surah: verse.surah,
        ayah: verse.ayah,
        text: verse.text.trim(),
        collection: primary?.root,
      });
      emitNotebookChange({ kind: "added", item: created });
    } catch {
      setPinnedAyahIds((current) => {
        const next = new Set(current);
        next.delete(verse.ayah_id);
        return next;
      });
    }
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

  return (
    <aside className="qb-side-panel" aria-label={t("لوحة المطابقة")}>
      <div className="qb-side-head">
        <div>
          <div className="kicker">{t("المطابقة")}</div>
          <h3>{primary ? primary.root : t("البحث")}</h3>
          <div className="meta">
            {primary
              ? tn("{0} موضع", totalOccurrences, { 0: formatNumber(totalOccurrences) }) + t("، ") + tn("{0} آية", totalVerses, { 0: formatNumber(totalVerses) })
              : t("اكتب جذراً أو كلمة في شريط الأوامر")}
          </div>
        </div>
        <div className="qb-side-head-actions">
          {primary ? (
            <button
              type="button"
              className={`close${compact ? " on" : ""}`}
              title={compact ? t("عرض الآيات كاملة") : t("عرض مختصر (سطر لكل موضع)")}
              aria-label={compact ? t("عرض الآيات كاملة") : t("عرض مختصر")}
              aria-pressed={compact}
              onClick={toggleDensity}
            >
              <Icon name={compact ? "cards" : "menu"} size={15} />
            </button>
          ) : null}
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
          <button type="button" className="close" title={t("إغلاق")} aria-label={t("إغلاق لوحة المطابقة")} onClick={() => setMode("reading")}>
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>

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
            <div className="qb-conc-watermark" aria-hidden>
              {t("ب · ص · ر")}
            </div>
          </div>
        ) : null}

        {primary ? (
          <div className="qb-root-summary">
            <div className="root-disp">{primary.root}</div>
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
              return (
                // Card is the primary action (select the verse); the pin is a
                // nested but real <button>. The row uses role="button" rather
                // than a <button> element so the pin isn't an invalid
                // button-in-button. The keydown guard ignores events that
                // bubble up from the pin.
                <div
                  key={selectionKey}
                  className={`qb-verse-row${isSelected ? " selected" : ""}${compact ? " compact" : ""}`}
                  title={compact ? t("سورة {0}", { 0: verse.surah }) : undefined}
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
                      className={`pin${isPinned ? " on" : ""}`}
                      aria-label={isPinned ? t("مثبّت في الدفتر") : t("ثبّت في الدفتر")}
                      aria-pressed={isPinned}
                      title={t("ثبّت في الدفتر")}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!isPinned) flyToNotebook(event.currentTarget, verse.text.trim());
                        void pinVerse(verse);
                      }}
                    >
                      <Icon name={isPinned ? "pinFilled" : "pin"} size={12} />
                    </button>
                  </div>
                  {compact ? (
                    <div className="vtext kwic">
                      <CompactVerse text={verse.text} highlights={verse.highlights} />
                    </div>
                  ) : (
                    <div className="vtext">{renderHighlightedVerseText(verse.text.trim(), verse.highlights)}</div>
                  )}
                </div>
              );
            })}
            {result.total_pages > 1 ? (
              <div className="qb-conc-pager">
                <button
                  type="button"
                  disabled={result.page <= 1}
                  onClick={() => void actions.loadResultPage(result.result_key, result.page - 1)}
                >
                  {t("السابق")}
                </button>
                <span className="count" dir="ltr">
                  {formatNumber(result.page)} / {formatNumber(result.total_pages)}
                </span>
                <button
                  type="button"
                  disabled={result.page >= result.total_pages}
                  onClick={() => void actions.loadResultPage(result.result_key, result.page + 1)}
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
