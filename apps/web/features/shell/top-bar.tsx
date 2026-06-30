"use client";

import { CommandBar } from "./command-bar";
import { QuickSettings } from "./quick-settings";

export function TopBar() {
  return (
    <div className="qb-topbar">
      <CommandBar />

      <div className="qb-top-actions">
        <QuickSettings />
      </div>
    </div>
  );
}
