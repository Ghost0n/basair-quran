"use client";

import type { ReactNode } from "react";

import "./shell.css";

import { OnboardingGate } from "@/features/onboarding/onboarding-screen";
import { MushafProvider } from "@/features/reading/mushaf-context";
import { RecitationProvider } from "@/features/recitation/recitation-context";
import { PreferencesProvider } from "@/lib/preferences-context";

import { LeftRail } from "./left-rail";
import { MobileTabBar } from "./mobile-tab-bar";
import { ShortcutsModal } from "./shortcuts-modal";
import { TopBar } from "./top-bar";
import { TweaksPanel } from "./tweaks-panel";
import { WorkspaceProvider } from "./workspace-context";

/**
 * Shell — the persistent chrome around every workspace screen.
 *
 * PreferencesProvider is outermost so the numerals helper and every
 * surface can read account defaults + session tweaks. MushafProvider
 * wraps WorkspaceProvider because useSearchWorkspace delegates its
 * reader to useMushaf.
 */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <PreferencesProvider>
      <MushafProvider>
        <RecitationProvider>
          <WorkspaceProvider>
            <div className="qb-frame">
              <LeftRail />
              <div className="qb-main">
                <TopBar />
                <div className="qb-canvas">{children}</div>
              </div>
              <TweaksPanel />
              <MobileTabBar />
            </div>
            <ShortcutsModal />
            <OnboardingGate />
          </WorkspaceProvider>
        </RecitationProvider>
      </MushafProvider>
    </PreferencesProvider>
  );
}
