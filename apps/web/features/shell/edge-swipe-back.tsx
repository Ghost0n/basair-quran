"use client";

import { useEffect, useRef } from "react";

import { useGoBack, useShellMode, type ShellMode } from "./mode-context";

/** How close to the screen's edge a back swipe must start (px). */
export const BACK_EDGE_PX = 22;

/** Is this touch on the back edge (the side the interface reads from)? */
export function isBackEdgeTouch(clientX: number): boolean {
  if (typeof document === "undefined") return false;
  const rtl = document.documentElement.dir === "rtl";
  return rtl ? clientX >= window.innerWidth - BACK_EDGE_PX : clientX <= BACK_EDGE_PX;
}

const COMMIT_RATIO = 0.3;

/** Screens without the back swipe (their own back arrow stays). */
const NO_EDGE_SWIPE: readonly ShellMode[] = ["reading", "board", "document"];
const FLICK_PX_PER_MS = 0.5;

/**
 * Swipe from the screen's edge to go back, as on iPhone: from the right edge
 * in Arabic (and the other right-to-left languages), from the left in
 * left-to-right ones. The screen follows the finger over a dimmed backdrop;
 * let go past a third of the width (or flick) and it slides away and the
 * previous screen comes back (useGoBack), else it springs back. Touch only,
 * phones only, never over an open dialog, never on Home, the reader, a board
 * or a research being edited.
 */
export function EdgeSwipeBack() {
  const { canGoBack: anywhere, goBack } = useGoBack();
  const { mode } = useShellMode();
  // Not where a sideways drag already means something: the reader turns its
  // pages, the board pans, the research editor reorders and edits.
  const canGoBack = anywhere && !NO_EDGE_SWIPE.includes(mode);
  const stateRef = useRef({ canGoBack, goBack });
  stateRef.current = { canGoBack, goBack };

  useEffect(() => {
    const frame = () => document.querySelector<HTMLElement>(".qb-frame");
    let start: { x: number; y: number; t: number } | null = null;
    let claimed = false;
    let last = { x: 0, t: 0, v: 0 };
    let shade: HTMLDivElement | null = null;

    const direction = () => (document.documentElement.dir === "rtl" ? -1 : 1);
    const width = () => window.innerWidth || 1;

    function paint(offset: number, transition: string) {
      const el = frame();
      if (!el) return;
      el.style.transition = transition;
      el.style.transform = offset ? `translateX(${offset}px)` : "";
      el.style.boxShadow = offset ? "0 0 40px rgba(0, 0, 0, 0.45)" : "";
      if (shade) {
        shade.style.transition = transition.replace(/transform/g, "opacity");
        shade.style.opacity = String(Math.max(0, 0.5 * (1 - Math.abs(offset) / width())));
      }
    }

    function cleanup() {
      const el = frame();
      if (el) {
        el.style.transition = "";
        el.style.transform = "";
        el.style.boxShadow = "";
      }
      shade?.remove();
      shade = null;
      document.documentElement.classList.remove("qb-edge-swiping");
    }

    function onStart(event: TouchEvent) {
      start = null;
      claimed = false;
      if (event.touches.length !== 1 || !stateRef.current.canGoBack) return;
      if (!window.matchMedia("(max-width: 768px)").matches) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const touch = event.touches[0];
      if (!isBackEdgeTouch(touch.clientX)) return;
      start = { x: touch.clientX, y: touch.clientY, t: performance.now() };
      last = { x: touch.clientX, t: start.t, v: 0 };
    }

    function onMove(event: TouchEvent) {
      if (!start) return;
      const touch = event.touches[0];
      const dx = (touch.clientX - start.x) * direction();
      const dy = touch.clientY - start.y;
      if (!claimed) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        // Into the screen and mostly sideways: it's a back swipe.
        if (dx <= 0 || Math.abs(dy) > Math.abs(dx)) {
          start = null;
          return;
        }
        claimed = true;
        document.documentElement.classList.add("qb-edge-swiping");
        shade = document.createElement("div");
        shade.className = "qb-edge-shade";
        document.body.appendChild(shade);
      }
      event.preventDefault();
      const now = performance.now();
      last = { x: touch.clientX, t: now, v: ((touch.clientX - last.x) * direction()) / Math.max(1, now - last.t) };
      paint(Math.max(0, dx) * direction(), "none");
    }

    function onEnd() {
      if (!start || !claimed) {
        start = null;
        return;
      }
      const dx = (last.x - start.x) * direction();
      start = null;
      claimed = false;
      const commit = dx > width() * COMMIT_RATIO || (last.v > FLICK_PX_PER_MS && dx > 30);
      if (!commit) {
        paint(0, "transform 260ms cubic-bezier(0.22, 1.2, 0.36, 1)");
        window.setTimeout(cleanup, 270);
        return;
      }
      paint(width() * direction(), "transform 150ms cubic-bezier(0.4, 0, 1, 1)");
      // The frame is put back inside the navigation's own update, after the
      // view transition has captured the screen already slid away.
      window.setTimeout(() => stateRef.current.goBack({ beforeUpdate: cleanup }), 150);
    }

    document.addEventListener("touchstart", onStart, { passive: true, capture: true });
    document.addEventListener("touchmove", onMove, { passive: false, capture: true });
    document.addEventListener("touchend", onEnd, { capture: true });
    document.addEventListener("touchcancel", onEnd, { capture: true });
    return () => {
      document.removeEventListener("touchstart", onStart, { capture: true });
      document.removeEventListener("touchmove", onMove, { capture: true });
      document.removeEventListener("touchend", onEnd, { capture: true });
      document.removeEventListener("touchcancel", onEnd, { capture: true });
      cleanup();
    };
  }, []);

  return null;
}
