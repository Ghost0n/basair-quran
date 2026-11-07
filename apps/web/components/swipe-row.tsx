"use client";

import "./swipe-row.css";

import { useEffect, useRef, type ReactNode } from "react";

import { Icon } from "@/components/icon";
import { isBackEdgeTouch } from "@/features/shell/edge-swipe-back";

import { t } from "@/lib/i18n";

/** Width of the revealed delete button (px). */
const ACTION = 88;
/** Past this the row stays open on release. */
const OPEN_AT = ACTION / 2;

/** One row open at a time: opening another closes it. */
let closeOpen: (() => void) | null = null;

/**
 * Swipe a saved item aside to delete it, as in iOS lists: the row slides
 * toward the side the text starts from and uncovers a red «حذف» button at its
 * end. Nothing is deleted by the swipe itself — it takes that second,
 * deliberate tap on the button — and a tap anywhere else, or opening another
 * row, slides it back. Touch only: mouse and keyboard keep the row's own
 * delete button (CSS hides it on touch screens inside a SwipeRow).
 */
export function SwipeRow({
  children,
  onDelete,
  label,
  className = "",
}: {
  children: ReactNode;
  onDelete: () => void;
  /** The delete button's text (default «حذف»). */
  label?: string;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  useEffect(() => {
    const root = rootRef.current;
    const content = contentRef.current;
    if (!root || !content) return;
    let start: { x: number; y: number; base: number } | null = null;
    let axis: "x" | "y" | null = null;
    let offset = 0;
    let open = false;
    // RTL: the row slides right (towards the start), the button sits on the left.
    const sign = () => (getComputedStyle(root).direction === "rtl" ? 1 : -1);

    // The button grows in the space the row uncovers (--swipe), so it never
    // shows through the translucent glass rows.
    const place = (value: number, animate: boolean) => {
      offset = value;
      root.classList.toggle("is-settling", animate);
      content.style.transform = value ? `translateX(${value * sign()}px)` : "";
      root.style.setProperty("--swipe", `${value}px`);
      root.classList.toggle("is-open", value > 0);
    };
    const close = () => {
      open = false;
      place(0, true);
      if (closeOpen === close) closeOpen = null;
    };

    function onStart(event: TouchEvent) {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      // The screen's back edge belongs to the back swipe.
      if (!open && isBackEdgeTouch(touch.clientX)) {
        start = null;
        return;
      }
      start = { x: touch.clientX, y: touch.clientY, base: open ? ACTION : 0 };
      axis = null;
    }
    function onMove(event: TouchEvent) {
      if (!start) return;
      const touch = event.touches[0];
      const dx = (touch.clientX - start.x) * sign();
      const dy = touch.clientY - start.y;
      if (axis === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        // Sideways, and (for a closed row) towards opening it.
        axis = Math.abs(dx) > Math.abs(dy) * 1.3 && (open || dx > 0) ? "x" : "y";
        if (axis === "x" && closeOpen && closeOpen !== close) closeOpen();
      }
      if (axis !== "x") return;
      event.preventDefault();
      const next = start.base + dx;
      // Past the button the row resists (it never deletes on its own).
      const resisted = next > ACTION ? ACTION + (next - ACTION) * 0.25 : Math.max(0, next);
      place(resisted, false);
    }
    function onEnd() {
      if (!start) return;
      const swiped = axis === "x";
      start = null;
      if (!swiped) return;
      open = offset > OPEN_AT;
      place(open ? ACTION : 0, true);
      if (open) closeOpen = close;
      else if (closeOpen === close) closeOpen = null;
    }
    // While open, a tap on the row only closes it (it doesn't also open the item).
    function onClickCapture(event: MouseEvent) {
      if (!open) return;
      if ((event.target as Element).closest(".qb-swipe-delete")) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    }

    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchmove", onMove, { passive: false });
    root.addEventListener("touchend", onEnd);
    root.addEventListener("touchcancel", onEnd);
    root.addEventListener("click", onClickCapture, true);
    return () => {
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchmove", onMove);
      root.removeEventListener("touchend", onEnd);
      root.removeEventListener("touchcancel", onEnd);
      root.removeEventListener("click", onClickCapture, true);
      if (closeOpen === close) closeOpen = null;
    };
  }, []);

  return (
    <div ref={rootRef} className={`qb-swipe-row ${className}`.trim()}>
      <button
        type="button"
        className="qb-swipe-delete"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => {
          rootRef.current?.classList.add("is-removing");
          window.setTimeout(() => onDeleteRef.current(), 180);
        }}
      >
        <Icon name="trash" size={18} />
        <span>{label ?? t("حذف")}</span>
      </button>
      <div ref={contentRef} className="qb-swipe-content">
        {children}
      </div>
    </div>
  );
}
