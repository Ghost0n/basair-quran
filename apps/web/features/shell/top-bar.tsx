"use client";

import { Icon } from "@/components/icon";

import { CommandBar } from "./command-bar";
import { useShellMode } from "./mode-context";
import { useCommandShortcut } from "./use-command-shortcut";
import { useWorkspace } from "./workspace-context";

import { t } from "@/lib/i18n";

/** The theme toggle icon button — shows the theme you'd switch TO. Used on the
 *  phone Home screen; on larger screens the rail carries its own (left-rail.tsx),
 *  and Settings has the full choice. */
export function ThemeButton({ className = "qb-icon-btn" }: { className?: string }) {
  const { state, actions } = useWorkspace();
  const dark = state.theme !== "light";
  return (
    <button
      type="button"
      className={className}
      onClick={actions.toggleTheme}
      title={dark ? t("السِّمة الفاتحة") : t("السِّمة الداكنة")}
      aria-label={dark ? t("التبديل إلى السِّمة الفاتحة") : t("التبديل إلى السِّمة الداكنة")}
    >
      <Icon name={dark ? "sun" : "moon"} size={18} />
    </button>
  );
}

export function TopBar() {
  const { mode, setMode } = useShellMode();
  // ⌘K / `/` work everywhere: they open Search (whose bar then takes focus).
  useCommandShortcut(() => setMode("search"));
  // The command bar is Search's own surface: elsewhere it would only cost a
  // row of height (the reader bar carries a search button; Home has its hero
  // ask bar), so it shows in Search mode only.
  if (mode !== "search") return null;

  return (
    <div className="qb-topbar">
      <CommandBar />
    </div>
  );
}
