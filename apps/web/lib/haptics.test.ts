import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { haptic } from "./haptics";

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
});
