"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { UserPreferences, UserPreferencesUpdate } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";
import { DEFAULT_EDITION, DEFAULT_MUSHAF_ID } from "@/lib/mushaf-defaults";
import { formatNumber } from "@/lib/numerals";
// Side-effect: registers the guest-id header provider on the api-client.
import "@/lib/guest-id";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

export const DEFAULT_PREFERENCES: UserPreferences = {
  mushaf_edition: DEFAULT_EDITION.id,
  riwayah: DEFAULT_MUSHAF_ID,
  mushaf_font: "amiri-quran",
  numerals: "arabic-indic",
  ui_language: "ar",
  theme: "dark",
  font_size: 28,
  reciter: "",
  mushaf_render: "authentic",
  reader_layout: "auto",
  research: { default_mode: "strict", depth: "balanced" },
  saved_pages: [],
};

type TweaksPatch = Partial<Omit<UserPreferences, "research">>;

type PreferencesValue = {
  /** True once the initial account preferences have loaded (or failed) — lets the
   *  reader wait before deciding where to resume. */
  ready: boolean;
  /** Effective preferences: account defaults with session tweaks layered on top. */
  preferences: UserPreferences;
  /** The persisted account defaults (no session tweaks). */
  account: UserPreferences;
  /** The current per-session overrides. */
  tweaks: TweaksPatch;
  updateAccount: (patch: UserPreferencesUpdate) => Promise<void>;
  /** Optimistic local update + debounced PATCH — for continuous inputs (sliders). */
  updateAccountDebounced: (patch: UserPreferencesUpdate) => void;
  setTweak: (patch: TweaksPatch) => void;
  resetTweaks: () => void;
  promoteTweaks: () => Promise<void>;
};

const PreferencesContext = createContext<PreferencesValue>({
  ready: false,
  preferences: DEFAULT_PREFERENCES,
  account: DEFAULT_PREFERENCES,
  tweaks: {},
  updateAccount: async () => {},
  updateAccountDebounced: () => {},
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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getPreferences()
      .then((loaded) => {
        if (!cancelled) setAccount(loaded);
      })
      .catch(() => {
        /* keep defaults if the store is unreachable */
      })
      .finally(() => {
        if (!cancelled) setReady(true);
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

  // Debounced persistence for continuous controls (e.g. the font-size slider),
  // which would otherwise fire a PATCH on every drag tick. The local state updates
  // immediately for live feedback; the network write is coalesced.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchRef = useRef<UserPreferencesUpdate>({});

  const updateAccountDebounced = useCallback((patch: UserPreferencesUpdate) => {
    setAccount((current) => {
      // Type-safe optimistic merge: skip null/undefined and merge nested research
      // (mirrors the backend's update_preferences), keeping the result a full
      // UserPreferences rather than loosening it with the partial/nullable patch.
      const next: Record<string, unknown> = { ...current };
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined) continue;
        if (key === "research" && typeof value === "object") {
          next.research = { ...current.research, ...(value as object) };
        } else {
          next[key] = value;
        }
      }
      return next as unknown as UserPreferences;
    });
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      const patchToSend = pendingPatchRef.current;
      pendingPatchRef.current = {};
      void api.updatePreferences(patchToSend).then(setAccount).catch(() => {});
    }, 400);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
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
    () => ({
      ready,
      preferences,
      account,
      tweaks,
      updateAccount,
      updateAccountDebounced,
      setTweak,
      resetTweaks,
      promoteTweaks,
    }),
    [ready, preferences, account, tweaks, updateAccount, updateAccountDebounced, setTweak, resetTweaks, promoteTweaks],
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
