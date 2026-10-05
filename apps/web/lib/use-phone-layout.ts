"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 768px)";

function subscribe(listener: () => void): () => void {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** The phone layout (the same breakpoint as the phone CSS: tab bar, phone player). SSR-safe (false). */
export function usePhoneLayout(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
