import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { haptic, hapticsEnabled, setHapticsEnabled } from "./haptics";

/** A page with the platform class on <html> and, maybe, navigator.vibrate. */
function page(platform: "qb-ios" | "qb-android", vibrate?: (pattern: number | number[]) => boolean) {
  vi.stubGlobal("document", { documentElement: { classList: { contains: (c: string) => c === platform } } });
  vi.stubGlobal("navigator", vibrate ? { vibrate } : {});
  vi.stubGlobal("window", {});
}

describe("haptic", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("taps lightly through the browser's vibration on Android", () => {
    const vibrate = vi.fn(() => true);
    page("qb-android", vibrate);
    haptic("light");
    expect(vibrate).toHaveBeenCalledWith(10);
  });

  it("marks a confirmed action with a short double pulse on Android", () => {
    const vibrate = vi.fn(() => true);
    page("qb-android", vibrate);
    haptic("success");
    expect(vibrate).toHaveBeenCalledWith([12, 40, 18]);
  });

  it("stays silent in Safari on iPhone, which cannot vibrate", () => {
    const vibrate = vi.fn(() => true);
    page("qb-ios", vibrate);
    haptic("light");
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("never throws when the vibration call fails", () => {
    page("qb-android", () => {
      throw new Error("blocked");
    });
    expect(() => haptic("light")).not.toThrow();
  });

  it("stays silent once turned off on the device, and comes back when turned on", () => {
    const vibrate = vi.fn(() => true);
    page("qb-android", vibrate);
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    });
    setHapticsEnabled(false);
    expect(hapticsEnabled()).toBe(false);
    haptic("light");
    expect(vibrate).not.toHaveBeenCalled();
    setHapticsEnabled(true);
    expect(hapticsEnabled()).toBe(true);
    expect(vibrate).toHaveBeenCalledTimes(1); // the toggle confirms itself
  });

  it("is on when nothing was chosen, or storage is unavailable", () => {
    page("qb-android");
    expect(hapticsEnabled()).toBe(true);
  });
});
