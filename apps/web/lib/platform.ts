/**
 * Platform utilities — safe for SSR (typeof navigator guard).
 * Returns a consistent value on the server so hydration does not
 * mismatch; the real value is applied client-side on first paint.
 * Pair with suppressHydrationWarning on any element that renders
 * the modifier key to silence the expected SSR → client delta.
 */

export function isMac(): boolean {
  if (typeof navigator === "undefined") return true; // SSR default: Mac (⌘ is the common published shortcut)
  return /mac|iphone|ipad/i.test(navigator.platform);
}

/** Returns "⌘" on macOS / iOS, "Ctrl" on Windows / Linux. */
export function modKey(): string {
  return isMac() ? "⌘" : "Ctrl";
}
