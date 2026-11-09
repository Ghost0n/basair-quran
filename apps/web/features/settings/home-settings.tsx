"use client";

import { useEffect, useState } from "react";

import type { HomeSectionId } from "@q-basair/shared";

import { Icon, type IconName } from "@/components/icon";
import { usePreferences } from "@/lib/preferences-context";
import { useRecents, useRecordRecents } from "@/lib/use-recents";
import { useReadingProgress, useRecordReading } from "@/lib/use-reading-progress";

import { t } from "@/lib/i18n";

/** Home's sections, in the order they appear there (home-screen.tsx). */
const SECTIONS: { id: HomeSectionId; icon: IconName; label: () => string }[] = [
  { id: "greeting", icon: "user", label: () => t("التحية") },
  { id: "verse", icon: "book", label: () => t("الآية المتجدّدة") },
  { id: "continue", icon: "book", label: () => t("متابعة القراءة") },
  { id: "recent_pages", icon: "history", label: () => t("الصفحات الأخيرة") },
  { id: "recent_searches", icon: "history", label: () => t("عمليات البحث الأخيرة") },
  { id: "search", icon: "search", label: () => t("البحث") },
];
const SECTION_IDS = new Set<HomeSectionId>(SECTIONS.map((section) => section.id));

/**
 * «الرئيسية» — show or hide each part of the Home screen. Saved on the account
 * as the sections hidden (`home_hidden`), so a section added later shows.
 * The recents can be cleared here (on this device and the account), and
 * «تابع القراءة» reset: it starts again from Al-Fatiha (a second tap confirms).
 */
export function HomeSettings() {
  const { preferences, updateAccount } = usePreferences();
  const hidden = preferences.home_hidden ?? [];
  const recents = useRecents();
  const { clearRecents } = useRecordRecents();
  const hasRecents = recents.pages.length > 0 || recents.searches.length > 0;
  const progress = useReadingProgress();
  const { reset: resetReading } = useRecordReading();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  // An unconfirmed reset disarms itself; the «done» note fades.
  useEffect(() => {
    if (!confirmReset && !resetDone) return;
    const timer = window.setTimeout(() => {
      setConfirmReset(false);
      setResetDone(false);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [confirmReset, resetDone]);

  function onReset() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    resetReading();
    setConfirmReset(false);
    setResetDone(true);
  }

  function toggle(id: HomeSectionId) {
    const next = hidden.includes(id) ? hidden.filter((item) => item !== id) : [...hidden, id];
    // Sections Home no longer has (the old shortcuts) leave the list.
    void updateAccount({ home_hidden: next.filter((item) => SECTION_IDS.has(item)) });
  }

  return (
    <section className="qb-setting-card">
      <h3>{t("الرئيسية")}</h3>
      <p className="card-sub">{t("اختر ما تعرضه الشاشة الرئيسية.")}</p>
      <ul className="qb-switch-list">
        {SECTIONS.map((section) => {
          const shown = !hidden.includes(section.id);
          return (
            <li key={section.id}>
              <button type="button" role="switch" aria-checked={shown} className="qb-switch-row" onClick={() => toggle(section.id)}>
                <Icon name={section.icon} size={17} />
                <span className="lbl">{section.label()}</span>
                <span className="qb-switch" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="qb-btn ghost block" onClick={onReset} disabled={progress.reset_at != null && !progress.series.length && !resetDone}>
        <Icon name="undo" size={16} />
        {resetDone ? t("تبدأ «تابع القراءة» من الفاتحة.") : confirmReset ? t("اضغط مرة أخرى للتأكيد") : t("إعادة تعيين متابعة القراءة")}
      </button>
      <button type="button" className="qb-btn ghost block" onClick={clearRecents} disabled={!hasRecents}>
        <Icon name="trash" size={16} />
        {t("مسح الصفحات وعمليات البحث الأخيرة")}
      </button>
    </section>
  );
}
