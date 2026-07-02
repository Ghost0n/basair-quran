"use client";

import type { ReactNode } from "react";

import "@/features/concordance/concordance.css";

import { ConcordancePanel } from "@/features/concordance/concordance-panel";
import { MushafStage } from "@/features/reading/mushaf-stage";
import { StudioPanel } from "@/features/studio/studio-panel";
import { useIsMobile } from "@/lib/use-is-mobile";

import type { ShellMode } from "./mode-context";

/**
 * Below this width the scholar's desk (a panel beside the Mushaf) stops being
 * viable: one 440px panel plus the 84px rail would crush the Mushaf under
 * ~480px. So from here down we fall to FOCUS MODE — the active surface takes
 * the whole canvas and the Mushaf is one rail-tap away — the same single-column
 * behaviour the mobile layout already uses, just at an honest threshold. The
 * rail/tab-bar switch stays independent at 768px (see shell.css).
 */
const COMPACT_WORKSPACE = 1000;

/**
 * The mode-aware workspace canvas.
 *
 * Wide desktop: the Mushaf is the resting surface, always present; Concordance,
 * Notebook, and Studio slide in beside it (the scholar's desk).
 * Compact (≤1000px) & mobile: a single column — the active surface fills the
 * canvas; the Mushaf recedes rather than being squeezed to a sliver.
 */
export function WorkspaceCanvas({ mode }: { mode: ShellMode }) {
  const isCompact = useIsMobile(COMPACT_WORKSPACE);

  const panel =
    mode === "search" ? <ConcordancePanel /> : mode === "studio" ? <StudioPanel /> : null;

  if (isCompact) {
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
  const isCompact = useIsMobile(COMPACT_WORKSPACE);

  if (isCompact) {
    return <div className="qb-workspace-canvas qb-companion-canvas">{children}</div>;
  }

  return (
    <div className="qb-workspace-canvas qb-companion-canvas">
      <div className="qb-companion-panel">{children}</div>
      <MushafStage />
    </div>
  );
}
