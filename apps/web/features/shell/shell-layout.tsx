import { Suspense, type ReactNode } from "react";

import { ShellGate } from "@/features/identity/shell-gate";
import { Shell } from "@/features/shell/shell";

/**
 * The workspace shell around every route in the (shell) group: WorkspaceProvider,
 * LeftRail, TopBar and CommandBar. Rendered by app/(shell)/layout.tsx (web) and
 * app/(shell)/layout.app.tsx (the standalone app's static export).
 */
export function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* qb-shell-root caps the workspace at the viewport height so the app
          feels stable: the chrome (rail, top bar, footer) stays put and each
          screen scrolls inside its own region instead of growing the whole
          document. (Sign-out now lives in the account menu on the rail.) */}
      <Suspense fallback={null}>
        <ShellGate>
          <div className="qb-shell-root">
            <Shell>{children}</Shell>
          </div>
        </ShellGate>
      </Suspense>
    </>
  );
}
