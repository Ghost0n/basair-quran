"use client";

import type { AuthSessionResponse, GuestMergeResult } from "@q-basair/shared";
import { createQBasairApiClient } from "@q-basair/api-client";

import { API_BASE_URL } from "@/lib/config";
// Side-effect: registers the guest-id header provider on the api-client.
import "@/lib/guest-id";

/**
 * Shared identity-flow plumbing: guest→account merge (run once per account),
 * a sessionStorage relay so the destination shell can raise the merge toast,
 * and the post-auth routing decision (first-run → /welcome, else resume).
 */

const MERGE_RESULT_KEY = "qb.merge-result";
const GUEST_KEY = "qb.guest";

export const identityApi = createQBasairApiClient({ baseUrl: API_BASE_URL });

/** The visitor chose to browse without an account (from the landing page). */
export function hasChosenGuest(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(GUEST_KEY) === "1";
}

export function continueAsGuest(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_KEY, "1");
  } catch {
    /* storage unavailable — the gate just re-asks next visit */
  }
}

export function clearGuestChoice(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GUEST_KEY);
  } catch {
    /* ignore */
  }
}

export function sanitizeNextPath(rawValue: string | null | undefined): string {
  if (!rawValue) return "/";
  // Only same-origin absolute paths are allowed. Browsers strip tab/newline
  // characters from URLs before parsing, so `/\t/evil.com` would normalize into
  // a protocol-relative URL — strip them before validating.
  const value = rawValue.replace(/[\t\n\r]/g, "");
  // Reject anything a browser could normalize into a protocol-relative
  // (`//host`) or scheme-relative (`/\host`) URL: the path must start with a
  // single slash that is not followed by another slash or a backslash.
  if (value[0] !== "/") return "/";
  if (value[1] === "/" || value[1] === "\\") return "/";
  return value;
}

/**
 * Move this device's guest (user_id=0) data into the account. The merge is
 * scoped server-side to the device's guest token and is naturally idempotent
 * (moved rows leave the guest scope), so it is safe to call on every sign-in —
 * no client-side once-per-account flag, and guest data created later is still
 * claimable. Returns the result only when something actually moved, so the
 * caller can decide whether to raise the toast.
 */
export async function maybeMergeGuestData(): Promise<GuestMergeResult | null> {
  if (typeof window === "undefined") return null;
  try {
    const result = await identityApi.mergeGuestData({}, { suppressAuthRedirect: true });
    const moved = result.notebook_moved + result.sessions_moved + result.roots_moved;
    if (moved > 0) {
      window.sessionStorage.setItem(MERGE_RESULT_KEY, JSON.stringify(result));
      return result;
    }
  } catch {
    // A failed merge is non-fatal — the user's guest data stays where it is.
  }
  return null;
}

/** The shell reads (and clears) any pending merge result to raise the toast. */
export function readAndClearMergeResult(): GuestMergeResult | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(MERGE_RESULT_KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(MERGE_RESULT_KEY);
  try {
    return JSON.parse(raw) as GuestMergeResult;
  } catch {
    return null;
  }
}

/**
 * Route after a successful sign in / sign up: a fresh account (not yet
 * onboarded) goes through the avatar + onboarding welcome flow; an existing
 * account merges its guest data and resumes wherever it was headed.
 */
export async function routeAfterAuth(session: AuthSessionResponse, nextPath: string): Promise<void> {
  const user = session.user;
  if (user && !user.onboarded) {
    window.location.assign(`/welcome?next=${encodeURIComponent(nextPath)}`);
    return;
  }
  if (user) {
    await maybeMergeGuestData();
  }
  window.location.assign(nextPath);
}
