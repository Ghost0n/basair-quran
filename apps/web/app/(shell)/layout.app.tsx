import type { ReactNode } from "react";

import { ShellLayout } from "@/features/shell/shell-layout";

/** The standalone app's shell layout: static (no server), the same shell. */
export default function Layout({ children }: { children: ReactNode }) {
  return <ShellLayout>{children}</ShellLayout>;
}
