/**
 * What an account leaves in this browser, forgotten at sign-out so the next
 * person at the same screen sees none of it (docs/api-contract.md): the study's
 * sessions, the cached preferences (reading position, saved pages, recents),
 * reading progress, the last board and notebook, and the AI connection (the
 * reader's provider keys: kept on their account, found again at the next
 * sign-in, lib/ai-connection.ts). The device's own choices — interface
 * language, theme, haptics, guide version — stay.
 */
import { forgetAiConnectionOnThisDevice } from "./ai-connection";

const LOCAL_KEYS = [
  "qb.prefs.cache",
  "qb.recents",
  "qb.reading.progress",
  "qb.lastBoard",
  "qb.lastNotebook",
];

const SESSION_KEYS = [
  "qbasair.studio.sessions",
  "qb.studio.ask",
  "qb.studio.open-session",
  "qbasair.research.ollama",
];

export function forgetAccountOnThisDevice(): void {
  for (const [storage, keys] of [
    [() => window.localStorage, LOCAL_KEYS],
    [() => window.sessionStorage, SESSION_KEYS],
  ] as const) {
    try {
      const store = storage();
      for (const key of keys) store.removeItem(key);
    } catch {
      /* storage unavailable: nothing was kept there */
    }
  }
  forgetAiConnectionOnThisDevice();
}
