"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { usePreferences } from "@/lib/preferences-context";

import type { ThemeMode } from "../types";

const THEME_KEY = "theme";

/**
 * Light/dark theme: a device override (localStorage) layered on the account
 * default. Without an override on this device the account's theme is adopted
 * once it loads; toggling writes both, so the choice follows the user across
 * devices. Keeps <body> classes in sync (the pre-paint script sets them first).
 */
export function useThemeMode(): { theme: ThemeMode; toggleTheme: () => void } {
  const { account, updateAccount } = usePreferences();
  const userSetThemeRef = useRef(false);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "dark";
    try {
      return window.localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  // Adopt the account theme when this device has no explicit override and the
  // user hasn't toggled this session.
  useEffect(() => {
    if (userSetThemeRef.current) return;
    let hasOverride = false;
    try {
      hasOverride = window.localStorage.getItem(THEME_KEY) !== null;
    } catch {
      hasOverride = false;
    }
    if (!hasOverride && (account.theme === "light" || account.theme === "dark")) {
      setTheme(account.theme);
    }
  }, [account.theme]);

  useEffect(() => {
    const isLight = theme === "light";
    document.body.classList.toggle("light", isLight);
    document.body.classList.toggle("light-mode", isLight);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    userSetThemeRef.current = true;
    setTheme((current) => {
      const next: ThemeMode = current === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(THEME_KEY, next);
      } catch {
        /* private mode — theme just won't persist on this device */
      }
      // Mirror to the account default; a failed write must not break the toggle.
      void updateAccount({ theme: next }).catch(() => {});
      return next;
    });
  }, [updateAccount]);

  return { theme, toggleTheme };
}
