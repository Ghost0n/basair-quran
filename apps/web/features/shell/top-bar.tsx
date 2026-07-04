"use client";

import { Icon } from "@/components/icon";

import { CommandBar } from "./command-bar";
import { useShellMode } from "./mode-context";
import { QuickSettings } from "./quick-settings";
import { useWorkspace } from "./workspace-context";

/** Dedicated theme toggle — its own top-bar button now, no longer buried in the
 *  quick-settings popover or the account menu. Shows the theme you'd switch TO. */
function ThemeButton() {
  const { state, actions } = useWorkspace();
  const dark = state.theme !== "light";
  return (
    <button
      type="button"
      className="qb-icon-btn"
      onClick={actions.toggleTheme}
      title={dark ? "السِّمة الفاتحة" : "السِّمة الداكنة"}
      aria-label={dark ? "التبديل إلى السِّمة الفاتحة" : "التبديل إلى السِّمة الداكنة"}
    >
      <Icon name={dark ? "sun" : "moon"} size={18} />
    </button>
  );
}

export function TopBar() {
  const { mode } = useShellMode();
  // Home has its own centered ask bar (the hero search) — the top command bar
  // would be redundant there, so it's hidden on Home and the center bar
  // "rises" into this slot when the user enters a working mode.
  if (mode === "home") return null;

  return (
    <div className="qb-topbar">
      <CommandBar />

      <div className="qb-top-actions">
        <ThemeButton />
        <QuickSettings />
      </div>
    </div>
  );
}
