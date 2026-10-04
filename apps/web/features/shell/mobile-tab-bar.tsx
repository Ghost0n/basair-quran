"use client";

import { Icon, type IconName } from "@/components/icon";

import { useShellMode, type ShellMode } from "./mode-context";

import { t } from "@/lib/i18n";

type Tab = { mode: ShellMode; icon: IconName; label: string };

const TABS: Tab[] = [
  { mode: "home", icon: "home", get label() {
    return t("الرئيسية");
  } },
  { mode: "reading", icon: "book", get label() {
    return t("القراءة");
  } },
  { mode: "search", icon: "search", get label() {
    return t("البحث");
  } },
  { mode: "studio", icon: "sparkles", get label() {
    return t("الدراسة");
  } },
  { mode: "notebook", icon: "notebook", get label() {
    return t("الدفتر");
  } },
  { mode: "community", icon: "users", get label() {
    return t("المجتمع");
  } },
  // Settings sits in the bar itself: theme, language, account and sign-out
  // all live on that screen, so no overflow sheet is needed.
  { mode: "settings", icon: "settings", get label() {
    return t("الإعدادات");
  } },
];

/**
 * Bottom tab bar — the mobile replacement for the LeftRail: the six
 * destinations plus Settings (which carries the theme switch and the account).
 * Hidden on desktop via CSS.
 */
export function MobileTabBar() {
  const { mode, setMode } = useShellMode();

  return (
    <nav className="qb-tabbar" data-autofit="2" aria-label={t("التنقل")}>
      {TABS.map((tab) => {
        const active =
          tab.mode === mode ||
          (tab.mode === "notebook" && (mode === "board" || mode === "document")) ||
          (tab.mode === "community" && mode === "post");
        return (
          <button
            key={tab.mode}
            type="button"
            className={`qb-tabbar-btn${active ? " active" : ""}`}
            onClick={() => {
              // The library opens where it was left (a board, a research…).
              setMode(tab.mode, { resume: !active });
            }}
            aria-current={active ? "page" : undefined}
          >
            <span className="tile">
              <Icon name={tab.icon} size={20} />
            </span>
            <span className="label" data-fit-watch>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
