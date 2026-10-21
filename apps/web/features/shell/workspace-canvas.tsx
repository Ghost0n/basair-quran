"use client";

import type { ReactNode } from "react";

import "@/features/concordance/concordance.css";

import { ConcordancePanel } from "@/features/concordance/concordance-panel";
import { MushafStage } from "@/features/reading/mushaf-stage";
import { OnlineOnly } from "@/features/app-mode/online-only";
import { StudioPanel } from "@/features/studio/studio-panel";
import { useIsMobile } from "@/lib/use-is-mobile";

import { useShellMode, type ShellMode } from "./mode-context";
import { useRoomReset, useRoomWide } from "./room";

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
  // Web design: the panel can widen over the whole canvas (features/shell/room.tsx).
  useRoomReset(mode);
  const [wide] = useRoomWide();

  const panel =
    mode === "search" ? <ConcordancePanel /> : mode === "studio" ? <OnlineOnly><StudioPanel /></OnlineOnly> : null;

  if (isCompact) {
    return <div className="qb-workspace-canvas">{panel ?? <MushafStage />}</div>;
  }

  // "The mushaf is the room": when a panel is summoned beside it, the reader
  // settles back (scale + dim) so the panel reads as layered above it.
  const panelOpen = mode === "search" || mode === "studio";

  return (
    <div className={`qb-workspace-canvas${panelOpen ? " has-panel" : ""}${panelOpen && wide ? " is-wide" : ""}`}>
      {/* Every panel opens on the same side — inline-start (the right in RTL),
          next to the rail that summoned it; the mushaf keeps the rest. */}
      {mode === "search" ? <ConcordancePanel /> : null}
      {mode === "studio" ? (
        <OnlineOnly>
          <StudioPanel />
        </OnlineOnly>
      ) : null}
      <MushafStage />
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
  const { mode } = useShellMode();
  useRoomReset(mode);
  const [wide] = useRoomWide();

  if (isCompact) {
    return <div className="qb-workspace-canvas qb-companion-canvas">{children}</div>;
  }

  return (
    <div className={`qb-workspace-canvas qb-companion-canvas${wide ? " is-wide" : ""}`}>
      <div className="qb-companion-panel">{children}</div>
      <MushafStage />
    </div>
  );
}
