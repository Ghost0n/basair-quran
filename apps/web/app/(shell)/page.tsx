"use client";

import { Suspense } from "react";

import { useShellMode } from "@/features/shell/mode-context";
import { WorkspaceCanvas, CompanionCanvas } from "@/features/shell/workspace-canvas";
import { BookmarksScreen } from "@/features/companions/bookmarks-screen";
import { RootsScreen } from "@/features/companions/roots-screen";
import { SessionsScreen } from "@/features/companions/sessions-screen";
import { HeatmapScreen } from "@/features/concordance/heatmap-screen";
import { RecitationScreen } from "@/features/recitation/recitation-screen";
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
    case "notebook":
      return <WorkspaceCanvas mode="notebook" />;
    // U5: companion screens show beside the Mushaf on desktop.
    case "bookmarks":
      return <CompanionCanvas><BookmarksScreen /></CompanionCanvas>;
    case "history":
      return <CompanionCanvas><SessionsScreen /></CompanionCanvas>;
    case "roots":
      return <CompanionCanvas><RootsScreen /></CompanionCanvas>;
    case "audio":
      return <CompanionCanvas><RecitationScreen /></CompanionCanvas>;
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
