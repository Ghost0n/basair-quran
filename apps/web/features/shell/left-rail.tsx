"use client";

import { BrandMark } from "@/components/brand-mark";
import { Icon, type IconName } from "@/components/icon";
import { AccountMenu } from "@/features/identity/account-menu";

import { useShellMode, type ShellMode } from "./mode-context";
import { useWorkspace } from "./workspace-context";

import { t } from "@/lib/i18n";

type RailDestination = {
  mode: ShellMode;
  icon: IconName;
  label: string;
};

const WORK_DESTINATIONS: RailDestination[] = [
  { mode: "reading", icon: "book", get label() {
    return t("القراءة");
  } },
  { mode: "search", icon: "search", get label() {
    return t("البحث");
  } },
  { mode: "studio", icon: "feather", get label() {
    return t("الدراسة");
  } },
];

const SAVED_DESTINATIONS: RailDestination[] = [
  // الدفتر consolidates the former Notebook / Bookmarks / History / Roots
  // surfaces (all views of the same saved data) into one tabbed library.
  { mode: "notebook", icon: "notebook", get label() {
    return t("الدفتر");
  } },
  { mode: "community", icon: "users", get label() {
    return t("المجتمع");
  } },
];

export function LeftRail() {
  const { mode, setMode } = useShellMode();
  const { actions } = useWorkspace();

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
      >
        <BrandMark size={40} themed />
      </button>

      {WORK_DESTINATIONS.map((dest) => (
        <RailButton key={dest.mode} destination={dest} activeMode={mode} onSelect={setMode} />
      ))}

      <div className="qb-rail-divider" role="separator" />

      {SAVED_DESTINATIONS.map((dest) => (
        <RailButton key={dest.mode} destination={dest} activeMode={mode} onSelect={setMode} />
      ))}

      {/* Recitation is no longer a rail destination — it's reached from the play
          bar (opened by the reader's footer control), where the reciter picker
          now lives as an upward dropdown. */}

      <div className="qb-rail-spacer" />

      <RailThemeButton />

      <RailButton
        destination={{ mode: "settings", icon: "settings", label: t("إعدادات") }}
        activeMode={mode}
        onSelect={setMode}
      />

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
  destination,
  activeMode,
  onSelect,
}: {
  destination: RailDestination;
  activeMode: ShellMode;
  onSelect: (next: ShellMode, options?: { resume?: boolean }) => void;
}) {
  // A theme board belongs to the library (الدفتر).
  // Sub-pages light their parent: a board / document belongs to the library,
  // a post to the community.
  const isActive =
    destination.mode === activeMode ||
    (destination.mode === "notebook" && (activeMode === "board" || activeMode === "document")) ||
    (destination.mode === "community" && activeMode === "post");
  // Double-effect: clicking the ACTIVE button collapses what it opened — back to
  // the reader (the resting surface). The reader is the resting surface itself,
  // so clicking it while active does nothing (null = no navigation).
  const target: ShellMode | null = !isActive
    ? destination.mode
    : destination.mode === "reading"
      ? null
      : "reading";
  return (
    <button
      type="button"
      className={`qb-rail-btn${isActive ? " active" : ""}`}
      // The library opens where it was left (a board, a research…).
      onClick={() => target && onSelect(target, { resume: true })}
      title={destination.label}
      aria-label={destination.label}
      aria-current={isActive ? "page" : undefined}
      // The notebook icon is the flight target for the pin-to-notebook ghost.
      data-rail-notebook={destination.mode === "notebook" ? "" : undefined}
    >
      <Icon name={destination.icon} size={19} />
      <span className="qb-rail-label" data-fit-watch>{destination.label}</span>
    </button>
  );
}
