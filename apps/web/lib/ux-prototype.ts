"use client";

import { useEffect, useState } from "react";

/**
 * The phone ergonomics prototype (`/prototype/mobile`, docs/mobile-ergonomics-prototype.md):
 * a per-device switch, off by default, that swaps the phone chrome for the
 * researched variant — a fixed five-tab bar, the reader's controls and the
 * search field in the thumb's reach, larger touch targets. Applied as
 * `<html data-ux="m2">` before first paint (app/layout.tsx) so the CSS can
 * follow without a flash; components read it with `useUxPrototype()`.
 */
export const UX_KEY = "qb.ux";
export const UX_PROTOTYPE = "m2";

const listeners = new Set<() => void>();

export function readUxPrototype(): boolean {
  try {
    return window.localStorage.getItem(UX_KEY) === UX_PROTOTYPE;
  } catch {
    return false;
  }
}

export function setUxPrototype(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(UX_KEY, UX_PROTOTYPE);
    else window.localStorage.removeItem(UX_KEY);
  } catch {
    /* private mode — applies for this visit only */
  }
  if (on) document.documentElement.dataset.ux = UX_PROTOTYPE;
  else delete document.documentElement.dataset.ux;
  for (const listener of listeners) listener();
}

/**
 * Whether this device runs the phone prototype. False on the server and on the
 * first client render (hydration matches the server), then the device's choice;
 * the CSS side is already applied before first paint by app/layout.tsx.
 */
export function useUxPrototype(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(readUxPrototype());
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return on;
}
