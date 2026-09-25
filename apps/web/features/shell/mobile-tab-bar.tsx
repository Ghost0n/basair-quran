"use client";

import { useState } from "react";

import { Icon, type IconName } from "@/components/icon";

import { useShellMode, type ShellMode } from "./mode-context";
import { useWorkspace } from "./workspace-context";
import { MoreSheet } from "./more-sheet";

import { t } from "@/lib/i18n";

type Tab = { mode: ShellMode; icon: IconName; label: string };

const TABS: Tab[] = [
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
];

/**
 * Bottom tab bar — the mobile replacement for the LeftRail. Four primary
 * destinations plus a "المزيد" overflow (settings / account / theme), the
 * mobile home for what the desktop rail's account menu + settings button hold.
 * Hidden on desktop via CSS.
 */
export function MobileTabBar() {
  const { mode, setMode } = useShellMode();
  const { state, actions } = useWorkspace();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
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
              onClick={() => setMode(tab.mode)}
              aria-current={active ? "page" : undefined}
            >
              <span className="tile">
                <Icon name={tab.icon} size={20} />
              </span>
              <span className="label" data-fit-watch>{tab.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={`qb-tabbar-btn${mode === "settings" ? " active" : ""}`}
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
        >
          <span className="tile">
            <Icon name="more" size={20} />
          </span>
          <span className="label" data-fit-watch>{t("المزيد")}</span>
        </button>
      </nav>

      {moreOpen ? (
        <MoreSheet
          onClose={() => setMoreOpen(false)}
          onOpenSettings={() => setMode("settings")}
          theme={state.theme === "light" ? "light" : "dark"}
          onToggleTheme={actions.toggleTheme}
        />
      ) : null}
    </>
  );
}
