"use client";

import { LocaleAccountSync } from "./locale-account-sync";
import { useEffect, useLayoutEffect, type ReactNode } from "react";

import "./shell.css";
import "./phone-ergonomics.css";

import { installGlobalErrorHooks } from "@/lib/error-report";
import { closeExclusiveOverlay } from "@/lib/exclusive-overlay";
import { settleReaderLoads } from "@/features/reading/reader-entry";
import { resetReaderTool } from "@/features/reading/tools/use-reader-tool";

import { MergeToast } from "@/features/identity/merge-toast";
import { MushafProvider } from "@/features/reading/mushaf-context";
import { SaveAyahProvider } from "@/features/themes/save-ayah-context";
import { RecitationProvider } from "@/features/recitation/recitation-context";
import { PhonePlayer } from "@/features/recitation/phone-player";
import { RecitationBar } from "@/features/recitation/recitation-bar";
import { RecitationSessionAttributes } from "@/features/recitation/session-view";
import { AuthSessionProvider } from "@/lib/auth-session-context";
import { PreferencesProvider } from "@/lib/preferences-context";
import { usePhoneLayout } from "@/lib/use-phone-layout";

import { EdgeSwipeBack } from "./edge-swipe-back";
import { LeftRail } from "./left-rail";
import { MobileTabBar } from "./mobile-tab-bar";
import { useShellMode } from "./mode-context";
import { ShortcutsModal } from "./shortcuts-modal";
import { ThemeSweep } from "./theme-sweep";
import { TopBar } from "./top-bar";
import { WorkspaceProvider } from "./workspace-context";

/**
 * Shell — the persistent chrome around every workspace screen.
 *
 * PreferencesProvider is outermost so the numerals helper and every
 * surface can read account defaults + session tweaks. MushafProvider
 * wraps WorkspaceProvider because useSearchWorkspace delegates its
 * reader to useMushaf.
 */
/** `<html data-shell-mode>` — lets the shell CSS adapt to the page (e.g. which
 *  pages scroll under the floating tab bar). */
function ShellModeAttribute() {
  const { mode } = useShellMode();
  // Before paint: a screen's own layout (which element scrolls, what floats)
  // is in place as soon as it shows.
  useLayoutEffect(() => {
    document.documentElement.dataset.shellMode = mode;
  }, [mode]);
  useEffect(() => {
    // Leaving the reader: it reopens in «قراءة», and no menu or sheet is left open.
    if (mode !== "reading") {
      resetReaderTool();
      // Pages loaded from here on are a way into the reader (reader-entry.ts).
      settleReaderLoads();
    }
    closeExclusiveOverlay();
  }, [mode]);
  return null;
}

export function Shell({ children }: { children: ReactNode }) {
  // Phones, upright or on their side, get the session player (player / capsule); larger screens the media bar.
  const phone = usePhoneLayout();
  // Install the Sentry-shaped global error capture (no-op unless the env flag is on).
  useEffect(() => {
    installGlobalErrorHooks();
  }, []);

  return (
    <AuthSessionProvider>
    <PreferencesProvider>
      <MushafProvider>
        <RecitationProvider>
          <WorkspaceProvider>
          <SaveAyahProvider>
            <div className="qb-frame">
              <LeftRail />
              <div className="qb-main">
                <TopBar />
                <div className="qb-canvas">{children}</div>
                {phone ? null : <RecitationBar />}
              </div>
              <MobileTabBar />
              {phone ? <PhonePlayer /> : null}
            </div>
            <RecitationSessionAttributes />
            <EdgeSwipeBack />
            <ShellModeAttribute />
            <ShortcutsModal />
            <LocaleAccountSync />
            <MergeToast />
            <ThemeSweep />
          </SaveAyahProvider>
          </WorkspaceProvider>
        </RecitationProvider>
      </MushafProvider>
    </PreferencesProvider>
    </AuthSessionProvider>
  );
}
