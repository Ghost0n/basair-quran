/**
 * Haptic feedback: a light tap on a tab change or a page turn, a short
 * success pulse on a confirmed action.
 *
 * - The installed app (iOS and Android): @capacitor/haptics.
 * - Android in a browser: navigator.vibrate.
 * - iOS Safari cannot vibrate, and a desktop has nothing to vibrate: silence.
 *
 * Never throws: feedback is a nicety, never a reason for an action to fail.
 * The reader can turn it off for the device (Settings → «العرض»).
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

// Settings → «العرض» → «الاهتزاز عند اللمس»: this device's choice (on unless turned off).
const STORAGE_KEY = "qb.haptics";
const listeners = new Set<() => void>();

/** Whether this device gives haptic feedback (the reader may turn it off). */
export function hapticsEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setHapticsEnabled(on: boolean): void {
  try {
    if (on) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, "off");
  } catch {
    /* storage unavailable: the choice lasts this session only */
  }
  listeners.forEach((listener) => listener());
  // The toggle itself confirms, once it is on.
  if (on) haptic("light");
}

export function subscribeHaptics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Something here can vibrate: the installed app, or Android in a browser. */
export function hapticsAvailable(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  return isNativeApp() || (document.documentElement.classList.contains("qb-android") && typeof navigator.vibrate === "function");
}

export function haptic(kind: HapticKind): void {
  try {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (!hapticsEnabled()) return;
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
