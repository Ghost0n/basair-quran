"use client";

import { useSyncExternalStore } from "react";

import { APP_MODE } from "./app-mode/config";
import { PHONE_QUERY } from "./phone-query";
import { isWebDesign } from "./web-design";

function subscribe(listener: () => void): () => void {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** True where the web design applies (client components only; false during SSR). */
export function useWebDesign(): boolean {
  const phone = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => true,
  );
  return isWebDesign(APP_MODE, phone);
}
