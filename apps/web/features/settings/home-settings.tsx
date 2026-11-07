"use client";

import type { HomeSectionId } from "@q-basair/shared";

import { Icon, type IconName } from "@/components/icon";
import { usePreferences } from "@/lib/preferences-context";

import { t } from "@/lib/i18n";

/** Home's sections, in the order they appear there (home-screen.tsx). */
const SECTIONS: { id: HomeSectionId; icon: IconName; label: () => string; wideOnly?: boolean }[] = [
  { id: "greeting", icon: "user", label: () => t("التحية") },
  { id: "verse", icon: "book", label: () => t("الآية المتجدّدة"), wideOnly: true },
  { id: "continue", icon: "book", label: () => t("متابعة القراءة") },
  { id: "index", icon: "menu", label: () => t("الفهرس") },
  { id: "saved", icon: "bookmark", label: () => t("المحفوظة") },
  { id: "study", icon: "sparkles", label: () => t("الدراسة") },
  { id: "community", icon: "users", label: () => t("المجتمع") },
  { id: "search", icon: "search", label: () => t("البحث") },
];

/**
 * «الرئيسية» — show or hide each part of the Home screen. Saved on the account
 * as the sections hidden (`home_hidden`), so a section added later shows.
 * The rotating verse only exists on wide screens, so phones don't list it.
 */
export function HomeSettings() {
  const { preferences, updateAccount } = usePreferences();
  const hidden = preferences.home_hidden ?? [];

  function toggle(id: HomeSectionId) {
    const next = hidden.includes(id) ? hidden.filter((item) => item !== id) : [...hidden, id];
    void updateAccount({ home_hidden: next });
  }

  return (
    <section className="qb-setting-card">
      <h3>{t("الرئيسية")}</h3>
      <p className="card-sub">{t("اختر ما تعرضه الشاشة الرئيسية.")}</p>
      <ul className="qb-switch-list">
        {SECTIONS.map((section) => {
          const shown = !hidden.includes(section.id);
          return (
            <li key={section.id} className={section.wideOnly ? "wide-only" : undefined}>
              <button type="button" role="switch" aria-checked={shown} className="qb-switch-row" onClick={() => toggle(section.id)}>
                <Icon name={section.icon} size={17} />
                <span className="lbl">{section.label()}</span>
                <span className="qb-switch" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
