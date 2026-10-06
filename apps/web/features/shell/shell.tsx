"use client";

import { LocaleAccountSync } from "./locale-account-sync";
import { useEffect, type ReactNode } from "react";

import "./shell.css";
import "./ux-prototype.css";

import { installGlobalErrorHooks } from "@/lib/error-report";

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
import { useUxPrototype } from "@/lib/ux-prototype";

import { LeftRail } from "./left-rail";
import { MobileTabBar } from "./mobile-tab-bar";
import { useShellMode } from "./mode-context";
import { ShortcutsModal } from "./shortcuts-modal";
import { StableTabBar } from "./stable-tab-bar";
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
  useEffect(() => {
    document.documentElement.dataset.shellMode = mode;
  }, [mode]);
  return null;
}

export function Shell({ children }: { children: ReactNode }) {
  // Phones, upright or on their side, get the session player (player / capsule); larger screens the media bar.
  const phone = usePhoneLayout();
  // The phone ergonomics prototype (lib/ux-prototype.ts) swaps the worlds coin for a fixed tab bar.
  const prototype = useUxPrototype();
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
              {prototype ? <StableTabBar /> : <MobileTabBar />}
              {phone ? <PhonePlayer /> : null}
            </div>
            <RecitationSessionAttributes />
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
