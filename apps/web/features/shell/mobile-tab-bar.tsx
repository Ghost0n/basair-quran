"use client";

import { Icon, type IconName } from "@/components/icon";

import { useShellMode, type ShellMode } from "./mode-context";

type Tab = { mode: ShellMode; icon: IconName; label: string };

const TABS: Tab[] = [
  { mode: "reading", icon: "book", label: "القراءة" },
  { mode: "search", icon: "search", label: "البحث" },
  { mode: "studio", icon: "sparkles", label: "الدراسة" },
  { mode: "notebook", icon: "notebook", label: "الدفتر" },
];

/**
 * Bottom tab bar — the mobile replacement for the LeftRail. Shows the
 * four primary destinations; the rest stay reachable from their screens.
 * Hidden on desktop via CSS.
 */
export function MobileTabBar() {
  const { mode, setMode } = useShellMode();

  return (
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
    </nav>
  );
}
