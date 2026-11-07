/**
 * Haptic feedback: a light tap on a tab change or a page turn, a short
 * success pulse on a confirmed action.
 *
 * - The installed app (iOS and Android): @capacitor/haptics.
 * - Android in a browser: navigator.vibrate.
 * - iOS Safari cannot vibrate, and a desktop has nothing to vibrate: silence.
 *
 * Never throws: feedback is a nicety, never a reason for an action to fail.
 */
export type HapticKind = "light" | "success";

type CapacitorGlobal = { isNativePlatform?: () => boolean };

function isNativeApp(): boolean {
  const capacitor = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

async function nativeHaptic(kind: HapticKind): Promise<void> {
  const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
  if (kind === "light") await Haptics.impact({ style: ImpactStyle.Light });
  else await Haptics.notification({ type: NotificationType.Success });
}

export function haptic(kind: HapticKind): void {
  try {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (isNativeApp()) {
      void nativeHaptic(kind).catch(() => {});
      return;
    }
    if (!document.documentElement.classList.contains("qb-android")) return;
    if (typeof navigator.vibrate !== "function") return;
    navigator.vibrate(kind === "light" ? 10 : [12, 40, 18]);
  } catch {
    // No feedback rather than a failed action.
  }
}
