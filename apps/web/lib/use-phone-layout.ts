"use client";

import { useSyncExternalStore } from "react";

/**
 * A phone in either orientation: up to 768px wide, or a short touch screen —
 * a phone on its side is wider than 768px but at most 500px tall. Short
 * windows with a mouse (a resized desktop browser) stay on the desktop layout.
 * Keep in step with the phone CSS (phone-player.css).
 */
export const PHONE_QUERY = "(max-width: 768px), (max-height: 500px) and (pointer: coarse)";

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
