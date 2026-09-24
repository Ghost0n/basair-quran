"use client";

import { useSyncExternalStore } from "react";

import { DEFAULT_READER_TOOL, isReaderToolId, type ReaderToolId } from "./registry";

/** The active reader tool — remembered per device, shared by bar and stage. */
const KEY = "qb.readerTool";
const listeners = new Set<() => void>();

function read(): ReaderToolId {
  try {
    const value = window.localStorage.getItem(KEY);
    return isReaderToolId(value) ? value : DEFAULT_READER_TOOL;
  } catch {
    return DEFAULT_READER_TOOL;
  }
}

export function setReaderTool(tool: ReaderToolId): void {
  try {
    window.localStorage.setItem(KEY, tool);
  } catch {
    /* private mode — the choice lasts until reload */
    memory = tool;
  }
  for (const listener of listeners) listener();
}

let memory: ReaderToolId | null = null;

export function useReaderTool(): ReaderToolId {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => memory ?? read(),
    () => DEFAULT_READER_TOOL,
  );
}
