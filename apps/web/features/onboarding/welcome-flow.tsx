"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { AUTH_ENABLED } from "@/lib/config";

import { finishOnboarding, identityApi, sanitizeNextPath } from "@/features/auth/identity-flow";

/**
 * `/welcome`: a new account's first sign-in used to stop here on three cards
 * about the interface. They described features that have since changed, and the
 * reader learns more from the screen they were headed to, so there is no screen
 * any more: the account is marked onboarded, guest data is merged, and the
 * reader goes on (routeAfterAuth does the same without passing here; this route
 * stays for links and sign-ins already on their way to it).
 */
export function WelcomeFlow() {
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => sanitizeNextPath(searchParams.get("next")), [searchParams]);

  useEffect(() => {
    if (!AUTH_ENABLED) {
      window.location.assign("/");
      return;
    }
    let active = true;
    async function finish() {
      try {
        const session = await identityApi.getAuthSession({ suppressAuthRedirect: true });
        if (!active) return;
        if (!session.enabled) {
          window.location.assign("/");
          return;
        }
        if (!session.authenticated || !session.user) {
          window.location.assign(`/login?next=${encodeURIComponent("/welcome")}`);
          return;
        }
        if (!session.user.onboarded) await finishOnboarding();
      } catch {
        // Never trap the reader here.
      }
      if (active) window.location.assign(nextPath);
    }
    void finish();
    return () => {
      active = false;
    };
  }, [nextPath]);

  return <div className="qb-welcome" />;
}
