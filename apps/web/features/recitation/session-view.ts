"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import { useShellMode } from "@/features/shell/mode-context";

import { useRecitation } from "./recitation-context";

/**
 * What a recitation session shows on a phone (phone-player.css):
 *
 *  - the CLEAR view (reader, not revealed): only the page and the full player
 *    at the bottom; the reader bar and the tab bar step away;
 *  - REVEALED: a tap on the page shrinks the player into a capsule under the
 *    status bar and brings the tab bar back. Another tap clears it again.
 *
 * A session lasts from play until the player is closed: pausing changes
 * nothing on screen. A session opens on the clear view when it starts in the
 * reader; on any other screen (and back in the reader after leaving it) the
 * capsule shows. A single verse played on its own (a search result's ▶,
 * `playVerseOnce`) opens no session. The state is a class on <html> so the
 * shell, the reader and the player react without threading props.
 */
let revealed = false;
const listeners = new Set<() => void>();

export function setRevealed(value: boolean): void {
  if (revealed === value) return;
  revealed = value;
  for (const listener of listeners) listener();
}

export function toggleRevealed(): void {
  setRevealed(!revealed);
}

export function useRevealed(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => revealed,
    () => false,
  );
}

/** Keeps `<html class="qb-reciting qb-recite-revealed">` in step with the session. */
export function RecitationSessionAttributes() {
  const recitation = useRecitation();
  // One verse heard on its own (a search result's ▶) isn't a session: no
  // capsule, nothing moves; its row shows that it plays.
  const active = recitation.active && !recitation.range?.once;
  const { mode } = useShellMode();
  const shown = useRevealed();
  const wasActive = useRef(false);

  useEffect(() => {
    // A new session in the reader opens on the clear page; elsewhere, the capsule.
    if (active && !wasActive.current) setRevealed(mode !== "reading");
    if (!active) setRevealed(false);
    wasActive.current = active;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    // Leaving the reader keeps the bars the user just used.
    if (active && mode !== "reading") setRevealed(true);
  }, [active, mode]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("qb-reciting", active);
    root.classList.toggle("qb-recite-revealed", active && shown);
    return () => {
      root.classList.remove("qb-reciting", "qb-recite-revealed");
    };
  }, [active, shown]);

  return null;
}
