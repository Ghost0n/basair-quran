"use client";

import "./reading.css";

import { useEffect, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { SavedPageEntry, SurahListItem } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { relativeAge } from "@/features/companions/use-companions";
import { useShellMode } from "@/features/shell/mode-context";
import { useWorkspace } from "@/features/shell/workspace-context";
import { API_BASE_URL } from "@/lib/config";
import { DEFAULT_MUSHAF_ID } from "@/lib/mushaf-defaults";
import { useNumerals, usePreferences } from "@/lib/preferences-context";
import { divisionOf, divisionRange } from "@/lib/quran-ranges";

import { NavigateSheet, type NavigateTarget } from "./components/navigate-sheet";
import { useMushaf } from "./mushaf-context";

import { t } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

/** «المحفوظة» (the reading world): the mushaf pages the reader saved, latest first. */
export function SavedPagesScreen() {
  const { preferences } = usePreferences();
  const mushaf = useMushaf();
  const { setMode } = useShellMode();
  const formatNumber = useNumerals();
  const pages: SavedPageEntry[] = [...(preferences.saved_pages ?? [])].sort((a, b) => (b.saved_at ?? 0) - (a.saved_at ?? 0));

  function open(entry: SavedPageEntry) {
    void mushaf.loadPage(entry.mushaf_id || DEFAULT_MUSHAF_ID, entry.page, { persist: true });
    setMode("reading");
  }

  return (
    <div className="qb-world-page">
      <span className="eyebrow">
        <Icon name="book" size={14} />
        {t("القراءة")}
      </span>
      <h2>{t("الصفحات المحفوظة")}</h2>
      {pages.length === 0 ? (
        <p className="lead">{t("احفظ صفحة من القراءة (علامة الحفظ في شريط القارئ) لتجدها هنا.")}</p>
      ) : (
        <ul className="qb-saved-pages">
          {pages.map((entry) => (
            <li key={`${entry.mushaf_id}-${entry.page}`}>
              <button type="button" onClick={() => open(entry)}>
                <span className="ribbon" aria-hidden>
                  <svg viewBox="0 0 16 24" width="12" height="18">
                    <path d="M1 0h14v22l-7-5-7 5z" />
                  </svg>
                </span>
                <span className="txt">
                  <b>{entry.surah ?? t("المصحف")}</b>
                  <small>
                    {t("صفحة {0}", { 0: formatNumber(entry.page) })}
                    {entry.saved_at ? ` · ${relativeAge(entry.saved_at, formatNumber)}` : ""}
                  </small>
                </span>
                <Icon name="chevLeft" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** «الفهرس» (the reading world): surahs, juz, hizb and pages — the reader's «انتقل» as a page. */
export function IndexScreen() {
  const mushaf = useMushaf();
  const { state } = useWorkspace();
  const { setMode } = useShellMode();
  const mushafId = state.selectedMushaf;
  const [surahs, setSurahs] = useState<SurahListItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.getSurahs(mushafId).then(
      (list) => !cancelled && setSurahs(list),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [mushafId]);

  const pageData = mushaf.pageData;
  const first = pageData?.ayahs[0];

  function navigate(target: NavigateTarget) {
    if (target.type === "surah") void mushaf.loadBySurah(mushafId, target.surah, target.ayah);
    else if (target.type === "juz") void mushaf.loadByJuz(mushafId, target.juz);
    else if (target.type === "hizb") {
      const { start } = divisionRange("hizb", target.hizb);
      void mushaf.loadBySurah(mushafId, start.surah, start.ayah);
    } else void mushaf.loadPage(mushafId, target.page, { persist: true });
    setMode("reading");
  }

  return (
    <div className="qb-world-page qb-index-page">
      <NavigateSheet
        inline
        surahs={surahs}
        currentSurahId={first?.surah_id}
        currentPage={pageData?.page ?? undefined}
        currentJuz={pageData?.juz}
        currentHizb={first ? divisionOf("hizb", { surah: first.surah_id, ayah: first.ayah }) : null}
        onNavigate={navigate}
        onClose={() => undefined}
      />
    </div>
  );
}
