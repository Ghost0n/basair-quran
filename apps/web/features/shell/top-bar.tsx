"use client";

import { CommandBar } from "./command-bar";
import { useShellMode } from "./mode-context";
import { QuickSettings } from "./quick-settings";

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
        <QuickSettings />
      </div>
    </div>
  );
}
