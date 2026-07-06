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
import type { AuthUserInfo } from "@q-basair/shared";

import { API_BASE_URL, AUTH_ENABLED } from "@/lib/config";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

type AuthSessionValue = {
  /** The signed-in user, or null (guest / auth disabled). */
  user: AuthUserInfo | null;
  /** True once the initial session probe has resolved. */
  ready: boolean;
  /** Re-probe the session from the server. */
  refresh: () => Promise<void>;
  /** Optimistically patch the shared user (e.g. after a profile rename) so every
   *  consumer — the rail menu included — reflects the change immediately. */
  patchUser: (patch: Partial<AuthUserInfo>) => void;
};

const AuthSessionContext = createContext<AuthSessionValue>({
  user: null,
  ready: !AUTH_ENABLED,
  refresh: async () => {},
  patchUser: () => {},
});

/**
 * One shared session probe for the shell. Previously the rail menu, settings,
 * the mobile sheet, and Home each fetched `getAuthSession` independently, so a
 * rename in settings never refreshed the rail. This fetches once and exposes a
 * `patchUser` so an in-place profile edit propagates to every consumer.
 */
export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserInfo | null>(null);
  const [ready, setReady] = useState(!AUTH_ENABLED);

  const refresh = useCallback(async () => {
    if (!AUTH_ENABLED) {
      setReady(true);
      return;
    }
    try {
      const session = await api.getAuthSession({ suppressAuthRedirect: true });
      setUser(session.authenticated ? session.user ?? null : null);
    } catch {
      /* keep the last known user on a transient failure */
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const patchUser = useCallback((patch: Partial<AuthUserInfo>) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const value = useMemo<AuthSessionValue>(
    () => ({ user, ready, refresh, patchUser }),
    [user, ready, refresh, patchUser],
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSessionValue {
  return useContext(AuthSessionContext);
}
