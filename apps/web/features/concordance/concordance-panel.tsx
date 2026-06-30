"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { SearchVerse } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { API_BASE_URL } from "@/lib/config";
import { useNumerals } from "@/lib/preferences-context";
import { getVerseSelectionKey, renderHighlightedVerseText } from "@/lib/quran-ui";
import { useShellMode } from "@/features/shell/mode-context";
import { useWorkspace } from "@/features/shell/workspace-context";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

/**
 * Concordance panel — search results as a side panel that overlays the
 * live Mushaf. Clicking a verse jumps the Mushaf (via selectVerse →
 * useMushaf.loadByAyah). Consumes the shared search hook.
 */
export function ConcordancePanel() {
  const { state, actions } = useWorkspace();
  const { setMode } = useShellMode();
  const formatNumber = useNumerals();
  const router = useRouter();

  const [pinnedAyahIds, setPinnedAyahIds] = useState<Set<number>>(new Set());
  const [rootFollowed, setRootFollowed] = useState(false);

  const results = state.results;
  const primary = results[0];
  const totalOccurrences = results.reduce((sum, r) => sum + r.total_occurrences, 0);
  const totalVerses = results.reduce((sum, r) => sum + r.total_verses, 0);
  // B2: use the server-computed count across the full result set, not just the current page.
  const surahCount = results.reduce((sum, r) => sum + (r.total_surahs ?? 0), 0);

  async function pinVerse(verse: SearchVerse) {
    if (pinnedAyahIds.has(verse.ayah_id)) return;
    setPinnedAyahIds((current) => new Set(current).add(verse.ayah_id));
    try {
      await api.addNotebookItem({
        ayah_id: verse.ayah_id,
        mushaf_id: verse.mushaf_id,
        surah_id: verse.surah_id,
        surah: verse.surah,
        ayah: verse.ayah,
        text: verse.text.trim(),
        collection: primary?.root,
      });
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
    <aside className="qb-side-panel" aria-label="لوحة المطابقة">
      <div className="qb-side-head">
        <div>
          <div className="kicker">المطابقة · CONCORDANCE</div>
          <h3>{primary ? primary.root : "البحث"}</h3>
          <div className="meta">
            {primary
              ? `${formatNumber(totalOccurrences)} موضع · ${formatNumber(totalVerses)} آية`
              : "اكتب جذراً أو كلمة في شريط الأوامر"}
          </div>
        </div>
        <div className="qb-side-head-actions">
          {primary ? (
            <button
              type="button"
              className="close"
              title="بحث جديد"
              aria-label="مسح البحث وبدء بحث جديد"
              onClick={() => actions.resetSearch()}
            >
              <Icon name="history" size={15} />
            </button>
          ) : null}
          <button type="button" className="close" title="إغلاق" aria-label="إغلاق لوحة المطابقة" onClick={() => setMode("reading")}>
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
                <span>هل تقصد:</span>
                <button type="button" onClick={actions.applyDidYouMean}>
                  {state.didYouMean.text}
                </button>
              </div>
            ) : (
              <div className="did-you-mean">
                <button type="button" onClick={() => void actions.runSearch()}>
                  <Icon name="history" size={13} /> إعادة المحاولة
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
              اكتب جذراً أو كلمة قرآنية في شريط الأوامر بالأعلى ↑ لتبدأ البحث.
            </p>
            <div className="qb-conc-watermark" aria-hidden>
              ب · ص · ر
            </div>
          </div>
        ) : null}

        {primary ? (
          <div className="qb-root-summary">
            <div className="root-disp">{primary.root}</div>
            <div className="root-gloss">
              {primary.search_type === "root" ? "جذر قرآني" : "بحث لفظي"} · {results.length > 1 ? `${formatNumber(results.length)} مجموعة` : "مجموعة واحدة"}
            </div>
            <div className="root-stats">
              <div className="s">
                <div className="v">{formatNumber(totalOccurrences)}</div>
                <div className="l">موضع</div>
              </div>
              <div className="s">
                <div className="v">{formatNumber(totalVerses)}</div>
                <div className="l">آية</div>
              </div>
              <div className="s">
                <div className="v">{formatNumber(surahCount)}</div>
                <div className="l">سورة</div>
              </div>
            </div>
            <button
              type="button"
              className={`qb-follow-root${rootFollowed ? " on" : ""}`}
              onClick={() => void followRoot()}
              disabled={rootFollowed}
            >
              <Icon name={rootFollowed ? "check" : "tree"} size={12} />
              {rootFollowed ? "جذر مُتابَع" : "تابِع هذا الجذر"}
            </button>
            <button
              type="button"
              className="qb-follow-root"
              style={{ marginTop: 6 }}
              onClick={() => router.push(`/?mode=heatmap&root=${encodeURIComponent(primary.root)}`)}
            >
              <Icon name="graph" size={12} />
              خريطة انتشار الجذر
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
            {result.verses.map((verse) => {
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
                  className={`qb-verse-row${isSelected ? " selected" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => void actions.selectVerse(verse, result.result_key)}
                  onKeyDown={(event) => {
                    if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      void actions.selectVerse(verse, result.result_key);
                    }
                  }}
                >
                  <div className="vmeta">
                    <span className="surah">سورة {verse.surah}</span>
                    <span className="ayah-ref">
                      {formatNumber(verse.surah_id)}:{formatNumber(verse.ayah)}
                    </span>
                    <button
                      type="button"
                      className={`pin${isPinned ? " on" : ""}`}
                      aria-label={isPinned ? "مثبّت في الدفتر" : "ثبّت في الدفتر"}
                      aria-pressed={isPinned}
                      title="ثبّت في الدفتر"
                      onClick={(event) => {
                        event.stopPropagation();
                        void pinVerse(verse);
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
                  onClick={() => void actions.loadResultPage(result.result_key, result.page - 1)}
                >
                  السابق
                </button>
                <span className="count" dir="ltr">
                  {formatNumber(result.page)} / {formatNumber(result.total_pages)}
                </span>
                <button
                  type="button"
                  disabled={result.page >= result.total_pages}
                  onClick={() => void actions.loadResultPage(result.result_key, result.page + 1)}
                >
                  التالي
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </aside>
  );
}
