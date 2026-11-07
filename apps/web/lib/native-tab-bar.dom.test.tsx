// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const bar = vi.hoisted(() => ({
  show: vi.fn(async (_options: { tint: string }) => undefined),
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
});

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
});
