"use client";

import { useSyncExternalStore } from "react";

import { PHONE_QUERY } from "./phone-query";

export { PHONE_QUERY };

function subscribe(listener: () => void): () => void {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** The phone layout of the recitation session (phone player, tap to reveal). SSR-safe (false). */
export function usePhoneLayout(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}
