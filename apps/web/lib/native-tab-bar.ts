"use client";

import { useEffect, useRef, useState } from "react";

import { clickDockItem, dockKey, NATIVE_DOCK_CLASS, nativeDockPayload, type NativeDockPayload, type ReaderDock } from "./native-dock";
import { nativeTabsPayload, type NativeTabPayload, type TabGlyph } from "./native-tab-icons";

/**
 * The iPhone app's tab bar is Apple's own UITabBar (Liquid Glass on iOS 26),
 * drawn natively over the web view by the NativeTabBar plugin
 * (apps/mobile/ios/App/App/NativeTabBarPlugin.swift). The web app keeps the
 * state: it shows the bar, keeps its active tab in step with the page, turns
 * it into the reader's dock in the Mushaf (lib/native-dock.ts), hides it under a sheet and wherever the side menu
 * shows (iPad, a landscape phone), and turns a native tap into the same navigation as a web tab.
 * Once it has drawn, `html.qb-native-tabbar` hides the web-drawn bar, and
 * `--qb-native-tabbar-h` on <html> holds its height (the room screens keep
 * above it). The native bar answers `show` with the height it drew; if it
 * drew nothing or failed, the web bar comes back.
 * Safari on iPhone and Android keep the web bar (features/shell/mobile-tab-bar.tsx).
 */

export interface NativeTab {
  id: string;
  title: string;
  /** An SF Symbol name: the fallback when the app's own icon cannot be drawn. */
  symbol: string;
  /** The app's own icon (lib/native-tab-icons.ts). */
  glyph?: TabGlyph;
}

interface NativeTabBarPlugin {
  /** Resolves with the height the bar was drawn at (points, the web's CSS pixels). */
  show(options: { tabs: NativeTabPayload[]; active: string; tint: string } & BarLook): Promise<{ height?: number } | undefined>;
  setActive(options: { id: string }): Promise<void>;
  /**
   * Turns the bar into the reader's dock (or redraws the dock). Resolves with
   * `shown: false` where the native dock is not supported (before iOS 26).
   */
  dock(options: NativeDockPayload & { tabs: NativeTabPayload[]; active: string; tint: string } & BarLook): Promise<{ shown?: boolean } | undefined>;
  hide(): Promise<void>;
  addListener(
    event: "tabSelected" | "dockTapped",
    callback: (event: { id?: string; key?: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

interface CapacitorGlobal {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
}

const PLUGIN = "NativeTabBar";
export const NATIVE_TABBAR_CLASS = "qb-native-tabbar";
export const NATIVE_TABBAR_HEIGHT = "--qb-native-tabbar-h";

/** Whether `show`'s answer says the bar is really on screen. */
export function nativeBarDrawn(result: { height?: number } | undefined | null): boolean {
  return typeof result?.height === "number" && result.height > 0;
}

/** True in the installed iPhone app when the native plugin is registered. */
export function nativeTabBarAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  if (!cap?.isNativePlatform?.() || cap.getPlatform?.() !== "ios") return false;
  return Boolean(cap.isPluginAvailable?.(PLUGIN));
}

export type NativeTabBarAction =
  | { kind: "none" }
  | { kind: "show" }
  | { kind: "dock" }
  | { kind: "hide" }
  | { kind: "setActive"; id: string };

/** What the page wants of the native bar: its tabs, the reader's dock, or nothing. */
export type NativeBarMode = "tabs" | "dock" | "hidden";

/** What the native bar must do next, from what the page wants and what is shown. */
export function nativeTabBarAction(state: {
  available: boolean;
  want: NativeBarMode;
  shown: "tabs" | "dock" | null;
  active: string;
  shownActive: string | null;
  /** What the dock shows (null until the page's dock has been read). */
  dockKey: string | null;
  shownDockKey: string | null;
}): NativeTabBarAction {
  if (!state.available) return { kind: "none" };
  if (state.want === "hidden") return state.shown ? { kind: "hide" } : { kind: "none" };
  if (state.want === "dock") {
    if (!state.dockKey) return { kind: "none" };
    return state.shown === "dock" && state.shownDockKey === state.dockKey ? { kind: "none" } : { kind: "dock" };
  }
  if (state.shown !== "tabs") return { kind: "show" };
  if (state.active !== state.shownActive) return { kind: "setActive", id: state.active };
  return { kind: "none" };
}

/** A computed CSS colour (`rgb()`, `rgba()` or `color(srgb …)`) as `#rrggbb`, or null. */
export function rgbToHex(color: string): string | null {
  let channels: number[] | null = null;
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(color);
  if (rgb) channels = [rgb[1], rgb[2], rgb[3]].map(Number);
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(color);
  if (srgb) channels = [srgb[1], srgb[2], srgb[3]].map((value) => Number(value) * 255);
  if (!channels || channels.some((value) => Number.isNaN(value))) return null;
  return `#${channels.map((value) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0")).join("")}`;
}

/** How the native bar is laid out and lit: the interface's direction and the app's theme. */
export type BarLook = { dir: "rtl" | "ltr"; style: "light" | "dark" };

/**
 * The bar follows the web app, not the phone: its tabs run right to left in
 * an Arabic or Urdu interface (the app bundle itself is English-only, so
 * UIKit alone would lay them out left to right), and it takes the app's
 * light or dark theme whatever the phone's own appearance.
 */
export function barLook(dir: string, light: boolean): BarLook {
  return { dir: dir === "rtl" ? "rtl" : "ltr", style: light ? "light" : "dark" };
}

function currentLook(): BarLook {
  // The light theme is a class on <body> (use-theme-mode.ts).
  return barLook(document.documentElement.dir, document.body.classList.contains("light"));
}

/** The gold token as the native tint (it follows the light and dark themes). */
function goldTint(): string {
  const probe = document.createElement("span");
  probe.style.color = "var(--gold-text)";
  probe.style.display = "none";
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  // Unreadable: no tint is sent, and the native bar keeps the one it has.
  return rgbToHex(color) ?? "";
}

/**
 * The plugin, wrapped: Capacitor's plugin is a Proxy that answers every
 * property with a native call, `then` included, so a promise resolved with
 * it bare takes it for a promise, calls a native `then` that never answers,
 * and waits forever (the iPhone app's bar never showed).
 */
let pluginPromise: Promise<{ bar: NativeTabBarPlugin }> | null = null;
function plugin(): Promise<{ bar: NativeTabBarPlugin }> {
  pluginPromise ??= import("@capacitor/core").then(({ registerPlugin }) => ({ bar: registerPlugin<NativeTabBarPlugin>(PLUGIN) }));
  return pluginPromise;
}

/**
 * What the native bar shows. On a phone: its tabs, and in the Mushaf the
 * reader's dock it turns into (its Home part pulls away as the round button,
 * the rest becomes the toolbox). Focus mode, which hides all of the reader's
 * chrome, and the side menu of wider screens put it away.
 */
export function nativeBarMode(state: { narrow: boolean; reading: boolean; immersive: boolean }): NativeBarMode {
  if (!state.narrow || state.immersive) return "hidden";
  return state.reading ? "dock" : "tabs";
}

/** A sheet or dialog is open: its own layer, which the native bar must not cover. */
export function modalOpen(root: ParentNode = document): boolean {
  return root.querySelector('[aria-modal="true"]') !== null;
}

/**
 * Whether a sheet or dialog is open. The native bar is drawn over the web
 * view, so no web layer can cover it: it steps aside while one is open, as
 * an iOS sheet covers the tab bar.
 */
function useModalOpen(enabled: boolean): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const check = () => setOpen(modalOpen());
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal"] });
    return () => observer.disconnect();
  }, [enabled]);
  return enabled && open;
}

/**
 * Drives the native bar from the shell. Returns whether it is in use (the
 * web bar then renders nothing visible). `onSelect` receives a tab id.
 *
 * `mode` says what the page wants: the tabs, the reader's dock (the tabs
 * turning into it, iOS 26: lib/native-dock.ts) or nothing. Where the native
 * dock is not supported (before iOS 26) the bar simply steps aside in the
 * Mushaf and the web dock shows, as before.
 */
export function useNativeTabBar(options: {
  tabs: NativeTab[];
  active: string;
  mode: NativeBarMode;
  /** The reader's dock as the page shows it (lib/native-dock.ts), in the Mushaf. */
  dock: ReaderDock | null;
  onSelect: (id: string) => void;
}): boolean {
  const [available, setAvailable] = useState(false);
  // The native bar drew nothing or failed: the web bar is used instead.
  const [failed, setFailed] = useState(false);
  // The native dock: unknown until first asked, then supported or not.
  const [dockSupported, setDockSupported] = useState<boolean | null>(null);
  const shownRef = useRef<{ shown: "tabs" | "dock" | null; active: string | null; dockKey: string | null }>({
    shown: null,
    active: null,
    dockKey: null,
  });
  const tabsRef = useRef(options.tabs);
  tabsRef.current = options.tabs;
  const dockRef = useRef(options.dock);
  dockRef.current = options.dock;
  const onSelectRef = useRef(options.onSelect);
  onSelectRef.current = options.onSelect;
  const tabsKey = options.tabs.map((tab) => `${tab.id}:${tab.title}`).join("|");
  const tabsKeyRef = useRef(tabsKey);
  tabsKeyRef.current = tabsKey;
  // What the tabs were last drawn with, to redraw them only on a real change.
  const drawnRef = useRef<{ key: string; tint: string; look: string } | null>(null);

  const covered = useModalOpen(available);
  // The look (theme, gold, direction): a change redraws the tabs or the dock.
  const look = useLookKey(available);

  useEffect(() => {
    const ok = nativeTabBarAvailable() && !failed;
    setAvailable(ok);
  }, [failed]);

  // The answer to every `show`: on screen (the web bar steps aside and its
  // height is kept), or not (the web bar stays).
  const onShown = (result: { height?: number } | undefined) => {
    if (!nativeBarDrawn(result)) {
      setFailed(true);
      return;
    }
    const root = document.documentElement;
    root.style.setProperty(NATIVE_TABBAR_HEIGHT, `${result!.height}px`);
    root.classList.add(NATIVE_TABBAR_CLASS);
  };
  const onShowFailed = () => {
    setFailed(true);
  };

  // While the native bar is in use: listen for taps (the web bar steps
  // aside only once the native one has drawn, in onShown).
  useEffect(() => {
    if (!available) return;
    const root = document.documentElement;
    const removers: (() => void)[] = [];
    let cancelled = false;
    const listen = (event: "tabSelected" | "dockTapped", callback: (data: { id?: string; key?: string }) => void) =>
      plugin()
        .then(({ bar }) => bar.addListener(event, callback))
        .then((handle) => {
          if (cancelled) void handle.remove();
          else removers.push(() => void handle.remove());
        })
        .catch(() => undefined);
    void listen("tabSelected", ({ id }) => {
      if (id) onSelectRef.current(id);
    });
    // A tap on the native dock presses the page's own button.
    void listen("dockTapped", ({ key }) => {
      if (key) clickDockItem(document, key);
    });
    return () => {
      cancelled = true;
      removers.forEach((remove) => remove());
      root.classList.remove(NATIVE_TABBAR_CLASS, NATIVE_DOCK_CLASS);
      root.style.removeProperty(NATIVE_TABBAR_HEIGHT);
      shownRef.current = { shown: null, active: null, dockKey: null };
      void plugin()
        .then(({ bar }) => bar.hide())
        .catch(() => undefined);
    };
  }, [available]);

  // What the page wants: the dock only where the native dock is supported.
  const dockWanted = options.mode === "dock" && dockSupported !== false;
  const want: NativeBarMode = covered || (options.mode === "dock" && !dockWanted) ? "hidden" : options.mode;
  // Drawn once the look is known, not first without it and again with it.
  const dockKeyNow = options.dock && look ? `${dockKey(options.dock)}|${look}` : null;

  // The web dock steps aside (in place, unseen) while the native one stands for it.
  useEffect(() => {
    if (!available) return;
    document.documentElement.classList.toggle(NATIVE_DOCK_CLASS, dockWanted);
  }, [available, dockWanted]);

  // Show the tabs or the dock, hide, or move the active tab as the page changes.
  useEffect(() => {
    const shown = shownRef.current;
    const action = nativeTabBarAction({
      available,
      want,
      shown: shown.shown,
      active: options.active,
      shownActive: shown.active,
      dockKey: dockKeyNow,
      shownDockKey: shown.dockKey,
    });
    if (action.kind === "none") return;
    if (action.kind === "hide") shownRef.current = { shown: null, active: null, dockKey: null };
    else if (action.kind === "dock") shownRef.current = { shown: "dock", active: options.active, dockKey: dockKeyNow };
    else shownRef.current = { shown: "tabs", active: options.active, dockKey: null };
    // What a "show" or a "dock" draws is settled now, before the redraw effect
    // below runs, so the bar is not drawn a second time on start.
    const drawing = action.kind === "show" || action.kind === "dock";
    const tint = drawing ? goldTint() : "";
    const barLookNow = drawing ? currentLook() : null;
    if (action.kind === "show" && barLookNow) {
      drawnRef.current = { key: tabsKeyRef.current, tint, look: `${barLookNow.dir}:${barLookNow.style}` };
    }
    const dock = dockRef.current;
    void plugin()
      .then(({ bar }) => {
        if (action.kind === "show" && barLookNow) {
          return bar.show({ tabs: nativeTabsPayload(tabsRef.current, tint), active: options.active, tint, ...barLookNow }).then(onShown);
        }
        if (action.kind === "dock" && barLookNow) {
          if (!dock) return undefined;
          return bar
            .dock({
              ...nativeDockPayload(dock, tint),
              // The tabs it turns back into, should the bar not have them yet.
              tabs: nativeTabsPayload(tabsRef.current, tint),
              active: options.active,
              tint,
              ...barLookNow,
            })
            .then((result) => {
              if (result?.shown) {
                setDockSupported(true);
                return undefined;
              }
              // Not supported (before iOS 26): the web dock shows instead.
              shownRef.current = { shown: null, active: null, dockKey: null };
              setDockSupported(false);
              return bar.hide();
            });
        }
        if (action.kind === "hide") return bar.hide();
        if (action.kind === "setActive") return bar.setActive({ id: action.id });
        return undefined;
      })
      .catch(() => {
        if (action.kind === "show") onShowFailed();
        if (action.kind === "dock") {
          shownRef.current = { shown: null, active: null, dockKey: null };
          setDockSupported(false);
        }
      });
  }, [available, want, options.active, dockKeyNow]);

  // New labels or direction (a language change), or a new gold and look (a
  // theme change): draw the tabs again (the dock redraws through its key).
  useEffect(() => {
    if (!available) return;
    const shown = shownRef.current;
    if (shown.shown !== "tabs" || !shown.active) return;
    const active = shown.active;
    const tint = goldTint();
    const barLookNow = currentLook();
    const lookKey = `${barLookNow.dir}:${barLookNow.style}`;
    const drawn = drawnRef.current;
    if (drawn && drawn.key === tabsKey && drawn.tint === tint && drawn.look === lookKey) return;
    drawnRef.current = { key: tabsKey, tint, look: lookKey };
    void plugin()
      .then(({ bar }) => bar.show({ tabs: nativeTabsPayload(tabsRef.current, tint), active, tint, ...barLookNow }))
      .then(onShown)
      .catch(onShowFailed);
  }, [available, tabsKey, look]);

  return available;
}

/**
 * The app's look as one string — the theme (a class on <body>,
 * use-theme-mode.ts), the gold and the direction (<html dir>) — kept in step.
 */
function useLookKey(enabled: boolean): string {
  const [key, setKey] = useState("");
  useEffect(() => {
    if (!enabled) return;
    const read = () => {
      const look = currentLook();
      setKey(`${look.dir}:${look.style}:${goldTint()}`);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["dir"] });
    return () => observer.disconnect();
  }, [enabled]);
  return key;
}
