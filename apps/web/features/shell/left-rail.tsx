"use client";

import { BrandMark } from "@/components/brand-mark";
import { Icon, type IconName } from "@/components/icon";
import { AccountMenu } from "@/features/identity/account-menu";
import { useWebDesign } from "@/lib/use-web-design";

import { Fragment } from "react";

import "./worlds.css";

import { useShellMode } from "./mode-context";
import { useWorkspace } from "./workspace-context";
import { RAIL_GROUPS, tabTap, useOpenDestination, useWorldSync, type WorldId } from "./worlds";

import { t } from "@/lib/i18n";

/**
 * The desktop rail: the brand mark (which is the Home button), then every
 * destination grouped by world (reading · research · community), each always
 * in the same place — a wide screen has room for all of them, so nothing hides
 * behind a world switch. The active destination is lit in its world's colour
 * (shell/worlds.ts).
 */
export function LeftRail() {
  const { mode, setMode } = useShellMode();
  // The rail is mounted on every screen size: it keeps the page's tint in step.
  useWorldSync();
  const open = useOpenDestination();
  const { actions } = useWorkspace();
  const web = useWebDesign();

  const handleBrandClick = () => {
    // One clean navigation to the root (resetSearch handles the route); with the
    // default mode now `home`, `/` lands on the Home landing. A separate setMode
    // here would race it and hang the shell.
    actions.resetSearch({ toReading: true });
  };

  return (
    <aside className="qb-rail" data-autofit="3" suppressHydrationWarning aria-label={t("القائمة الجانبية")}>
      <button
        type="button"
        className="qb-rail-brand-btn"
        onClick={handleBrandClick}
        title={t("بصائر القرآن — الصفحة الرئيسية")}
        aria-label={t("بصائر القرآن — الصفحة الرئيسية")}
        aria-current={mode === "home" ? "page" : undefined}
      >
        <BrandMark size={40} themed />
      </button>

      {RAIL_GROUPS.map((group, index) => (
        <Fragment key={index}>
          <div className="qb-rail-divider" role="separator" />
          {/* Web design: the Index opens from the reader's surah name, not the rail. */}
          {group.filter((item) => !(web && item.id === "index")).map((item) => (
            <RailButton
              key={item.id}
              // Web design: Saved opens the Index on its saved pages, beside
              // the Mushaf — the place to go somewhere in it: «انتقل».
              icon={web && item.id === "saved" ? "compass" : item.icon}
              label={web && item.id === "saved" ? t("انتقل") : item.label}
              active={item.owns.includes(mode)}
              world={item.world}
              notebook={item.id === "notebook"}
              // From one of its sub-pages (a board…), back to its main page.
              onSelect={() => open(item, { main: tabTap(item, mode) === "main" })}
            />
          ))}
        </Fragment>
      ))}

      <div className="qb-rail-spacer" />

      <RailThemeButton />

      <RailButton icon="settings" label={t("إعدادات")} active={mode === "settings"} onSelect={() => setMode("settings")} />

      <AccountMenu onOpenSettings={() => setMode("settings")} />
    </aside>
  );
}

/** The theme switch, just above Settings: shows the theme you'd switch TO. */
function RailThemeButton() {
  const { state, actions } = useWorkspace();
  const dark = state.theme !== "light";
  return (
    <button
      type="button"
      className="qb-rail-btn qb-rail-theme"
      onClick={actions.toggleTheme}
      title={dark ? t("التبديل إلى السِّمة الفاتحة") : t("التبديل إلى السِّمة الداكنة")}
      aria-label={dark ? t("التبديل إلى السِّمة الفاتحة") : t("التبديل إلى السِّمة الداكنة")}
    >
      <Icon name={dark ? "sun" : "moon"} size={19} />
      <span className="qb-rail-label" data-fit-watch>{t("السمة")}</span>
    </button>
  );
}

function RailButton({
  icon,
  label,
  active,
  onSelect,
  world = null,
  notebook = false,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  onSelect: () => void;
  /** The destination's world: lit in that world's colour. */
  world?: WorldId | null;
  /** The notebook icon is the flight target for the pin-to-notebook ghost. */
  notebook?: boolean;
}) {
  return (
    <button
      type="button"
      className={`qb-rail-btn${active ? " active" : ""}${world ? " is-world" : ""}`}
      data-w={world ?? undefined}
      onClick={onSelect}
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      data-rail-notebook={notebook ? "" : undefined}
    >
      <Icon name={icon} size={19} />
      <span className="qb-rail-label" data-fit-watch>{label}</span>
    </button>
  );
}
