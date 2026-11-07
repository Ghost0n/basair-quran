import { afterEach, describe, expect, it, vi } from "vitest";

import { barLook, nativeBarHidden, nativeTabBarAction, nativeTabBarAvailable, rgbToHex } from "./native-tab-bar";

afterEach(() => vi.unstubAllGlobals());

function stubCapacitor(platform: string, native: boolean, plugin: boolean) {
  vi.stubGlobal("window", {
    Capacitor: {
      getPlatform: () => platform,
      isNativePlatform: () => native,
      isPluginAvailable: (name: string) => plugin && name === "NativeTabBar",
    },
  });
}

describe("nativeTabBarAvailable", () => {
  it("is false in a browser (no Capacitor)", () => {
    vi.stubGlobal("window", {});
    expect(nativeTabBarAvailable()).toBe(false);
  });

  it("is false in the Android app", () => {
    stubCapacitor("android", true, true);
    expect(nativeTabBarAvailable()).toBe(false);
  });

  it("is false in the iOS app without the plugin", () => {
    stubCapacitor("ios", true, false);
    expect(nativeTabBarAvailable()).toBe(false);
  });

  it("is true in the iOS app with the plugin registered", () => {
    stubCapacitor("ios", true, true);
    expect(nativeTabBarAvailable()).toBe(true);
  });
});

describe("nativeTabBarAction", () => {
  const base = { available: true, hidden: false, shown: false, active: "search", shownActive: null };

  it("never shows the bar when it is not available", () => {
    expect(nativeTabBarAction({ ...base, available: false })).toEqual({ kind: "none" });
  });

  it("shows it outside the Mushaf", () => {
    expect(nativeTabBarAction(base)).toEqual({ kind: "show" });
  });

  it("hides it in the Mushaf", () => {
    expect(nativeTabBarAction({ ...base, hidden: true, shown: true, shownActive: "search" })).toEqual({ kind: "hide" });
    expect(nativeTabBarAction({ ...base, hidden: true })).toEqual({ kind: "none" });
  });

  it("moves the active tab when the page changes", () => {
    expect(nativeTabBarAction({ ...base, shown: true, shownActive: "home" })).toEqual({ kind: "setActive", id: "search" });
    expect(nativeTabBarAction({ ...base, shown: true, shownActive: "search" })).toEqual({ kind: "none" });
  });
});

describe("rgbToHex", () => {
  it("turns a computed colour into the hex the native tint takes", () => {
    expect(rgbToHex("rgb(232, 200, 116)")).toBe("#e8c874");
    expect(rgbToHex("rgba(10, 0, 255, 0.5)")).toBe("#0a00ff");
    expect(rgbToHex("color(srgb 1 0.5 0)")).toBe("#ff8000");
    expect(rgbToHex("nonsense")).toBeNull();
  });
});

describe("barLook", () => {
  it("lays the native bar out right to left in an Arabic or Urdu interface", () => {
    expect(barLook("rtl", false)).toEqual({ dir: "rtl", style: "dark" });
  });

  it("lays it out left to right otherwise, and follows the app's light theme", () => {
    expect(barLook("ltr", true)).toEqual({ dir: "ltr", style: "light" });
    expect(barLook("", false)).toEqual({ dir: "ltr", style: "dark" });
  });
});

describe("nativeBarHidden", () => {
  it("keeps the bar in place on every page of a phone, the Mushaf included", () => {
    expect(nativeBarHidden({ narrow: true, immersive: false })).toBe(false);
  });

  it("steps aside in focus mode and where the side menu shows", () => {
    expect(nativeBarHidden({ narrow: true, immersive: true })).toBe(true);
    expect(nativeBarHidden({ narrow: false, immersive: false })).toBe(true);
  });
});
