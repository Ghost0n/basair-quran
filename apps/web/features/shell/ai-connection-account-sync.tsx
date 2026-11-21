"use client";

import { useEffect } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";

import { useAuthSession } from "@/lib/auth-session-context";
import { syncAiConnectionWithAccount, type AiConnectionAccountApi } from "@/lib/ai-connection";
import { API_BASE_URL, AUTH_ENABLED } from "@/lib/config";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });
const accountApi: AiConnectionAccountApi = {
  get: () => api.getAiConnection({ suppressAuthRedirect: true }),
  save: (connection) => api.saveAiConnection(connection, { suppressAuthRedirect: true }),
};

/**
 * The reader's AI connection follows their account (lib/ai-connection.ts):
 * once the shell knows who is signed in, the account's keys reach this
 * browser, and changes made here reach the account.
 */
export function AiConnectionAccountSync() {
  const { ready, user } = useAuthSession();
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!AUTH_ENABLED || !ready) return;
    void syncAiConnectionWithAccount(userId, accountApi);
  }, [ready, userId]);
  return null;
}
