/**
 * Account sync in the standalone app: when online and signed in, the device's
 * notebook, themes, sessions, roots, documents and preferences are reconciled
 * with the account (packages/offline-engine/src/sync.ts) — at start, when the
 * connection comes back, a few seconds after a change here, after sign-in,
 * and every few minutes. Signing out removes the account's data from the
 * device (what was made here while signed out stays).
 */
import { forgetAccount, syncAccount } from "@q-basair/offline-engine";

import { REMOTE_ORIGIN } from "./config";
import { cachedSession, isOnline, onAuthChange, onLocalWrite, remoteRequest } from "./fetch-router";
import { appRuntime } from "./runtime";

export const SYNCED_EVENT = "qb:data-synced";
const PERIOD_MS = 5 * 60 * 1000;
const AFTER_WRITE_MS = 4000;

let running: Promise<void> | null = null;
let again = false;

async function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      const session = await cachedSession();
      if (!REMOTE_ORIGIN || !isOnline() || !session?.authenticated || !session.user) return;
      const { api } = await appRuntime();
      if (!api.store) return;
      const report = await syncAccount(api.store, remoteRequest, session.user.id);
      const pulled = Object.values(report.pulled).reduce((total, count) => total + count, 0);
      if (pulled) window.dispatchEvent(new CustomEvent(SYNCED_EVENT, { detail: report }));
    } catch (error) {
      console.warn("account sync", error); // retried on the next trigger; the device keeps working
    } finally {
      running = null;
      if (again) {
        again = false;
        void syncNow();
      }
    }
  })();
  return running;
}

let started = false;

export function startAccountSync(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  onLocalWrite(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), AFTER_WRITE_MS);
  });
  onAuthChange((session) => {
    if (session?.authenticated) {
      void syncNow();
      return;
    }
    void appRuntime().then(({ api }) => (api.store ? forgetAccount(api.store) : undefined)).then(() => window.dispatchEvent(new CustomEvent(SYNCED_EVENT)));
  });
  window.addEventListener("online", () => void syncNow());
  setInterval(() => void syncNow(), PERIOD_MS);
  void syncNow();
}
