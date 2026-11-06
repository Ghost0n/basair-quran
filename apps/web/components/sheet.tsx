"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import "./sheet.web.css";

import { useBand } from "@/lib/bands";
import { sheetStack } from "@/lib/sheet-stack";
import { useDialog } from "@/lib/use-dialog";

type SheetProps = {
  label: string;
  onClose: () => void;
  children?: ReactNode;
  className?: string;
  size?: "auto" | "tall";
};

/** True where menus and confirmations open as bottom sheets: the phone band. */
export function usePhoneSheets(): boolean {
  return useBand() === "phone";
}

/** The sheet's markup: the reader sheets' `.qb-rsheet` structure (reading.css, sheet.web.css). */
export function SheetFrame({
  label,
  onClose,
  children,
  className = "",
  size = "auto",
  panelRef,
}: SheetProps & { panelRef: RefObject<HTMLDivElement | null> | null }) {
  const classes = ["qb-rsheet", "qb-sheet", size === "tall" ? "is-tall" : "", className].filter(Boolean).join(" ");
  return (
    <div className={classes} role="dialog" aria-modal="true" aria-label={label}>
      <div className="backdrop" onClick={onClose} aria-hidden="true" />
      <div className="panel" ref={panelRef ?? undefined} tabIndex={-1}>
        <div className="grip" aria-hidden="true" />
        <div className="head">
          <h2>{label}</h2>
        </div>
        <div className="body">{children}</div>
      </div>
    </div>
  );
}

/**
 * A bottom sheet on a phone: a menu or a confirmation rises from the bottom
 * edge. Escape, the focus trap and swipe-down to close come from useDialog;
 * Android's back button closes it through sheetStack.
 */
export function Sheet(props: SheetProps) {
  const panelRef = useDialog<HTMLDivElement>(props.onClose);
  const closeRef = useRef(props.onClose);
  closeRef.current = props.onClose;
  useEffect(() => sheetStack.push(() => closeRef.current()), []);
  if (typeof document === "undefined") return null;
  return createPortal(<SheetFrame {...props} panelRef={panelRef} />, document.body);
}
