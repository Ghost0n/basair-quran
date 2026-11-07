import type { ReactNode } from "react";

import { ShellLayout } from "@/features/shell/shell-layout";

// useShellMode reads from useSearchParams, which forces client routing.
export const dynamic = "force-dynamic";

/**
 * Layout for the workspace shell (see features/shell/shell-layout.tsx).
 *
 * /login and /research live outside this group so they don't get the
 * chrome (Phase 4 will fold /research's content into the Studio panel).
 */
export default function Layout({ children }: { children: ReactNode }) {
  return <ShellLayout>{children}</ShellLayout>;
}
