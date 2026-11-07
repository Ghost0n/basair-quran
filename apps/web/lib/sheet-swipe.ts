/**
 * Drag a bottom sheet down to close it, as on iOS.
 *
 * The panel follows the finger (the backdrop fades with it); let go past a
 * third of its height, or with a downward flick, and it slides away and
 * closes, else it springs back. A drag only starts where it can't be a
 * scroll: on the grip and header, or anywhere once the sheet's content is
 * scrolled to its top. Touch only — a mouse keeps the backdrop and Escape.
 *
 * Returns a cleanup function.
 */
const START_PX = 6;
const CLOSE_RATIO = 1 / 3;
const FLICK_PX_PER_MS = 0.55;
const SPRING = "transform 320ms cubic-bezier(0.22, 1.2, 0.36, 1), opacity 320ms ease";
const AWAY = "transform 220ms cubic-bezier(0.4, 0, 1, 1), opacity 220ms ease";

/** The nearest scrolled-down ancestor between the target and the panel (a drag there scrolls instead). */
function scrolledAncestor(target: Element | null, panel: HTMLElement): HTMLElement | null {
  for (let node = target as HTMLElement | null; node && node !== panel; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight + 1 && node.scrollTop > 0) {
      const overflow = getComputedStyle(node).overflowY;
      if (overflow === "auto" || overflow === "scroll") return node;
    }
  }
  return null;
}

export function attachSheetSwipe(panel: HTMLElement, onClose: () => void): () => void {
  const backdrop = panel.parentElement?.querySelector<HTMLElement>(":scope > .backdrop") ?? null;
  let startX = 0;
  let startY = 0;
  let startT = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let state: "idle" | "pending" | "drag" | "scroll" = "idle";

  const set = (dy: number, transition: string) => {
    // The entry animation (fill: both) would otherwise hold the transform.
    panel.style.animation = "none";
    if (backdrop) backdrop.style.animation = "none";
    panel.style.transition = transition;
    panel.style.transform = dy ? `translateY(${dy}px)` : "";
    if (backdrop) {
      backdrop.style.transition = transition.replace(/transform[^,]*,\s*/, "");
      backdrop.style.opacity = dy ? String(Math.max(0, 1 - dy / Math.max(1, panel.offsetHeight))) : "";
    }
  };

  function onStart(event: TouchEvent) {
    if (event.touches.length !== 1) return;
    const target = event.target as Element | null;
    // Fields, sliders and horizontal tracks keep their own gestures.
    if (target?.closest("input, textarea, select, [role=slider], .qb-pseek, [data-no-sheet-swipe]")) return;
    if (scrolledAncestor(target, panel)) return;
    const touch = event.touches[0];
    startX = touch.clientX;
    startY = lastY = touch.clientY;
    startT = lastT = performance.now();
    velocity = 0;
    state = "pending";
  }

  function onMove(event: TouchEvent) {
    if (state === "idle" || state === "scroll") return;
    const touch = event.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (state === "pending") {
      if (Math.abs(dx) < START_PX && Math.abs(dy) < START_PX) return;
      // Only a downward, mostly vertical drag moves the sheet.
      state = dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.2 ? "drag" : "scroll";
      if (state === "scroll") return;
    }
    event.preventDefault();
    const now = performance.now();
    velocity = (touch.clientY - lastY) / Math.max(1, now - lastT);
    lastY = touch.clientY;
    lastT = now;
    set(Math.max(0, dy), "none");
  }

  function onEnd() {
    if (state !== "drag") {
      state = "idle";
      return;
    }
    state = "idle";
    const dy = Math.max(0, lastY - startY);
    const fast = velocity > FLICK_PX_PER_MS && performance.now() - startT < 900;
    if (dy > panel.offsetHeight * CLOSE_RATIO || (fast && dy > 24)) {
      set(panel.offsetHeight + 40, AWAY);
      window.setTimeout(onClose, 200);
    } else {
      set(0, SPRING);
    }
  }

  panel.addEventListener("touchstart", onStart, { passive: true });
  panel.addEventListener("touchmove", onMove, { passive: false });
  panel.addEventListener("touchend", onEnd);
  panel.addEventListener("touchcancel", onEnd);
  return () => {
    panel.removeEventListener("touchstart", onStart);
    panel.removeEventListener("touchmove", onMove);
    panel.removeEventListener("touchend", onEnd);
    panel.removeEventListener("touchcancel", onEnd);
  };
}
