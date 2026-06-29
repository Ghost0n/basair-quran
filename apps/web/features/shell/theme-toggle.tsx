"use client";

import { useEffect } from "react";

import { Icon } from "@/components/icon";

import { useWorkspace } from "./workspace-context";

/**
 * Theme toggle button. Until Phase 7 ships PreferencesProvider, the
 * theme state lives in the legacy workspace hook; this component bridges
 * to it and also syncs the `light-mode` class on <body> for both the
 * legacy workspace styles and the new design-token `.light` selector.
 */
export function ThemeToggle() {
  const { state, actions } = useWorkspace();
  const isLight = state.theme === "light";

  useEffect(() => {
    document.body.classList.toggle("light-mode", isLight);
    document.body.classList.toggle("light", isLight);
    return () => {
      document.body.classList.remove("light-mode");
      document.body.classList.remove("light");
    };
  }, [isLight]);

  return (
    <button
      type="button"
      className="qb-icon-btn qb-theme-toggle"
      onClick={actions.toggleTheme}
      title={isLight ? "السمة الداكنة" : "السمة الفاتحة"}
      aria-label={isLight ? "تفعيل السمة الداكنة" : "تفعيل السمة الفاتحة"}
      // Theme is read from localStorage on the client (dark on the server),
      // so the icon may differ for one frame — expected, not a real mismatch.
      suppressHydrationWarning
    >
      <Icon name={isLight ? "moon" : "sun"} size={18} />
    </button>
  );
}
