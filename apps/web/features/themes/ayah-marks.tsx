"use client";

import "./themes.css";

import { createContext, useContext, useSyncExternalStore } from "react";

import type { ThemeColor } from "@q-basair/shared";

/**
 * How the reader marks a saved ayah: the colour of its first theme (the
 * highlight) and how many themes it carries (a small multi-dot hint when > 1).
 * Provided once by the reading stage so every renderer (glyph page, ayah row,
 * simple reader) paints highlights without threading props through each layer.
 */
export type AyahMark = { color: ThemeColor | null; themes: number } | null;

const AyahMarksContext = createContext<(ayahId: number) => AyahMark>(() => null);

export const AyahMarksProvider = AyahMarksContext.Provider;

export function useAyahMarks(): (ayahId: number) => AyahMark {
  return useContext(AyahMarksContext);
}

/** Props for a highlighted (not selected) ayah span. */
export function highlightProps(mark: AyahMark): { className: string; "data-hl"?: ThemeColor } {
  return mark?.color ? { className: " qb-hl", "data-hl": mark.color } : { className: "" };
}

// --- «إظهار التظليل» — a per-device display toggle (default on) --------------

const SHOW_KEY = "qb.showHighlights";
const listeners = new Set<() => void>();

function readShow(): boolean {
  try {
    return window.localStorage.getItem(SHOW_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setShowHighlights(show: boolean): void {
  try {
    window.localStorage.setItem(SHOW_KEY, show ? "1" : "0");
  } catch {
    /* private mode — the toggle just won't persist */
  }
  for (const listener of listeners) listener();
}

export function useShowHighlights(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    readShow,
    () => true,
  );
}
