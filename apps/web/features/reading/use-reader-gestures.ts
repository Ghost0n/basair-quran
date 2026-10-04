"use client";

import { useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

// A swipe must travel this far horizontally, clearly more than vertically, and
// quickly — so a vertical scroll or a slow drag never turns the page.
const SWIPE_MIN_PX = 56;
const SWIPE_DOMINANCE = 1.6;
const SWIPE_MAX_MS = 700;
// A tap barely moves and is short.
const TAP_MAX_PX = 10;
const TAP_MAX_MS = 350;

// Taps on these never toggle the chrome: they have their own action.
const INTERACTIVE = "a, button, input, select, textarea, [role=button], [role=dialog], .qb-glyph-word, .qb-ayah-tok, .qb-morph-pop";

type Handlers = {
  swipeEnabled: boolean;
  onNext: () => void;
  onPrev: () => void;
  /** Tap on the page background (touch; mouse too when `mouseTaps`). */
  onTap: () => void;
  /** Phone layouts: a mouse click on the empty page toggles focus mode too. */
  mouseTaps?: boolean;
};

/**
 * Touch gestures for the reader surface: horizontal swipe turns the page and a
 * tap on an empty part of the page toggles the reading chrome (focus mode).
 *
 * RTL book semantics, like a printed mushaf: the next page lies to the LEFT, so
 * dragging the page to the right (finger moving left → right) goes forward.
 * Mouse pointers are ignored — desktop uses the arrows, PageUp/PageDown and F.
 */
export function useReaderGestures({ swipeEnabled, onNext, onPrev, onTap, mouseTaps = false }: Handlers) {
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  // A touch tap is only *recognised* on pointerup; the toggle runs on the click
  // that follows, whose target the browser fixed before any chrome moves — so
  // a reappearing bar can never receive a ghost click.
  const pendingTap = useRef(0);

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" || !event.isPrimary) return;
    start.current = { x: event.clientX, y: event.clientY, t: performance.now(), id: event.pointerId };
  }

  function onPointerUp(event: ReactPointerEvent<HTMLElement>) {
    const origin = start.current;
    start.current = null;
    if (!origin || origin.id !== event.pointerId) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    const dt = performance.now() - origin.t;

    if (
      swipeEnabled &&
      dt <= SWIPE_MAX_MS &&
      Math.abs(dx) >= SWIPE_MIN_PX &&
      Math.abs(dx) >= Math.abs(dy) * SWIPE_DOMINANCE
    ) {
      if (dx > 0) onNext();
      else onPrev();
      return;
    }

    if (dt <= TAP_MAX_MS && Math.abs(dx) <= TAP_MAX_PX && Math.abs(dy) <= TAP_MAX_PX) {
      pendingTap.current = performance.now();
    }
  }

  function onClick(event: ReactMouseEvent<HTMLElement>) {
    const tapped = pendingTap.current && performance.now() - pendingTap.current < 800;
    pendingTap.current = 0;
    // detail > 0: a real click (not a keyboard-triggered one).
    if (!tapped && !(mouseTaps && event.detail > 0)) return;
    const target = event.target;
    if (target instanceof Element && target.closest(INTERACTIVE)) return;
    onTap();
  }

  function onPointerCancel() {
    start.current = null;
  }

  return { onPointerDown, onPointerUp, onPointerCancel, onClick };
}
