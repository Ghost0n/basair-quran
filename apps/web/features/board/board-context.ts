"use client";

import { createContext, useContext } from "react";

import type { NotebookItem, ThemeColor } from "@q-basair/shared";

/** What board nodes need from the screen, without threading it through node data. */
export type BoardContextValue = {
  themeColor: ThemeColor;
  itemFor: (nodeId: string) => NotebookItem | null;
  updateData: (nodeId: string, patch: Record<string, unknown>) => void;
  openInReader: (item: NotebookItem) => void;
  /** A shared (post) board: notes/headings render as text, nothing is editable. */
  readOnly?: boolean;
};

export const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoard(): BoardContextValue {
  const value = useContext(BoardContext);
  if (!value) throw new Error("useBoard must be used inside the theme board.");
  return value;
}
