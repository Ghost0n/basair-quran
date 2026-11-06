"use client";

import { useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import { isBackEdgeTouch } from "@/features/shell/edge-swipe-back";

import { haptic } from "@/lib/haptics";

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
  /**
   * The page follows the finger (photo-style): `onDrag` gets the horizontal
   * offset while a horizontal drag is under way, `onDragEnd` whether it
   * turns the page ("next" / "prev") or springs back (null). Without it a
   * swipe turns the page on release.
   */
  drag?: {
    onDrag: (dx: number) => void;
    onDragEnd: (turn: "next" | "prev" | null) => void;
  };
};

// A drag turns the page past a quarter of the screen, or on a quick flick.
const DRAG_START_PX = 8;
const DRAG_COMMIT_RATIO = 0.25;

/**
 * Touch gestures for the reader surface: horizontal swipe turns the page and a
 * tap on an empty part of the page toggles the reading chrome (focus mode).
 *
 * RTL book semantics, like a printed mushaf: the next page lies to the LEFT, so
 * dragging the page to the right (finger moving left → right) goes forward.
 * Mouse pointers are ignored — desktop uses the arrows, PageUp/PageDown and F.
 */
export function useReaderGestures({ swipeEnabled, onNext, onPrev, onTap, mouseTaps = false, drag }: Handlers) {
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  // "drag" once the finger has clearly moved sideways, "scroll" once it moved
  // up or down (the drag then never starts for this touch).
  const axis = useRef<"drag" | "scroll" | null>(null);
  // A touch tap is only *recognised* on pointerup; the toggle runs on the click
  // that follows, whose target the browser fixed before any chrome moves — so
  // a reappearing bar can never receive a ghost click.
  const pendingTap = useRef(0);

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" || !event.isPrimary) return;
    // A touch on the screen's back edge belongs to the back swipe (edge-swipe-back.tsx).
    if (isBackEdgeTouch(event.clientX)) {
      start.current = null;
      return;
    }
    start.current = { x: event.clientX, y: event.clientY, t: performance.now(), id: event.pointerId };
    axis.current = null;
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const origin = start.current;
    if (!drag || !swipeEnabled || !origin || origin.id !== event.pointerId || axis.current === "scroll") return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (axis.current === null) {
      if (Math.abs(dx) < DRAG_START_PX && Math.abs(dy) < DRAG_START_PX) return;
      axis.current = Math.abs(dx) >= Math.abs(dy) * SWIPE_DOMINANCE ? "drag" : "scroll";
      if (axis.current === "scroll") return;
    }
    drag.onDrag(dx);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLElement>) {
    const origin = start.current;
    start.current = null;
    if (!origin || origin.id !== event.pointerId) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    const dt = performance.now() - origin.t;

    if (drag && axis.current === "drag") {
      axis.current = null;
      const width = window.innerWidth || 1;
      const flick = dt <= SWIPE_MAX_MS && Math.abs(dx) >= SWIPE_MIN_PX;
      const far = Math.abs(dx) >= width * DRAG_COMMIT_RATIO;
      // RTL book: dragging the page to the right brings the next page in.
      drag.onDragEnd(flick || far ? (dx > 0 ? "next" : "prev") : null);
      return;
    }

    if (
      swipeEnabled &&
      dt <= SWIPE_MAX_MS &&
      Math.abs(dx) >= SWIPE_MIN_PX &&
      Math.abs(dx) >= Math.abs(dy) * SWIPE_DOMINANCE
    ) {
      // A swipe that turns the page answers with a light tap.
      haptic("light");
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
    if (drag && axis.current === "drag") drag.onDragEnd(null);
    axis.current = null;
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClick };
}
