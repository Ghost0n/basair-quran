"use client";

import { Icon } from "@/components/icon";
import { useWebDesign } from "@/lib/use-web-design";

import { CommandBar } from "./command-bar";
import { useShellMode } from "./mode-context";
import { useCommandShortcut } from "./use-command-shortcut";
import { useWorkspace } from "./workspace-context";
import { HOME, RAIL_GROUPS } from "./worlds";
import type { ShellMode } from "./mode-context";

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

/** The page's name in the web top bar: the destination that owns the mode. */
export function pageTitle(mode: ShellMode): string {
  if (mode === "settings") return t("الإعدادات");
  for (const item of [HOME, ...RAIL_GROUPS.flat()]) if (item.owns.includes(mode)) return item.label;
  return "";
}

export function TopBar() {
  const { mode, setMode } = useShellMode();
  const web = useWebDesign();
  // ⌘K / `/` work everywhere: they open Search (whose bar then takes focus).
  useCommandShortcut(() => setMode("search"));
  // The web design (desktop): the page's name and the command bar on every
  // page, so a root, a reference or a question is one keystroke away. Home
  // carries its own greeting.
  if (web) {
    const title = mode === "home" ? "" : pageTitle(mode);
    return (
      <div className="qb-topbar qb-topbar-web">
        <div className="qb-crumbs-web">{title ? <h1>{title}</h1> : null}</div>
        <CommandBar />
      </div>
    );
  }
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
