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
      <AuthTopbar />
      <Suspense fallback={null}>
        <Shell>{children}</Shell>
      </Suspense>
      {yamliEnabled ? <Script src="https://api.yamli.com/js/yamli_api.js" strategy="afterInteractive" /> : null}
      {yamliEnabled ? <YamliInit targetId="searchInput" /> : null}
    </>
  );
}
