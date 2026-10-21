"use client";

import { useEffect, useMemo, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { RootDistributionResponse } from "@q-basair/shared";

import { Ribbon, SURAH_NAMES } from "@/components/ribbon";
import { useShellMode } from "@/features/shell/mode-context";
import { useWorkspace } from "@/features/shell/workspace-context";
import { API_BASE_URL } from "@/lib/config";
import { useNumerals, usePreferences } from "@/lib/preferences-context";

import { useAyahTranslations } from "../use-ayah-translations";
import { useMorphology } from "../use-morphology";

import { rootSpreadCounts } from "./study-extras-model";
import type { WordSelection } from "./word-selection";

import { t } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });
const spreadCache = new Map<string, RootDistributionResponse>();

/**
 * The study panel's extras (web design): where the selected word's root lives
 * across the 114 surahs, and the verse's meaning in the reader's chosen
 * translations. Shown inside the selection bar on the desktop web.
 */
export function StudyExtras({ selection, mushafId }: { selection: WordSelection; mushafId: number }) {
  const single = selection.keys.length === 1;
  return (
    <div className="qb-study-extras">
      {single ? <RootSpread selection={selection} mushafId={mushafId} /> : null}
      <Meaning selection={selection} />
    </div>
  );
}

function RootSpread({ selection, mushafId }: { selection: WordSelection; mushafId: number }) {
  const formatNumber = useNumerals();
  const { setMode } = useShellMode();
  const { actions } = useWorkspace();
  const { data } = useMorphology(selection.start.surah, selection.start.ayah, mushafId);
  const root = data?.words.find((entry) => entry.position === selection.start.position)?.root ?? null;
  const [spread, setSpread] = useState<RootDistributionResponse | null>(root ? spreadCache.get(`${mushafId}:${root}`) ?? null : null);

  useEffect(() => {
    if (!root) {
      setSpread(null);
      return;
    }
    const key = `${mushafId}:${root}`;
    const cached = spreadCache.get(key);
    if (cached) {
      setSpread(cached);
      return;
    }
    let cancelled = false;
    api.getRootDistribution(root, mushafId).then(
      (result) => {
        spreadCache.set(key, result);
        if (!cancelled) setSpread(result);
      },
      () => !cancelled && setSpread(null),
    );
    return () => {
      cancelled = true;
    };
  }, [root, mushafId]);

  const counts = useMemo(() => (spread ? rootSpreadCounts(spread) : null), [spread]);
  if (!root || !spread || !spread.found || !counts) return null;

  const here = selection.start.surah - 1;
  const openRoot = () => {
    actions.runQuickExample({ query: root, mode: "root" });
    setMode("search");
  };

  return (
    <section className="qb-study-root" aria-label={t("انتشار الجذر في السور")}>
      <div className="head">
        <div>
          <span className="lbl">{t("الجذر")}</span>
          <b className="qb-letters" lang="ar">
            {[...spread.root.replace(/\s/g, "")].join(" ")}
          </b>
        </div>
        <div className="figs">
          <span>
            <b>{formatNumber(spread.total)}</b>
            {t("المواضع")}
          </span>
          <span>
            <b>{formatNumber(spread.surah_count)}</b>
            {t("السور")}
          </span>
        </div>
      </div>
      <Ribbon
        counts={counts}
        label={t("انتشار الجذر في السور")}
        here={here}
        height={48}
        readout={(i) => t("{0}: {1}", { 0: SURAH_NAMES[i], 1: formatNumber(counts[i]) })}
        onPick={(i) => {
          if (i != null) openRoot();
        }}
      />
      <button type="button" className="qb-btn primary" onClick={openRoot}>
        {t("كل المواضع")}
      </button>
    </section>
  );
}

function Meaning({ selection }: { selection: WordSelection }) {
  const { preferences } = usePreferences();
  const keys = preferences.translations ?? [];
  const refs = useMemo(() => [{ surah: selection.start.surah, ayah: selection.start.ayah }], [selection.start.surah, selection.start.ayah]);
  const translations = useAyahTranslations(keys, refs);
  const list = translations.get(`${selection.start.surah}:${selection.start.ayah}`) ?? [];
  if (!keys.length || !list.length) return null;
  return (
    <section className="qb-study-meaning" aria-label={t("معنى الآية")}>
      <span className="lbl">{t("معنى الآية {0}", { 0: selection.start.ayah })}</span>
      {list.map((item) => (
        <figure key={item.meta.key} dir={item.meta.direction === "rtl" ? "rtl" : item.meta.direction === "ltr" ? "ltr" : "auto"} lang={item.meta.language}>
          <p>{item.text}</p>
          <figcaption>{item.meta.name}</figcaption>
        </figure>
      ))}
    </section>
  );
}
