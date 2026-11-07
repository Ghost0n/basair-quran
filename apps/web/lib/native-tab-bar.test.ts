import { afterEach, describe, expect, it, vi } from "vitest";

import { barLook, nativeBarMode, nativeTabBarAction, nativeTabBarAvailable, rgbToHex } from "./native-tab-bar";

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
  const base = {
    available: true,
    want: "tabs" as const,
    shown: null,
    active: "search",
    shownActive: null,
    dockKey: null,
    shownDockKey: null,
  };

  it("never shows the bar when it is not available", () => {
    expect(nativeTabBarAction({ ...base, available: false })).toEqual({ kind: "none" });
  });

  it("shows the tabs outside the Mushaf, from nothing or from the dock", () => {
    expect(nativeTabBarAction(base)).toEqual({ kind: "show" });
    expect(nativeTabBarAction({ ...base, shown: "dock", shownDockKey: "k" })).toEqual({ kind: "show" });
  });

  it("turns the tabs into the dock in the Mushaf, and redraws the dock when it changes", () => {
    const docking = { ...base, want: "dock" as const, active: "reader", dockKey: "k1" };
    expect(nativeTabBarAction({ ...docking, shown: "tabs", shownActive: "reader" })).toEqual({ kind: "dock" });
    expect(nativeTabBarAction({ ...docking, shown: "dock", shownDockKey: "k1" })).toEqual({ kind: "none" });
    expect(nativeTabBarAction({ ...docking, shown: "dock", shownDockKey: "k0" })).toEqual({ kind: "dock" });
  });

  it("waits for the dock to be read before turning into it", () => {
    expect(nativeTabBarAction({ ...base, want: "dock", shown: "tabs", shownActive: "reader", active: "reader" })).toEqual({ kind: "none" });
  });

  it("puts whatever shows away when hidden, and does nothing more", () => {
    expect(nativeTabBarAction({ ...base, want: "hidden", shown: "tabs", shownActive: "search" })).toEqual({ kind: "hide" });
    expect(nativeTabBarAction({ ...base, want: "hidden", shown: "dock", shownDockKey: "k" })).toEqual({ kind: "hide" });
    expect(nativeTabBarAction({ ...base, want: "hidden" })).toEqual({ kind: "none" });
  });

  it("moves the active tab when the page changes", () => {
    expect(nativeTabBarAction({ ...base, shown: "tabs", shownActive: "home" })).toEqual({ kind: "setActive", id: "search" });
    expect(nativeTabBarAction({ ...base, shown: "tabs", shownActive: "search" })).toEqual({ kind: "none" });
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

describe("nativeBarMode", () => {
  it("shows the tabs on every page of a phone outside the Mushaf", () => {
    expect(nativeBarMode({ narrow: true, reading: false, immersive: false })).toBe("tabs");
  });

  it("becomes the reader's split dock in the Mushaf", () => {
    expect(nativeBarMode({ narrow: true, reading: true, immersive: false })).toBe("dock");
  });

  it("steps aside in focus mode and where the side menu shows", () => {
    expect(nativeBarMode({ narrow: true, reading: true, immersive: true })).toBe("hidden");
    expect(nativeBarMode({ narrow: false, reading: false, immersive: false })).toBe("hidden");
  });
});
