"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { useShellMode } from "@/features/shell/mode-context";
import { WorkspaceCanvas } from "@/features/shell/workspace-canvas";
import { HomeScreen } from "@/features/home/home-screen";
import { LibraryScreen, libraryTab } from "@/features/companions/library-screen";
import { HeatmapScreen } from "@/features/concordance/heatmap-screen";
import { SettingsScreen } from "@/features/settings/settings-screen";
import { BoardScreen } from "@/features/board/board-screen";
import { DocumentScreen } from "@/features/documents/document-screen";
import { OnlineOnly } from "@/features/app-mode/online-only";
import { CommunityScreen } from "@/features/community/community-screen";
import { PostScreen } from "@/features/community/post-screen";
import { IndexScreen, SavedPagesScreen } from "@/features/reading/reading-pages";

function WorkspacePage() {
  const { mode } = useShellMode();
  const params = useSearchParams();

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
      return <WorkspaceCanvas mode={mode} companion={<LibraryScreen initialTab={libraryTab(params.get("tab"))} />} />;
    case "history":
      return <WorkspaceCanvas mode={mode} companion={<LibraryScreen initialTab="sessions" />} />;
    case "roots":
      return <WorkspaceCanvas mode={mode} companion={<LibraryScreen initialTab="roots" />} />;
    // Settings is a full-width page (like the heatmap), not a companion beside
    // the Mushaf: its multi-column card grid was designed for the wide canvas,
    // and you don't read while configuring.
    case "settings":
      return <SettingsScreen />;
    // The reading world's pages, beside the mushaf on wide screens.
    case "saved":
      return <WorkspaceCanvas mode={mode} companion={<SavedPagesScreen />} />;
    case "index":
      return <WorkspaceCanvas mode={mode} companion={<IndexScreen />} />;
    case "heatmap":
      return <HeatmapScreen />;
    // A theme's graph board — full width: it's a canvas, not a companion.
    case "board":
      return <BoardScreen />;
    case "document":
      return <DocumentScreen />;
    // Community lives on the server: the standalone app shows it when online.
    case "community":
      return (
        <OnlineOnly>
          <CommunityScreen />
        </OnlineOnly>
      );
    case "post":
      return (
        <OnlineOnly>
          <PostScreen />
        </OnlineOnly>
      );
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
