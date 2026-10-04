"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

export const SHELL_MODES = [
  "home",
  "reading",
  "search",
  "studio",
  "notebook",
  "bookmarks",
  "history",
  "roots",
  "settings",
  "heatmap",
  // لوحة الموضوع — a theme's graph board (`&theme=<id>`).
  "board",
  // البحث — a research document editor (`&id=<doc id>`).
  "document",
  // المجتمع — the community feed, and one shared post (`&id=<post id>`).
  "community",
  "post",
] as const;

export type ShellMode = (typeof SHELL_MODES)[number];

const DEFAULT_MODE: ShellMode = "home";

function isShellMode(value: string | null): value is ShellMode {
  return value !== null && (SHELL_MODES as readonly string[]).includes(value);
}

/** Pages that belong to the library (الدفتر): the list, a board, a research. */
export const NOTEBOOK_MODES: readonly ShellMode[] = ["notebook", "board", "document"];
const LAST_NOTEBOOK_KEY = "qb.lastNotebook";

/** Remember where the reader was in the library (called on every library page). */
export function rememberNotebookPlace(search: string): void {
  try {
    window.localStorage.setItem(LAST_NOTEBOOK_KEY, search);
  } catch {
    /* private mode — the library button just opens the list */
  }
}

function lastNotebookPlace(): string | null {
  try {
    const value = window.localStorage.getItem(LAST_NOTEBOOK_KEY);
    const mode = value ? new URLSearchParams(value).get("mode") : null;
    return value && isShellMode(mode) && NOTEBOOK_MODES.includes(mode) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Reads the active mode from the `?mode=` query param. Defaults to
 * "reading" when missing or invalid.
 *
 * Use `setMode(mode)` to navigate; preserves other query params.
 */
export function useShellMode(): {
  mode: ShellMode;
  /**
   * Navigate to a mode. `resume` (the library's own nav buttons): opening
   * «الدفتر» returns to the last library page — a board, a research — rather
   * than the list.
   */
  setMode: (next: ShellMode, options?: { replace?: boolean; resume?: boolean }) => void;
} {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("mode");
  const mode: ShellMode = isShellMode(raw) ? raw : DEFAULT_MODE;

  const setMode = useCallback(
    (next: ShellMode, options?: { replace?: boolean; resume?: boolean }) => {
      const sp = new URLSearchParams(params.toString());
      if (next === DEFAULT_MODE) {
        sp.delete("mode");
      } else {
        sp.set("mode", next);
      }
      const resumed = options?.resume && next === "notebook" ? lastNotebookPlace() : null;
      const query = sp.toString();
      const href = resumed ? `/?${resumed.replace(/^\?/, "")}` : query ? `/?${query}` : "/";
      // `replace` for implicit/derived switches (e.g. results auto-opening
      // Search) so Back isn't clogged with entries the user didn't choose.
      const navigate = () => {
        if (options?.replace) {
          router.replace(href, { scroll: false });
        } else {
          router.push(href, { scroll: false });
        }
      };
      // Morph the shared omnibar (Home centre ↔ top command bar) when the View
      // Transitions API is available; a plain navigation everywhere else.
      const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
      if (typeof document !== "undefined" && typeof doc.startViewTransition === "function") {
        doc.startViewTransition(navigate);
      } else {
        navigate();
      }
    },
    [params, router],
  );

  // Every library page records itself as «where I was».
  const search = params.toString();
  useEffect(() => {
    if (NOTEBOOK_MODES.includes(mode)) rememberNotebookPlace(search);
  }, [mode, search]);

  return { mode, setMode };
}
