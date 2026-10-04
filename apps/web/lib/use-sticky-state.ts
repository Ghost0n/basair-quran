"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * useState that remembers its last value on this device (localStorage). For
 * small interface choices — a notebook grouping, a filter, a collapsed bar —
 * that should simply stay the way the reader left them, with no setting.
 * `allowed` rejects stale stored values after an option is renamed/removed.
 */
export function useStickyState<T extends string | number | boolean>(
  key: string,
  initial: T,
  allowed?: readonly T[],
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(initial);

  // Read after mount so server and first client render agree.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return;
      const parsed = JSON.parse(raw) as T;
      if (typeof parsed !== typeof initial) return;
      if (allowed && !allowed.includes(parsed)) return;
      setValue(parsed);
    } catch {
      /* unreadable or blocked storage: keep the default */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* private mode — applies for this visit */
      }
    },
    [key],
  );

  return [value, update];
}
