"use client";

import { useSyncExternalStore } from "react";

import { DEFAULT_READER_TOOL, type ReaderToolId } from "./registry";

/**
 * The active reader tool, shared by bar and stage. Not remembered: the reader
 * always opens in «قراءة», and leaving it (another screen, a relaunch) drops
 * back to «قراءة» (shell.tsx resets it).
 */
const listeners = new Set<() => void>();
let current: ReaderToolId = DEFAULT_READER_TOOL;

export function setReaderTool(tool: ReaderToolId): void {
  if (current === tool) return;
  current = tool;
  for (const listener of listeners) listener();
}

/** Back to the default tool («قراءة»). */
export function resetReaderTool(): void {
  setReaderTool(DEFAULT_READER_TOOL);
}

export function useReaderTool(): ReaderToolId {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => DEFAULT_READER_TOOL,
  );
}
