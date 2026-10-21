"use client";

import { useEffect, useSyncExternalStore } from "react";

import { Icon } from "@/components/icon";
import { t } from "@/lib/i18n";

/**
 * "The Mushaf is the room" (web design): a panel opens beside the Mushaf and
 * can widen to the whole canvas, hiding the Mushaf until it is brought back.
 * One flag for the shell, reset whenever the page changes.
 */
let wide = false;
let page: string | null = null;
const listeners = new Set<() => void>();

export function getRoomWide(): boolean {
  return wide;
}

export function setRoomWide(next: boolean): void {
  if (wide === next) return;
  wide = next;
  for (const listener of listeners) listener();
}

/** A new page starts with the Mushaf shown beside its panel. */
export function resetRoomFor(mode: string): void {
  if (page === mode) return;
  page = mode;
  setRoomWide(false);
}

export function useRoomWide(): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getRoomWide,
    () => false,
  );
  return [value, setRoomWide];
}

/** Keeps the flag in step with the page (mount in the canvas). */
export function useRoomReset(mode: string): void {
  useEffect(() => {
    resetRoomFor(mode);
  }, [mode]);
}

/** The panel-header button: widen the panel, or bring the Mushaf back. */
export function RoomWideToggle() {
  const [isWide, setWide] = useRoomWide();
  const label = isWide ? t("أظهر المصحف بجانب اللوحة") : t("وسّع اللوحة");
  return (
    <button type="button" className="qb-icon-btn qb-room-toggle" onClick={() => setWide(!isWide)} title={label} aria-label={label} aria-pressed={isWide}>
      <Icon name={isWide ? "book" : "expand"} size={16} />
    </button>
  );
}
