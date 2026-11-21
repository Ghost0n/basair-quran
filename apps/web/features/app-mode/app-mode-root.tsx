"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { APP_MODE } from "@/lib/app-mode/config";
import { installFetchRouter } from "@/lib/app-mode/fetch-router";
import { inAppPath, setAppNavigator } from "@/lib/app-mode/navigation";
import { bootApp } from "@/lib/app-mode/boot";
import { startAccountSync } from "@/lib/app-mode/sync";
import { API_BASE_URL, AUTH_ENABLED } from "@/lib/config";
import { installGuestData } from "@/lib/guest-data";

import { LaunchSplash } from "./launch-splash";
import { Onboarding } from "./onboarding";

// Before any screen fetches: /api goes to the device (see lib/app-mode/fetch-router.ts).
if (APP_MODE && typeof window !== "undefined") installFetchRouter();
// The web with accounts: a guest's own data stays in their browser (see lib/guest-data.ts).
else if (AUTH_ENABLED && typeof window !== "undefined") installGuestData(API_BASE_URL);

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
/** The launch splash plays once per run of the app (same reason). */
let splashDone = false;

function AppModeGate({ children }: { children: ReactNode }) {
  const [onboarded, setOnboarded] = useState<boolean | null>(launched?.onboarded ?? null);
  // In the exported page from the first paint: the native launch colour hands over to it.
  const [splash, setSplash] = useState(() => !splashDone);
  const endSplash = useCallback(() => {
    splashDone = true;
    setSplash(false);
  }, []);
  const router = useRouter();

  // A full page load of any page but Home lands on Home (lib/app-mode/navigation.ts):
  // same-origin links open with client navigation instead. Bubble phase, after
  // React's own handlers: a <Link> (or any handler) that already took the click is left alone.
  useEffect(() => {
    setAppNavigator((href) => router.push(href));
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const path = inAppPath(anchor.getAttribute("href") ?? "", window.location, {
        target: anchor.getAttribute("target"),
        download: anchor.hasAttribute("download"),
      });
      if (!path) return;
      event.preventDefault();
      router.push(path);
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      setAppNavigator(null);
    };
  }, [router]);

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

  const launchSplash = splash ? <LaunchSplash onGone={endSplash} /> : null;
  if (onboarded === null) return launchSplash;
  if (!onboarded) {
    return (
      <>
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
        {launchSplash}
      </>
    );
  }
  return (
    <>
      {children}
      {launchSplash}
    </>
  );
}
