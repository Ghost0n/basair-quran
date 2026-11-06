"use client";

import { useMemo } from "react";

import { Ribbon, SURAH_NAMES } from "@/components/ribbon";
import { useShellMode } from "@/features/shell/mode-context";
import { useWorkspace } from "@/features/shell/workspace-context";
import { useNumerals, usePreferences } from "@/lib/preferences-context";
import { useRootSpread } from "@/lib/use-root-spread";

import { useAyahTranslations } from "../use-ayah-translations";
import { useMorphology } from "../use-morphology";

import type { WordSelection } from "./word-selection";

import { t } from "@/lib/i18n";

/**
 * The study panel's extras (web design): where the selected word's root lives
 * across the 114 surahs (one word), or the verse's meaning in the reader's
 * chosen translations (a verse). Shown inside the selection bar on the desktop web.
 */
export function StudyExtras({ selection, mushafId }: { selection: WordSelection; mushafId: number }) {
  const single = selection.keys.length === 1;
  return (
    <div className="qb-study-extras">
      {/* One word: its root across the Mushaf; a verse: its meaning. */}
      {single ? <RootSpread selection={selection} mushafId={mushafId} /> : <Meaning selection={selection} />}
    </div>
  );
}

function RootSpread({ selection, mushafId }: { selection: WordSelection; mushafId: number }) {
  const formatNumber = useNumerals();
  const { setMode } = useShellMode();
  const { actions } = useWorkspace();
  const { data } = useMorphology(selection.start.surah, selection.start.ayah, mushafId);
  const root = data?.words.find((entry) => entry.position === selection.start.position)?.root ?? null;
  const { spread, counts } = useRootSpread(root, mushafId);
  if (!root || !spread || !counts) return null;

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
        onActivate={() => openRoot()}
      />
      <button type="button" className="qb-btn primary" onClick={openRoot}>
        {t("كل المواضع")}
      </button>
    </section>
  );
}

function Meaning({ selection }: { selection: WordSelection }) {
  const { preferences } = usePreferences();
  const formatNumber = useNumerals();
  const keys = preferences.translations ?? [];
  const refs = useMemo(() => [{ surah: selection.start.surah, ayah: selection.start.ayah }], [selection.start.surah, selection.start.ayah]);
  const translations = useAyahTranslations(keys, refs);
  const list = translations.get(`${selection.start.surah}:${selection.start.ayah}`) ?? [];
  if (!keys.length || !list.length) return null;
  return (
    <section className="qb-study-meaning" aria-label={t("معنى الآية")}>
      <span className="lbl">{t("معنى الآية {0}", { 0: formatNumber(selection.start.ayah) })}</span>
      {list.map((item) => (
        <figure key={item.meta.key} dir={item.meta.direction === "rtl" ? "rtl" : item.meta.direction === "ltr" ? "ltr" : "auto"} lang={item.meta.language}>
          <p>{item.text}</p>
          <figcaption>{item.meta.name}</figcaption>
        </figure>
      ))}
    </section>
  );
}
