"use client";

import { Suspense } from "react";

import { useShellMode } from "@/features/shell/mode-context";
import { WorkspaceCanvas, CompanionCanvas } from "@/features/shell/workspace-canvas";
import { HomeScreen } from "@/features/home/home-screen";
import { LibraryScreen } from "@/features/companions/library-screen";
import { HeatmapScreen } from "@/features/concordance/heatmap-screen";
import { SettingsScreen } from "@/features/settings/settings-screen";
import { BoardScreen } from "@/features/board/board-screen";
import { DocumentScreen } from "@/features/documents/document-screen";

function WorkspacePage() {
  const { mode } = useShellMode();

  switch (mode) {
    case "home":
      return <HomeScreen />;
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
    // Settings is a full-width page (like the heatmap), not a companion beside
    // the Mushaf: its multi-column card grid was designed for the wide canvas,
    // and you don't read while configuring.
    case "settings":
      return <SettingsScreen />;
    case "heatmap":
      return <HeatmapScreen />;
    // A theme's graph board — full width: it's a canvas, not a companion.
    case "board":
      return <BoardScreen />;
    case "document":
      return <DocumentScreen />;
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
