"use client";

import { BrandMark } from "@/components/brand-mark";
import { Icon, type IconName } from "@/components/icon";
import { AccountMenu } from "@/features/identity/account-menu";
import { useRecitation } from "@/features/recitation/recitation-context";

import { useShellMode, type ShellMode } from "./mode-context";
import { useWorkspace } from "./workspace-context";

type RailDestination = {
  mode: ShellMode;
  icon: IconName;
  label: string;
};

const WORK_DESTINATIONS: RailDestination[] = [
  { mode: "reading", icon: "book", label: "القراءة" },
  { mode: "search", icon: "search", label: "البحث" },
  { mode: "studio", icon: "feather", label: "الدراسة" },
];

const SAVED_DESTINATIONS: RailDestination[] = [
  // الدفتر consolidates the former Notebook / Bookmarks / History / Roots
  // surfaces (all views of the same saved data) into one tabbed library.
  { mode: "notebook", icon: "notebook", label: "الدفتر" },
];

export function LeftRail() {
  const { mode, setMode } = useShellMode();
  const { actions, state } = useWorkspace();
  const recitation = useRecitation();

  const handleBrandClick = () => {
    // One clean navigation to the root (resetSearch handles the route); with the
    // default mode now `home`, `/` lands on the Home landing. A separate setMode
    // here would race it and hang the shell.
    actions.resetSearch({ toReading: true });
  };

  const isLight = state.theme === "light";

  return (
    <aside className="qb-rail" aria-label="القائمة الجانبية">
      <button
        type="button"
        className="qb-rail-brand-btn"
        onClick={handleBrandClick}
        title="بصائر القرآن — الصفحة الرئيسية"
        aria-label="بصائر القرآن — الصفحة الرئيسية"
      >
        <BrandMark size={40} light={isLight} />
      </button>

      {WORK_DESTINATIONS.map((dest) => (
        <RailButton key={dest.mode} destination={dest} activeMode={mode} onSelect={setMode} />
      ))}

      <div className="qb-rail-divider" role="separator" />

      {SAVED_DESTINATIONS.map((dest) => (
        <RailButton key={dest.mode} destination={dest} activeMode={mode} onSelect={setMode} />
      ))}

      {/* التلاوة is no longer a screen — it summons the reciter sheet; the media
          bar (in the shell) carries transport once a recitation is playing. */}
      <button
        type="button"
        className={`qb-rail-btn${recitation.sheetOpen ? " active" : ""}`}
        onClick={recitation.openSheet}
        title="التلاوة"
        aria-label="التلاوة"
        aria-haspopup="dialog"
      >
        <Icon name="ear" size={19} />
        <span className="qb-rail-label">التلاوة</span>
      </button>

      <div className="qb-rail-spacer" />

      <RailButton
        destination={{ mode: "settings", icon: "settings", label: "إعدادات" }}
        activeMode={mode}
        onSelect={setMode}
      />

      <AccountMenu
        theme={isLight ? "light" : "dark"}
        onToggleTheme={actions.toggleTheme}
        onOpenSettings={() => setMode("settings")}
      />
    </aside>
  );
}

function RailButton({
  destination,
  activeMode,
  onSelect,
}: {
  destination: RailDestination;
  activeMode: ShellMode;
  onSelect: (next: ShellMode) => void;
}) {
  const isActive = destination.mode === activeMode;
  return (
    <button
      type="button"
      className={`qb-rail-btn${isActive ? " active" : ""}`}
      onClick={() => onSelect(destination.mode)}
      title={destination.label}
      aria-label={destination.label}
      aria-current={isActive ? "page" : undefined}
      // The notebook icon is the flight target for the pin-to-notebook ghost.
      data-rail-notebook={destination.mode === "notebook" ? "" : undefined}
    >
      <Icon name={destination.icon} size={19} />
      <span className="qb-rail-label">{destination.label}</span>
    </button>
  );
}
