import { describe, expect, it } from "vitest";

import { PLATFORM_INIT_SCRIPT, detectPlatform } from "./platform-class";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

describe("detectPlatform", () => {
  it("recognises an iPhone", () => {
    expect(detectPlatform({ ua: IPHONE, maxTouchPoints: 5, native: null })).toBe("ios");
  });

  it("recognises an iPad that reports itself as a Mac", () => {
    expect(detectPlatform({ ua: MAC, maxTouchPoints: 5, native: null })).toBe("ios");
  });

  it("leaves a real Mac alone", () => {
    expect(detectPlatform({ ua: MAC, maxTouchPoints: 0, native: null })).toBeNull();
  });

  it("recognises Android", () => {
    expect(detectPlatform({ ua: ANDROID, maxTouchPoints: 5, native: null })).toBe("android");
  });

  it("leaves Windows alone", () => {
    expect(detectPlatform({ ua: WINDOWS, maxTouchPoints: 0, native: null })).toBeNull();
  });

  it("trusts the native app's platform over the user agent", () => {
    expect(detectPlatform({ ua: WINDOWS, maxTouchPoints: 0, native: "ios" })).toBe("ios");
    expect(detectPlatform({ ua: IPHONE, maxTouchPoints: 5, native: "android" })).toBe("android");
  });
});

/** Runs the before-paint script against a fake page and returns the classes it set. */
function runInitScript(ua: string, maxTouchPoints: number, native: string | null): string[] {
  const classes: string[] = [];
  const document = { documentElement: { classList: { add: (c: string) => classes.push(c) } } };
  const navigator = { userAgent: ua, maxTouchPoints };
  const window = { Capacitor: native ? { getPlatform: () => native } : undefined };
  new Function("window", "document", "navigator", PLATFORM_INIT_SCRIPT)(window, document, navigator);
  return classes;
}

describe("PLATFORM_INIT_SCRIPT", () => {
  it("sets the same platform class as detectPlatform", () => {
    expect(runInitScript(IPHONE, 5, null)).toEqual(["qb-ios"]);
    expect(runInitScript(MAC, 5, null)).toEqual(["qb-ios"]);
    expect(runInitScript(MAC, 0, null)).toEqual([]);
    expect(runInitScript(ANDROID, 5, null)).toEqual(["qb-android"]);
    expect(runInitScript(WINDOWS, 0, "android")).toEqual(["qb-android"]);
  });
});
