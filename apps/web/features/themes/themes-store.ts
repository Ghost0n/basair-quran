"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { ThemeCreate, ThemeSummary, ThemeUpdate } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

/**
 * One in-tab store for the user's themes (مواضيع). The reader (highlight
 * colours, theme sheet), the library and the board all read the same list, so a
 * theme created from the reader appears in the library beside it at once.
 * Loaded lazily on first use; mutations update it in place.
 */
type ThemesState = { themes: ThemeSummary[]; loaded: boolean };

let state: ThemesState = { themes: [], loaded: false };
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setState(next: ThemesState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const SERVER_STATE: ThemesState = { themes: [], loaded: false };

export function loadThemes(force = false): Promise<void> {
  if (inflight) return inflight;
  if (state.loaded && !force) return Promise.resolve();
  inflight = api
    .getThemes()
    .then((themes) => setState({ themes, loaded: true }))
    .catch(() => setState({ ...state, loaded: true }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function createTheme(theme: ThemeCreate): Promise<ThemeSummary> {
  const created = await api.createTheme(theme);
  setState({ ...state, themes: [...state.themes.filter((t) => t.id !== created.id), created] });
  return created;
}

export async function updateTheme(themeId: number, patch: ThemeUpdate): Promise<void> {
  const updated = await api.updateTheme(themeId, patch);
  const { board: _board, ...summary } = updated;
  setState({ ...state, themes: state.themes.map((t) => (t.id === themeId ? { ...t, ...summary } : t)) });
}

export async function deleteTheme(themeId: number): Promise<void> {
  await api.deleteTheme(themeId);
  setState({ ...state, themes: state.themes.filter((t) => t.id !== themeId) });
}

/** The user's themes (loads once per tab); `byId` for colour lookups. */
export function useThemes() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
  useEffect(() => {
    void loadThemes();
  }, []);
  const byId = useCallback(
    (themeId: number) => snapshot.themes.find((theme) => theme.id === themeId) ?? null,
    [snapshot.themes],
  );
  return { themes: snapshot.themes, loaded: snapshot.loaded, byId };
}
