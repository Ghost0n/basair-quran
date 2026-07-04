"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { UserPreferences, UserPreferencesUpdate } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";
import { formatNumber } from "@/lib/numerals";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

export const DEFAULT_PREFERENCES: UserPreferences = {
  riwayah: 1,
  mushaf_font: "amiri-quran",
  numerals: "arabic-indic",
  ui_language: "ar",
  theme: "dark",
  font_size: 28,
  reciter: "",
  mushaf_render: "simple",
  reader_layout: "auto",
  research: { default_mode: "strict", depth: "balanced" },
  saved_pages: [],
};

type TweaksPatch = Partial<Omit<UserPreferences, "research">>;

type PreferencesValue = {
  /** Effective preferences: account defaults with session tweaks layered on top. */
  preferences: UserPreferences;
  /** The persisted account defaults (no session tweaks). */
  account: UserPreferences;
  /** The current per-session overrides. */
  tweaks: TweaksPatch;
  updateAccount: (patch: UserPreferencesUpdate) => Promise<void>;
  setTweak: (patch: TweaksPatch) => void;
  resetTweaks: () => void;
  promoteTweaks: () => Promise<void>;
};

const PreferencesContext = createContext<PreferencesValue>({
  preferences: DEFAULT_PREFERENCES,
  account: DEFAULT_PREFERENCES,
  tweaks: {},
  updateAccount: async () => {},
  setTweak: () => {},
  resetTweaks: () => {},
  promoteTweaks: async () => {},
});

/**
 * PreferencesProvider — account defaults (persisted to the backend) with a
 * per-session Tweaks layer on top. The Tweaks panel writes to `tweaks`;
 * the Settings page writes to `account`. `preferences` is the merge both
 * the UI and the numerals helper read from.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [tweaks, setTweaks] = useState<TweaksPatch>({});

  useEffect(() => {
    let cancelled = false;
    api
      .getPreferences()
      .then((loaded) => {
        if (!cancelled) setAccount(loaded);
      })
      .catch(() => {
        /* keep defaults if the store is unreachable */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const preferences = useMemo<UserPreferences>(
    () => ({ ...account, ...tweaks }),
    [account, tweaks],
  );

  // The effective ayah font size drives the Mushaf reading scale.
  useEffect(() => {
    document.documentElement.style.setProperty("--fs-ayah", `${preferences.font_size / 16}rem`);
    return () => {
      document.documentElement.style.removeProperty("--fs-ayah");
    };
  }, [preferences.font_size]);

  const updateAccount = useCallback(async (patch: UserPreferencesUpdate) => {
    const next = await api.updatePreferences(patch);
    setAccount(next);
  }, []);

  const setTweak = useCallback((patch: TweaksPatch) => {
    setTweaks((current) => ({ ...current, ...patch }));
  }, []);

  const resetTweaks = useCallback(() => setTweaks({}), []);

  const promoteTweaks = useCallback(async () => {
    if (Object.keys(tweaks).length === 0) return;
    const next = await api.updatePreferences(tweaks);
    setAccount(next);
    setTweaks({});
  }, [tweaks]);

  const value = useMemo<PreferencesValue>(
    () => ({ preferences, account, tweaks, updateAccount, setTweak, resetTweaks, promoteTweaks }),
    [preferences, account, tweaks, updateAccount, setTweak, resetTweaks, promoteTweaks],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  return useContext(PreferencesContext);
}

/** Returns the numeral formatter for the user's active numeral script. */
export function useNumerals(): (n: number | string) => string {
  const { preferences } = useContext(PreferencesContext);
  return useCallback((n) => formatNumber(n, preferences.numerals), [preferences.numerals]);
}
