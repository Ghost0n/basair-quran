"use client";

import { useEffect, useState, type ReactNode } from "react";

import { APP_MODE } from "@/lib/app-mode/config";
import { AUTH_ENABLED } from "@/lib/config";
import { continueAsGuest, hasChosenGuest, identityApi } from "@/features/auth/identity-flow";

import { Landing } from "./landing";

type Decision = "loading" | "landing" | "enter";

/**
 * ShellGate — the app's front door. When auth is enabled and the visitor is
 * neither signed in nor has chosen guest browsing, it shows the Landing page
 * instead of the workspace. Once they sign in or pick "continue as guest",
 * the workspace renders. With auth disabled it's a passthrough (legacy), and
 * so is the standalone app: it opens straight away, offline-first (onboarding
 * is its front door, and signing in is offered from the account menu).
 */
export function ShellGate({ children }: { children: ReactNode }) {
  const gated = AUTH_ENABLED && !APP_MODE;
  const [decision, setDecision] = useState<Decision>(gated ? "loading" : "enter");

  useEffect(() => {
    if (!gated) return;
    if (hasChosenGuest()) {
      setDecision("enter");
      return;
    }
    let cancelled = false;
    identityApi
      .getAuthSession({ suppressAuthRedirect: true })
      .then((session) => {
        if (!cancelled) setDecision(session.authenticated ? "enter" : "landing");
      })
      .catch(() => {
        // Offline / backend down — don't trap the visitor at the door.
        if (!cancelled) setDecision("enter");
      });
    return () => {
      cancelled = true;
    };
  }, [gated]);

  if (decision === "loading") {
    // A calm, empty page-bg while the session resolves (no jarring flash).
    return <div className="qb-auth" aria-hidden />;
  }

  if (decision === "landing") {
    return (
      <Landing
        onGuest={() => {
          continueAsGuest();
          setDecision("enter");
        }}
      />
    );
  }

  return <>{children}</>;
}
