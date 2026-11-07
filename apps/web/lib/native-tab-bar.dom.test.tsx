// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const bar = vi.hoisted(() => ({
  show: vi.fn(async (_options: { tint: string }): Promise<{ height?: number } | undefined> => ({ height: 83 })),
  setActive: vi.fn(async () => undefined),
  hide: vi.fn(async () => undefined),
  addListener: vi.fn(async () => ({ remove: async () => undefined })),
}));
vi.mock("@capacitor/core", () => ({ registerPlugin: () => bar }));

import { useNativeTabBar } from "./native-tab-bar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TABS = [
  { id: "home", title: "Home", symbol: "house" },
  { id: "reader", title: "Mushaf", symbol: "book" },
];
function Probe() {
  useNativeTabBar({ tabs: TABS, active: "home", hidden: false, onSelect: () => undefined });
  return null;
}

let root: Root;
let host: HTMLElement;
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete (window as { Capacitor?: unknown }).Capacitor;
  document.documentElement.classList.remove("qb-native-tabbar");
  document.documentElement.style.removeProperty("--qb-native-tabbar-h");
  bar.show.mockClear();
  bar.show.mockImplementation(async () => ({ height: 83 }));
});

function inTheApp() {
  (window as { Capacitor?: unknown }).Capacitor = {
    getPlatform: () => "ios",
    isNativePlatform: () => true,
    isPluginAvailable: (name: string) => name === "NativeTabBar",
  };
}

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<Probe />));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

describe("useNativeTabBar in the iPhone app", () => {
  it("draws the native bar once on start, without a made-up tint when the gold is unreadable", async () => {
    (window as { Capacitor?: unknown }).Capacitor = {
      getPlatform: () => "ios",
      isNativePlatform: () => true,
      isPluginAvailable: (name: string) => name === "NativeTabBar",
    };
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<Probe />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(bar.show).toHaveBeenCalledTimes(1);
    expect(bar.show.mock.calls[0]?.[0].tint).not.toBe("#c9a24a");
  });

  it("keeps the web bar hidden once the native bar is drawn, and publishes its height", async () => {
    inTheApp();
    await mount();
    expect(document.documentElement.classList.contains("qb-native-tabbar")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--qb-native-tabbar-h")).toBe("83px");
  });

  it("brings the web bar back when the native bar draws nothing", async () => {
    bar.show.mockImplementation(async () => ({ height: 0 }));
    inTheApp();
    await mount();
    expect(document.documentElement.classList.contains("qb-native-tabbar")).toBe(false);
  });

  it("brings the web bar back when the native bar fails", async () => {
    bar.show.mockImplementation(async () => {
      throw new Error("No web view to attach the tab bar to");
    });
    inTheApp();
    await mount();
    expect(document.documentElement.classList.contains("qb-native-tabbar")).toBe(false);
  });
});
