"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

import { canGoBackInApp, markReplace, notifyNavigationSettled, recordScreen, transition } from "./navigation";

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
  // The reading world's pages: saved pages, and the index (surahs · juz · hizb · page).
  "saved",
  "index",
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

const LAST_SCREEN_KEY = "qb.lastScreen";

function rememberScreen(search: string): void {
  try {
    window.sessionStorage.setItem(LAST_SCREEN_KEY, search);
  } catch {
    /* storage unavailable: the reader's back arrow goes Home */
  }
}

/** The query of the last screen opened before the reader (Home when none). */
export function lastScreenBeforeReader(): string {
  try {
    return window.sessionStorage.getItem(LAST_SCREEN_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * «Back», as the reader's arrow and the screen-edge swipe mean it: the
 * previous screen of this session (the browser's own back, so the URL stays
 * true), else — opened from a link or after a relaunch — the screen the
 * reader was opened from, else Home. Home itself has nowhere to go back to.
 */
export function useGoBack(): { canGoBack: boolean; goBack: (options?: { beforeUpdate?: () => void }) => void } {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("mode");
  const mode: ShellMode = isShellMode(raw) ? raw : DEFAULT_MODE;
  const goBack = useCallback(
    (options?: { beforeUpdate?: () => void }) => {
      if (mode === DEFAULT_MODE) return;
      const motion = mode === "reading" ? "reader-out" : "back";
      if (canGoBackInApp()) {
        transition(() => {
          options?.beforeUpdate?.();
          router.back();
        }, motion);
        return;
      }
      const query = mode === "reading" ? lastScreenBeforeReader() : "";
      transition(() => {
        options?.beforeUpdate?.();
        markReplace();
        router.replace(query ? `/?${query}` : "/", { scroll: false });
      }, motion);
    },
    [mode, router],
  );
  return { canGoBack: mode !== DEFAULT_MODE, goBack };
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
  setMode: (next: ShellMode, options?: { replace?: boolean; resume?: boolean; params?: Record<string, string | null> }) => void;
} {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("mode");
  const mode: ShellMode = isShellMode(raw) ? raw : DEFAULT_MODE;

  const setMode = useCallback(
    (next: ShellMode, options?: { replace?: boolean; resume?: boolean; params?: Record<string, string | null> }) => {
      const sp = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(options?.params ?? {})) {
        if (value === null) sp.delete(key);
        else sp.set(key, value);
      }
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
          markReplace();
          router.replace(href, { scroll: false });
        } else {
          router.push(href, { scroll: false });
        }
      };
      // A view transition carries the change (navigation.ts): entering the
      // reader splits the tab bar into its back button and dock.
      const motion = next === "reading" && mode !== "reading" ? "reader-in" : mode === "reading" && next !== "reading" ? "reader-out" : "fade";
      transition(navigate, motion);
    },
    [params, router, mode],
  );

  // The back stack follows every screen shown, and a navigation waiting on
  // its view transition learns the new screen is in.
  const current = params.toString();
  useEffect(() => {
    recordScreen(current);
    notifyNavigationSettled();
  }, [current]);

  // Every library page records itself as «where I was».
  const search = params.toString();
  useEffect(() => {
    if (NOTEBOOK_MODES.includes(mode)) rememberNotebookPlace(search);
  }, [mode, search]);

  // The last screen before the reader: where its back arrow returns.
  useEffect(() => {
    if (mode !== "reading") rememberScreen(search);
  }, [mode, search]);

  return { mode, setMode };
}
