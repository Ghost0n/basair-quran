"use client";

import { useEffect, useState, type ReactNode } from "react";

import { APP_MODE } from "@/lib/app-mode/config";
import { installFetchRouter } from "@/lib/app-mode/fetch-router";
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

function AppModeGate({ children }: { children: ReactNode }) {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setOnboarded(window.localStorage.getItem(ONBOARDED_KEY) === "1");
    } catch {
      setOnboarded(false);
    }
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
          setOnboarded(true);
        }}
      />
    );
  }
  return <>{children}</>;
}
