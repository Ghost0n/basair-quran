import { setGuestIdProvider } from "@q-basair/api-client";

/**
 * Per-device guest identity. A random token, created once and kept in
 * localStorage, is stamped on all guest (user_id=0) writes via the
 * `X-QBasair-Guest-Id` header so a later guest→account merge can be scoped to
 * *this* device's rows instead of harvesting every guest's data.
 */

const GUEST_ID_KEY = "qb.guest.id";

function randomToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID.
  return `g-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function getOrCreateGuestId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(GUEST_ID_KEY);
    if (existing) return existing;
    const token = randomToken();
    window.localStorage.setItem(GUEST_ID_KEY, token);
    return token;
  } catch {
    // Storage unavailable (private mode / disabled). No stable guest identity —
    // merges simply won't carry a token, which fails safe (nothing harvested).
    return null;
  }
}

// Self-register on first import so every api-client request carries the header.
setGuestIdProvider(() => getOrCreateGuestId());
