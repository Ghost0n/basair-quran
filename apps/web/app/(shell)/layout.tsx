import { Suspense, type ReactNode } from "react";
import Script from "next/script";

import { YamliInit } from "@/components/yamli-init";
import { AuthTopbar } from "@/features/auth/auth-topbar";
import { Shell } from "@/features/shell/shell";

const yamliEnabled = process.env.NEXT_PUBLIC_ENABLE_YAMLI !== "0";

// useShellMode reads from useSearchParams, which forces client routing.
export const dynamic = "force-dynamic";

/**
 * Layout for the workspace shell — wraps every route in the (shell) group
 * with WorkspaceProvider, LeftRail, TopBar, and CommandBar.
 *
 * /login and /research live outside this group so they don't get the
 * chrome (Phase 4 will fold /research's content into the Studio panel).
 */
export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* qb-shell-root caps the workspace at the viewport height so the app
          feels stable: the chrome (rail, top bar, footer) stays put and each
          screen scrolls inside its own region instead of growing the whole
          document. It also absorbs the optional auth strip above the frame. */}
      <div className="qb-shell-root">
        <AuthTopbar />
        <Suspense fallback={null}>
          <Shell>{children}</Shell>
        </Suspense>
      </div>
      {yamliEnabled ? <Script src="https://api.yamli.com/js/yamli_api.js" strategy="afterInteractive" /> : null}
      {yamliEnabled ? <YamliInit targetId="searchInput" /> : null}
    </>
  );
}
