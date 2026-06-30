"use client";

import { BrandMark } from "@/components/brand-mark";
import { Icon, type IconName } from "@/components/icon";

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
  { mode: "notebook", icon: "notebook", label: "الدفتر" },
  { mode: "bookmarks", icon: "bookmark", label: "المحفوظات" },
  { mode: "history", icon: "history", label: "السجلّ" },
  { mode: "roots", icon: "tree", label: "جذور" },
  { mode: "audio", icon: "ear", label: "التلاوة" },
];

export function LeftRail() {
  const { mode, setMode } = useShellMode();
  const { actions, state } = useWorkspace();

  const handleBrandClick = () => {
    // One clean navigation to the reading root (resetSearch handles the route);
    // a separate setMode here would race it and hang the shell.
    actions.resetSearch({ toReading: true });
  };

  const isLight = state.theme === "light";

  return (
    <aside className="qb-rail" aria-label="القائمة الجانبية">
      <button
        type="button"
        className="qb-rail-brand-btn"
        onClick={handleBrandClick}
        title="بصائر القرآن — العودة إلى القراءة"
        aria-label="بصائر القرآن — العودة إلى القراءة"
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

      <div className="qb-rail-spacer" />

      <RailButton
        destination={{ mode: "settings", icon: "settings", label: "إعدادات" }}
        activeMode={mode}
        onSelect={setMode}
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
    >
      <Icon name={destination.icon} size={19} />
      <span className="qb-rail-label">{destination.label}</span>
    </button>
  );
}
