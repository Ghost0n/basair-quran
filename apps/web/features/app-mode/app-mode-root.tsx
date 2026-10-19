"use client";

import { useEffect, useState, type ReactNode } from "react";

import { APP_MODE } from "@/lib/app-mode/config";
import { installFetchRouter } from "@/lib/app-mode/fetch-router";
import { bootApp } from "@/lib/app-mode/boot";
import { startAccountSync } from "@/lib/app-mode/sync";

import { Onboarding } from "./onboarding";

// Before any screen fetches: /api goes to the device (see lib/app-mode/fetch-router.ts).
if (APP_MODE && typeof window !== "undefined") installFetchRouter();

export const ONBOARDED_KEY = "qb.onboarded";

/**
 * The standalone app's front door: the first launch asks for a language
 * (onboarding, in English), then the app opens. On the web it renders its
 * children unchanged.
 */
export function AppModeRoot({ children }: { children: ReactNode }) {
  if (!APP_MODE) return <>{children}</>;
  return <AppModeGate>{children}</AppModeGate>;
}

/**
 * Whether this run of the app has started (and, once known, whether the
 * reader is onboarded). Module-level: a language change remounts the whole
 * tree under the new language (lib/i18n/provider.tsx), and that must not
 * replay the launch — it used to send the reader back to Home from Settings.
 */
let launched: { onboarded: boolean } | null = null;

function AppModeGate({ children }: { children: ReactNode }) {
  const [onboarded, setOnboarded] = useState<boolean | null>(launched?.onboarded ?? null);

  useEffect(() => {
    if (launched) return;
    // A launch always opens on Home, never on the screen left last (a webview
    // restored by the system would otherwise reload its last URL).
    if (window.location.search) window.history.replaceState(null, "", "/");
    let known = false;
    try {
      known = window.localStorage.getItem(ONBOARDED_KEY) === "1";
    } catch {
      /* storage unavailable: treat as a first launch */
    }
    launched = { onboarded: known };
    setOnboarded(known);
    // The cold start, behind the native splash (lib/app-mode/boot.ts).
    bootApp({ onboarded: known });
  }, []);

  useEffect(() => {
    if (onboarded) startAccountSync();
  }, [onboarded]);

  if (onboarded === null) return null;
  if (!onboarded) {
    return (
      <Onboarding
        onDone={() => {
          try {
            window.localStorage.setItem(ONBOARDED_KEY, "1");
          } catch {
            /* the choice still applies for this session */
          }
          launched = { onboarded: true };
          setOnboarded(true);
        }}
      />
    );
  }
  return <>{children}</>;
}
