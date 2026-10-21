"use client";

import { AUTH_ENABLED } from "@/lib/config";
import { useAuthSession } from "@/lib/auth-session-context";

/** Who may do what in the community (mirrors the backend's route checks). */
export function useCommunityAccess(): { canWrite: boolean; isModerator: boolean; isAdmin: boolean; ready: boolean } {
  const { user, ready } = useAuthSession();
  if (!AUTH_ENABLED) return { canWrite: true, isModerator: true, isAdmin: true, ready: true };
  return {
    canWrite: Boolean(user),
    // Admins moderate too; moderators are appointed by an admin.
    isModerator: Boolean(user?.is_admin || user?.is_moderator),
    isAdmin: Boolean(user?.is_admin),
    ready,
  };
}
