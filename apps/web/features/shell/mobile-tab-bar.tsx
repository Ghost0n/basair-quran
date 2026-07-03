"use client";

import { useState } from "react";

import { Icon, type IconName } from "@/components/icon";

import { useShellMode, type ShellMode } from "./mode-context";
import { useWorkspace } from "./workspace-context";
import { MoreSheet } from "./more-sheet";

type Tab = { mode: ShellMode; icon: IconName; label: string };

const TABS: Tab[] = [
  { mode: "reading", icon: "book", label: "القراءة" },
  { mode: "search", icon: "search", label: "البحث" },
  { mode: "studio", icon: "sparkles", label: "الدراسة" },
  { mode: "notebook", icon: "notebook", label: "الدفتر" },
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
      <nav className="qb-tabbar" aria-label="التنقل">
        {TABS.map((tab) => {
          const active = tab.mode === mode;
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
              <span className="label">{tab.label}</span>
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
          <span className="label">المزيد</span>
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
