"use client";

import { AUTH_ENABLED } from "@/lib/config";
import { useAuthSession } from "@/lib/auth-session-context";

/** Who may do what in the community (mirrors the backend's route checks). */
export function useCommunityAccess(): { canWrite: boolean; isModerator: boolean; ready: boolean } {
  const { user, ready } = useAuthSession();
  if (!AUTH_ENABLED) return { canWrite: true, isModerator: true, ready: true };
  return { canWrite: Boolean(user), isModerator: Boolean(user?.is_admin), ready };
}
