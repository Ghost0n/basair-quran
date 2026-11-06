"use client";

import type { ReactNode } from "react";

import "@/features/concordance/concordance.css";

import { ConcordancePanel } from "@/features/concordance/concordance-panel";
import { MushafStage } from "@/features/reading/mushaf-stage";
import { OnlineOnly } from "@/features/app-mode/online-only";
import { StudioPanel } from "@/features/studio/studio-panel";
import { useBand } from "@/lib/bands";
import { useWebDesign } from "@/lib/use-web-design";

import { useShellMode, type ShellMode } from "./mode-context";
import { useRoomReset, useRoomWide } from "./room";

/**
 * Below the wide band (WIDE_MIN, lib/bands.ts) the scholar's desk (a panel beside the Mushaf) stops being
 * viable: one 440px panel plus the 84px rail would crush the Mushaf under
 * ~480px. So from here down we fall to FOCUS MODE — the active surface takes
 * the whole canvas and the Mushaf is one rail-tap away — the same single-column
 * behaviour the phone band uses; the rail gives way to the tab bar in the phone band.
 */

/**
 * The mode-aware workspace canvas.
 *
 * Wide desktop: the Mushaf is the resting surface, always present; Concordance,
 * Notebook, and Studio slide in beside it (the scholar's desk).
 * Compact (≤1000px) & mobile: a single column — the active surface fills the
 * canvas; the Mushaf recedes rather than being squeezed to a sliver.
 */
export function WorkspaceCanvas({ mode, companion }: { mode: ShellMode; companion?: ReactNode }) {
  const isCompact = useBand() !== "wide";
  // Web design: the panel can widen over the whole canvas (features/shell/room.tsx).
  useRoomReset(mode);
  const [wide] = useRoomWide();
  const web = useWebDesign();

  const panel =
    mode === "search" ? <ConcordancePanel /> : mode === "studio" ? <OnlineOnly><StudioPanel /></OnlineOnly> : null;
  const kind = companion ? " qb-companion-canvas" : "";

  if (isCompact) {
    return <div className={`qb-workspace-canvas is-single${kind}`}>{companion ?? panel ?? <MushafStage />}</div>;
  }

  // "The mushaf is the room": when a panel is summoned beside it, the reader
  // settles back (scale + dim) so the panel reads as layered above it.
  const panelOpen = mode === "search" || mode === "studio";

  // One tree for every page beside the Mushaf (reading, search, studio and the
  // companions): each slot keeps its place, so moving between them swaps the
  // panel and never remounts the Mushaf.
  return (
    <div className={`qb-workspace-canvas${kind}${panelOpen ? " has-panel" : ""}${(panelOpen || companion) && wide ? " is-wide" : ""}`}>
      {/* Every panel opens on the same side — inline-start (the right in RTL),
          next to the rail that summoned it; the mushaf keeps the rest. */}
      {mode === "search" ? <ConcordancePanel /> : null}
      {mode === "studio" ? (
        <OnlineOnly>
          <StudioPanel />
        </OnlineOnly>
      ) : null}
      {companion ? <div className="qb-companion-panel">{companion}</div> : null}
      {/* Web design: the study panel's column — the «تحديد» bar portals here
          (tools/selection-bar.tsx). Empty, it takes no room; filled, the page
          re-fits beside it as it does beside the search panel. Like every
          panel, it opens on the reading-start side. */}
      {web && mode === "reading" ? <div id={STUDY_SLOT_ID} className="qb-study-slot" /> : null}
      <MushafStage />
    </div>
  );
}

/** Where the web design's study panel mounts (features/shell/workspace-canvas.tsx). */
export const STUDY_SLOT_ID = "qb-study-slot";
