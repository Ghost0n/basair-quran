"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export const SHELL_MODES = [
  "reading",
  "search",
  "studio",
  "notebook",
  "bookmarks",
  "history",
  "roots",
  "settings",
  "heatmap",
] as const;

export type ShellMode = (typeof SHELL_MODES)[number];

const DEFAULT_MODE: ShellMode = "reading";

function isShellMode(value: string | null): value is ShellMode {
  return value !== null && (SHELL_MODES as readonly string[]).includes(value);
}

/**
 * Reads the active mode from the `?mode=` query param. Defaults to
 * "reading" when missing or invalid.
 *
 * Use `setMode(mode)` to navigate; preserves other query params.
 */
export function useShellMode(): {
  mode: ShellMode;
  setMode: (next: ShellMode, options?: { replace?: boolean }) => void;
} {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("mode");
  const mode: ShellMode = isShellMode(raw) ? raw : DEFAULT_MODE;

  const setMode = useCallback(
    (next: ShellMode, options?: { replace?: boolean }) => {
      const sp = new URLSearchParams(params.toString());
      if (next === DEFAULT_MODE) {
        sp.delete("mode");
      } else {
        sp.set("mode", next);
      }
      const query = sp.toString();
      const href = query ? `/?${query}` : "/";
      // `replace` for implicit/derived switches (e.g. results auto-opening
      // Search) so Back isn't clogged with entries the user didn't choose.
      if (options?.replace) {
        router.replace(href, { scroll: false });
      } else {
        router.push(href, { scroll: false });
      }
    },
    [params, router],
  );

  return { mode, setMode };
}
