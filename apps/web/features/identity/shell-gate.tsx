"use client";

import { useEffect, useState, type ReactNode } from "react";

import { AUTH_ENABLED } from "@/lib/config";
import { continueAsGuest, hasChosenGuest, identityApi } from "@/features/auth/identity-flow";

import { Landing } from "./landing";

type Decision = "loading" | "landing" | "enter";

/**
 * ShellGate — the app's front door. When auth is enabled and the visitor is
 * neither signed in nor has chosen guest browsing, it shows the Landing page
 * instead of the workspace. Once they sign in or pick "continue as guest",
 * the workspace renders. With auth disabled it's a passthrough (legacy).
 */
export function ShellGate({ children }: { children: ReactNode }) {
  const [decision, setDecision] = useState<Decision>(AUTH_ENABLED ? "loading" : "enter");

  useEffect(() => {
    if (!AUTH_ENABLED) return;
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
  }, []);

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
