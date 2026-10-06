"use client";

import { BrandMark } from "@/components/brand-mark";
import { Icon, type IconName } from "@/components/icon";
import { AccountMenu } from "@/features/identity/account-menu";

import { useSearchParams } from "next/navigation";

import "./worlds.css";

import { useShellMode } from "./mode-context";
import { useWorkspace } from "./workspace-context";
import { activeTabId, useWorldNavigation, useWorldSync, WORLD_ORDER, WORLDS } from "./worlds";

import { t } from "@/lib/i18n";

/**
 * The desktop rail follows the phone's worlds (shell/worlds.ts): the brand mark
 * (which is the Home button), a three-world switch (gold · teal · copper), then
 * the current world's pages.
 */
export function LeftRail() {
  const { mode } = useShellMode();
  const params = useSearchParams();
  const communityTab = params.get("tab");
  const world = useWorldSync(communityTab);
  const { openTab, changeWorld } = useWorldNavigation();
  const { setMode } = useShellMode();
  const { actions } = useWorkspace();
  const active = activeTabId(mode, communityTab);

  const handleBrandClick = () => {
    // One clean navigation to the root (resetSearch handles the route); with the
    // default mode now `home`, `/` lands on the Home landing. A separate setMode
    // here would race it and hang the shell.
    actions.resetSearch({ toReading: true });
  };

  return (
    <aside className="qb-rail" data-autofit="3" aria-label={t("القائمة الجانبية")}>
      <button
        type="button"
        className="qb-rail-brand-btn"
        onClick={handleBrandClick}
        title={t("بصائر القرآن — الصفحة الرئيسية")}
        aria-label={t("بصائر القرآن — الصفحة الرئيسية")}
        aria-current={active === "home" ? "page" : undefined}
      >
        <BrandMark size={40} themed />
      </button>

      <div className="qb-rail-worlds" role="group" aria-label={t("العوالم")}>
        {WORLD_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            className="qb-rail-world"
            data-w={id}
            aria-pressed={id === world}
            onClick={() => changeWorld(id, mode === "home")}
            title={`${WORLDS[id].label} — ${WORLDS[id].desc}`}
            aria-label={WORLDS[id].label}
          >
            <Icon name={WORLDS[id].icon} size={16} />
          </button>
        ))}
      </div>

      <div className="qb-rail-divider" role="separator" />

      {WORLDS[world].tabs.map((tab) => (
        <RailButton
          key={tab.id}
          icon={tab.icon}
          label={tab.label}
          active={active === tab.id}
          world
          notebook={tab.id === "notebook"}
          onSelect={() => openTab(world, tab.id)}
        />
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
  world = false,
  notebook = false,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  onSelect: () => void;
  /** A page of the current world: lit in the world's colour. */
  world?: boolean;
  /** The notebook icon is the flight target for the pin-to-notebook ghost. */
  notebook?: boolean;
}) {
  return (
    <button
      type="button"
      className={`qb-rail-btn${active ? " active" : ""}${world ? " is-world" : ""}`}
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
