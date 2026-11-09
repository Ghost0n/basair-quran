"use client";

import { APP_MODE } from "@/lib/app-mode/config";
import { useAuthSession } from "@/lib/auth-session-context";
import { AUTH_ENABLED } from "@/lib/config";

/**
 * Whether what the reader does is kept by the account — else on this device
 * only. A signed-in reader's data is saved on our server; the installed app
 * keeps a guest's on the phone (its own store, backed up by the reader); a
 * single-user server (accounts off) is the reader's own. A guest on the web
 * has no account record of their own, so personal history (recents, reading
 * progress) stays in the browser.
 */
export function useAccountKeepsData(): boolean {
  const { user } = useAuthSession();
  return !AUTH_ENABLED || APP_MODE || Boolean(user);
}
