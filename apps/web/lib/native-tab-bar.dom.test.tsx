// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const bar = vi.hoisted(() => ({
  show: vi.fn(async (_options: { tint: string }): Promise<{ height?: number } | undefined> => ({ height: 83 })),
  setActive: vi.fn(async () => undefined),
  hide: vi.fn(async () => undefined),
  dock: vi.fn(async (_options: { items: unknown[] }): Promise<{ shown?: boolean } | undefined> => ({ shown: true })),
  listeners: {} as Record<string, (event: { id?: string; key?: string }) => void>,
  addListener: vi.fn(async (event: string, callback: (event: { id?: string; key?: string }) => void) => {
    bar.listeners[event] = callback;
    return { remove: async () => undefined };
  }),
}));
// As Capacitor's own: the plugin is a Proxy that answers every property with
// a native call, `then` included (that call never answers). Resolving a
// promise with it waited forever, and the iPhone app's bar never showed.
vi.mock("@capacitor/core", () => ({
  registerPlugin: () =>
    new Proxy(bar, {
      get: (target, prop) =>
        prop in target ? target[prop as keyof typeof target] : () => new Promise(() => undefined),
    }),
}));

import { readReaderDock, type ReaderDock } from "./native-dock";
import { useNativeTabBar } from "./native-tab-bar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TABS = [
  { id: "home", title: "Home", symbol: "house" },
  { id: "reader", title: "Mushaf", symbol: "book" },
];
function Probe({ mode = "tabs", dock = null }: { mode?: "tabs" | "dock" | "hidden"; dock?: ReaderDock | null }) {
  useNativeTabBar({ tabs: TABS, active: mode === "dock" ? "reader" : "home", mode, dock, onSelect: () => undefined });
  return null;
}

let root: Root;
let host: HTMLElement;
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete (window as { Capacitor?: unknown }).Capacitor;
  document.documentElement.classList.remove("qb-native-tabbar", "qb-native-dock");
  document.body.querySelectorAll(".qb-reader-dock, .qb-reader-back").forEach((element) => element.remove());
  bar.dock.mockClear();
  bar.dock.mockImplementation(async () => ({ shown: true }));
  document.documentElement.style.removeProperty("--qb-native-tabbar-h");
  bar.show.mockClear();
  bar.hide.mockClear();
  bar.show.mockImplementation(async () => ({ height: 83 }));
});

function inTheApp() {
  (window as { Capacitor?: unknown }).Capacitor = {
    getPlatform: () => "ios",
    isNativePlatform: () => true,
    isPluginAvailable: (name: string) => name === "NativeTabBar",
  };
}

async function mount(props: { mode?: "tabs" | "dock" | "hidden"; dock?: ReaderDock | null } = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<Probe {...props} />));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

/** The reader's web dock, as reader-bar.tsx renders it (two buttons and the round one). */
function webDock(): ReaderDock {
  const dock = document.createElement("div");
  dock.className = "qb-reader-bar qb-reader-dock";
  dock.innerHTML = `<button class="act labelled display-btn" aria-label="Display"><span class="lbl">Display</span></button><button class="act labelled play-btn" aria-label="Recite"><span class="lbl">Recite</span></button>`;
  const back = document.createElement("button");
  back.className = "qb-reader-back is-home";
  back.setAttribute("aria-label", "Home");
  document.body.append(dock, back);
  return readReaderDock(document, "ltr")!;
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

  it("keeps the web bar while the native bar has not answered", async () => {
    bar.show.mockImplementation(() => new Promise(() => undefined));
    inTheApp();
    await mount();
    expect(bar.show).toHaveBeenCalledTimes(1);
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

  it("turns into the native dock in the Mushaf, the web dock kept in place but unseen", async () => {
    inTheApp();
    await mount({ mode: "dock", dock: webDock() });
    expect(bar.dock).toHaveBeenCalledTimes(1);
    expect(bar.dock.mock.calls[0]?.[0].items).toHaveLength(2);
    expect(document.documentElement.classList.contains("qb-native-dock")).toBe(true);
  });

  it("keeps the web dock where the native dock is not supported (before iOS 26)", async () => {
    bar.dock.mockImplementation(async () => ({ shown: false }));
    inTheApp();
    await mount({ mode: "dock", dock: webDock() });
    expect(document.documentElement.classList.contains("qb-native-dock")).toBe(false);
    expect(bar.hide).toHaveBeenCalled();
  });

  it("presses the page's own button for a tap on the native dock", async () => {
    inTheApp();
    const dock = webDock();
    const onDisplay = vi.fn();
    const onHome = vi.fn();
    document.querySelector(".display-btn")!.addEventListener("click", onDisplay);
    document.querySelector(".qb-reader-back")!.addEventListener("click", onHome);
    await mount({ mode: "dock", dock });
    await act(async () => {
      bar.listeners.dockTapped?.({ key: "0" });
      bar.listeners.dockTapped?.({ key: "lead" });
    });
    expect(onDisplay).toHaveBeenCalledTimes(1);
    expect(onHome).toHaveBeenCalledTimes(1);
  });

  it("steps aside while a sheet or dialog is open, and comes back after", async () => {
    inTheApp();
    await mount();
    expect(bar.show).toHaveBeenCalledTimes(1);
    const sheet = document.createElement("div");
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    await act(async () => {
      document.body.appendChild(sheet);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(bar.hide).toHaveBeenCalledTimes(1);
    // The web bar stays hidden: the native one only stepped aside.
    expect(document.documentElement.classList.contains("qb-native-tabbar")).toBe(true);
    await act(async () => {
      sheet.remove();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(bar.show).toHaveBeenCalledTimes(2);
  });
});
