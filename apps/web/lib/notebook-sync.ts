"use client";

import { useEffect, useRef } from "react";

import type { NotebookItem } from "@q-basair/shared";

/**
 * A tiny in-tab event bus for notebook (الدفتر) mutations, so the several
 * independent readers of the notebook stay in sync WITHOUT a shared store:
 *  • the reader's saved-ayah map (useSavedAyat), and
 *  • the library screen's list (useCompanions),
 * which mount separately and, in notebook mode, are on screen at the same time
 * (the library sits beside the Mushaf). Before this, saving an ayah in the
 * reader left the library list stale until it was remounted.
 *
 * Each mutation site emits the delta; every mounted reader applies it in place.
 * Emits are idempotent to apply (set/delete by id), so a site re-hearing its own
 * event is harmless.
 */
export type NotebookChange =
  | { kind: "added"; item: NotebookItem }
  | { kind: "removed"; itemId: number; ayahId?: number | null };

const EVENT = "qb:notebook-changed";

export function emitNotebookChange(change: NotebookChange): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<NotebookChange>(EVENT, { detail: change }));
}

/**
 * Subscribe to notebook changes for this component's lifetime. The handler is
 * kept in a ref so callers can pass an inline closure without re-subscribing on
 * every render, while always seeing the latest state.
 */
export function useNotebookSync(handler: (change: NotebookChange) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<NotebookChange>).detail;
      if (detail) ref.current(detail);
    };
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }, []);
}
