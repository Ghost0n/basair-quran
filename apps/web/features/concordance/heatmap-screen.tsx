"use client";

import { useEffect, useMemo, useState } from "react";

import { useSearchParams } from "next/navigation";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { RootDistributionResponse, SurahListItem } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";
import { Icon } from "@/components/icon";
import { Ribbon, SURAH_NAMES } from "@/components/ribbon";
import { rootSpreadCounts } from "@/features/reading/tools/study-extras-model";
import { useWebDesign } from "@/lib/use-web-design";
import { useNumerals } from "@/lib/preferences-context";
import { useMushaf } from "@/features/reading/mushaf-context";
import { useGoBack, useShellMode } from "@/features/shell/mode-context";
import { useWorkspace } from "@/features/shell/workspace-context";

import "./concordance.css";
import "./concordance.web.css";

import { t, tn } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

/**
 * Concordance heatmap — where a root lives across the whole Qurʾān. The
 * 114-surah grid is colour-graded by occurrence density; clicking a
 * surah opens it in the Mushaf.
 */
export function HeatmapScreen() {
  const params = useSearchParams();
  const root = params.get("root") ?? "";
  const { state } = useWorkspace();
  const mushaf = useMushaf();
  const { setMode } = useShellMode();
  const { goBack } = useGoBack();
  const formatNumber = useNumerals();

  const [surahs, setSurahs] = useState<SurahListItem[]>([]);
  const [distribution, setDistribution] = useState<RootDistributionResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getSurahs(state.selectedMushaf).then((list) => {
      if (!cancelled) setSurahs(list);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [state.selectedMushaf]);

  useEffect(() => {
    if (!root) {
      setDistribution(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .getRootDistribution(root, state.selectedMushaf)
      .then((response) => {
        if (!cancelled) setDistribution(response);
      })
      .catch(() => {
        if (!cancelled) setDistribution(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [root, state.selectedMushaf]);

  const countBySurah = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of distribution?.surahs ?? []) {
      map.set(item.surah_id, item.count);
    }
    return map;
  }, [distribution]);

  const maxCount = useMemo(
    () => Math.max(1, ...(distribution?.surahs ?? []).map((item) => item.count)),
    [distribution],
  );

  const topSurahs = useMemo(
    () => [...(distribution?.surahs ?? [])].sort((a, b) => b.count - a.count).slice(0, 4),
    [distribution],
  );

  // Web design: the same counts as the surah ribbon above the grid.
  const web = useWebDesign();
  const spreadCounts = useMemo(() => (distribution?.found ? rootSpreadCounts(distribution) : null), [distribution]);

  function intensity(count: number): number {
    if (count <= 0) return 0;
    return Math.min(6, Math.ceil((count / maxCount) * 6));
  }

  if (!root) {
    return (
      <div className="qb-aux">
        <div className="qb-aux-state">{t("اختر جذراً من لوحة المطابقة لعرض انتشاره عبر المصحف.")}</div>
      </div>
    );
  }

  return (
    <div className="qb-aux">
      <div className="qb-aux-h has-back">
        {/* Back to where the root was opened from (the saved roots, a search). */}
        <button type="button" className="qb-icon-round qb-aux-back" onClick={() => goBack()} aria-label={t("رجوع")}>
          <Icon name="chevRight" size={18} />
        </button>
        <div>
          <div className="kicker">{t("خريطة انتشار الجذر")}</div>
          <h2>{distribution?.root ?? root}</h2>
          <div className="sub">
            {loading
              ? t("جارٍ حساب الانتشار…")
              : distribution?.found
                ? `${tn("{0} موضع", distribution.total, { 0: formatNumber(distribution.total) })} · ${tn("{0} سورة", distribution.surah_count, { 0: formatNumber(distribution.surah_count) })}`
                : t("لا توجد مواضع لهذا الجذر.")}
          </div>
        </div>
      </div>

      {distribution?.found ? (
        <>
          {web && spreadCounts ? (
            <Ribbon
              className="qb-heat-ribbon"
              counts={spreadCounts}
              label={t("انتشار الجذر في السور")}
              height={110}
              grow
              readout={(i) => t("{0}: {1}", { 0: SURAH_NAMES[i], 1: formatNumber(spreadCounts[i]) })}
              restReadout={t("المس سورة لتفتحها في المصحف")}
              onPick={(i) => {
                if (i == null) return;
                void mushaf.loadBySurah(state.selectedMushaf, i + 1);
                setMode("reading");
              }}
            />
          ) : null}
          <div className="qb-heatmap-grid">
            {surahs.map((surah) => {
              const count = countBySurah.get(surah.id) ?? 0;
              return (
                <button
                  key={surah.id}
                  type="button"
                  className="qb-heat-cell"
                  data-level={intensity(count)}
                  title={`${surah.name} — ${tn("{0} موضع", count, { 0: formatNumber(count) })}`}
                  onClick={() => {
                    void mushaf.loadBySurah(state.selectedMushaf, surah.id);
                    setMode("reading");
                  }}
                >
                  <span className="n">{formatNumber(surah.id)}</span>
                </button>
              );
            })}
          </div>

          {topSurahs.length > 0 ? (
            <>
              <div className="kicker" style={{ margin: "24px 0 10px" }}>
                {t("السُّوَر الأعلى ذِكراً")}
              </div>
              <div className="qb-aux-list">
                {topSurahs.map((item) => (
                  <div key={item.surah_id} className="qb-aux-row">
                    <span className="icon-tile">{formatNumber(item.surah_id)}</span>
                    <div className="grow">
                      <div className="title">{t("سورة")} {item.surah}</div>
                      <div className="meta">{tn("{0} موضع", item.count, { 0: formatNumber(item.count) })}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
