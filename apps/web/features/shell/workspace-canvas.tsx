"use client";

import type { ReactNode } from "react";

import "@/features/concordance/concordance.css";

import { ConcordancePanel } from "@/features/concordance/concordance-panel";
import { MushafStage } from "@/features/reading/mushaf-stage";
import { StudioPanel } from "@/features/studio/studio-panel";
import { useIsMobile } from "@/lib/use-is-mobile";

import type { ShellMode } from "./mode-context";

/**
 * The mode-aware workspace canvas.
 *
 * Desktop: the Mushaf is the resting surface, always present; Concordance,
 * Notebook, and Studio slide in over it (the scholar's desk).
 * Mobile: a single column — the active surface fills the screen.
 */
export function WorkspaceCanvas({ mode }: { mode: ShellMode }) {
  const isMobile = useIsMobile();

  const panel =
    mode === "search" ? <ConcordancePanel /> : mode === "studio" ? <StudioPanel /> : null;

  if (isMobile) {
    return <div className="qb-workspace-canvas">{panel ?? <MushafStage />}</div>;
  }

  return (
    <div className="qb-workspace-canvas">
      {mode === "search" ? <ConcordancePanel /> : null}
      <MushafStage />
      {mode === "studio" ? <StudioPanel /> : null}
    </div>
  );
}

/**
 * U5 — CompanionCanvas: shows a companion screen (Bookmarks, History, Roots,
 * Settings, Audio) in a side panel alongside the always-visible Mushaf.
 * On mobile the companion fills the full width and the Mushaf is hidden.
 */
export function CompanionCanvas({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <div className="qb-workspace-canvas qb-companion-canvas">{children}</div>;
  }

  return (
    <div className="qb-workspace-canvas qb-companion-canvas">
      <div className="qb-companion-panel">{children}</div>
      <MushafStage />
    </div>
  );
}
