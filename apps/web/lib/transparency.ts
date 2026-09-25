"use client";

import { useSyncExternalStore } from "react";

/**
 * «الشفافية» — a per-device display preference (it depends on the device's
 * GPU, not on the account): `auto` keeps the liquid glass (and follows the
 * system's "reduce transparency" setting), `reduced` swaps every blurred
 * surface for an opaque tint. Applied as `<html data-transparency>` so the
 * CSS in `app/glass.css` does the rest; `app/layout.tsx` applies it before
 * first paint.
 */
export type Transparency = "auto" | "reduced";

export const TRANSPARENCY_KEY = "qb.transparency";
const listeners = new Set<() => void>();

export function readTransparency(): Transparency {
  try {
    return window.localStorage.getItem(TRANSPARENCY_KEY) === "reduced" ? "reduced" : "auto";
  } catch {
    return "auto";
  }
}

export function applyTransparency(value: Transparency): void {
  if (value === "reduced") document.documentElement.dataset.transparency = "reduced";
  else delete document.documentElement.dataset.transparency;
}

export function setTransparency(value: Transparency): void {
  try {
    if (value === "reduced") window.localStorage.setItem(TRANSPARENCY_KEY, value);
    else window.localStorage.removeItem(TRANSPARENCY_KEY);
  } catch {
    /* private mode — applies for this visit only */
  }
  applyTransparency(value);
  for (const listener of listeners) listener();
}

export function useTransparency(): Transparency {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    readTransparency,
    () => "auto",
  );
}
