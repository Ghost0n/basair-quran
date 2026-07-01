"use client";

import { Suspense } from "react";

import { useShellMode } from "@/features/shell/mode-context";
import { WorkspaceCanvas, CompanionCanvas } from "@/features/shell/workspace-canvas";
import { LibraryScreen } from "@/features/companions/library-screen";
import { HeatmapScreen } from "@/features/concordance/heatmap-screen";
import { SettingsScreen } from "@/features/settings/settings-screen";

function WorkspacePage() {
  const { mode } = useShellMode();

  switch (mode) {
    case "reading":
      return <WorkspaceCanvas mode="reading" />;
    case "search":
      return <WorkspaceCanvas mode="search" />;
    case "studio":
      return <WorkspaceCanvas mode="studio" />;
    // الدفتر — unified library (saved verses, research sessions, followed roots)
    // beside the Mushaf. The legacy bookmarks/history/roots modes open the same
    // screen on the matching tab so old links keep working.
    case "notebook":
    case "bookmarks":
      return <CompanionCanvas><LibraryScreen initialTab="verses" /></CompanionCanvas>;
    case "history":
      return <CompanionCanvas><LibraryScreen initialTab="sessions" /></CompanionCanvas>;
    case "roots":
      return <CompanionCanvas><LibraryScreen initialTab="roots" /></CompanionCanvas>;
    case "settings":
      return <CompanionCanvas><SettingsScreen /></CompanionCanvas>;
    case "heatmap":
      return <HeatmapScreen />;
    default:
      return <WorkspaceCanvas mode="reading" />;
  }
}

export default function ShellHomePage() {
  return (
    <Suspense fallback={null}>
      <WorkspacePage />
    </Suspense>
  );
}
