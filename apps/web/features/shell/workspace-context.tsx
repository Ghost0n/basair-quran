"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useSearchWorkspace } from "@/features/workspace/hooks/use-search-workspace";

type WorkspaceValue = ReturnType<typeof useSearchWorkspace>;

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

/**
 * Hosts the legacy useSearchWorkspace hook at the Shell level so the
 * CommandBar (in TopBar) and the SearchWorkspaceShell (in canvas) can
 * share input, suggestions, refs, and search callbacks.
 *
 * Phase 1: this is the bridge between the new chrome and the legacy
 * workspace hook. Phase 3 will replace useSearchWorkspace with a
 * Concordance-specific hook (useConcordance) and the bridge can shrink.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const value = useSearchWorkspace();
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within <WorkspaceProvider>");
  }
  return ctx;
}
