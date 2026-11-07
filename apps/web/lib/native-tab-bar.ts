"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The iPhone app's tab bar is Apple's own UITabBar (Liquid Glass on iOS 26),
 * drawn natively over the web view by the NativeTabBar plugin
 * (apps/mobile/ios/App/App/NativeTabBarPlugin.swift). The web app keeps the
 * state: it shows the bar, keeps its active tab in step with the page, hides
 * it in the Mushaf and wherever the side menu shows (iPad, a landscape
 * phone), and turns a native tap into the same navigation as a web tab.
 * Once it has drawn, `html.qb-native-tabbar` hides the web-drawn bar, and
 * `--qb-native-tabbar-h` on <html> holds its height (the room screens keep
 * above it). The native bar answers `show` with the height it drew; if it
 * drew nothing or failed, the web bar comes back.
 * Safari on iPhone and Android keep the web bar (features/shell/mobile-tab-bar.tsx).
 */

export interface NativeTab {
  id: string;
  title: string;
  /** An SF Symbol name. */
  symbol: string;
}

interface NativeTabBarPlugin {
  /** Resolves with the height the bar was drawn at (points, the web's CSS pixels). */
  show(options: { tabs: NativeTab[]; active: string; tint: string } & BarLook): Promise<{ height?: number } | undefined>;
  setActive(options: { id: string }): Promise<void>;
  hide(): Promise<void>;
  addListener(event: "tabSelected", callback: (event: { id: string }) => void): Promise<{ remove: () => Promise<void> }>;
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

export type NativeTabBarAction = { kind: "none" } | { kind: "show" } | { kind: "hide" } | { kind: "setActive"; id: string };

/** What the native bar must do next, from what the page wants and what is shown. */
export function nativeTabBarAction(state: {
  available: boolean;
  hidden: boolean;
  shown: boolean;
  active: string;
  shownActive: string | null;
}): NativeTabBarAction {
  if (!state.available) return { kind: "none" };
  if (state.hidden) return state.shown ? { kind: "hide" } : { kind: "none" };
  if (!state.shown) return { kind: "show" };
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
 * What happened to the native bar, step by step (the iPhone app's diagnostic,
 * features/shell/tabbar-diagnostic.tsx, shows it when the bar did not draw).
 */
export const nativeTabBarTrace: string[] = [];
function trace(step: string): void {
  nativeTabBarTrace.push(`${Math.round(performance.now())}ms ${step}`);
  if (nativeTabBarTrace.length > 24) nativeTabBarTrace.shift();
}

/** The height the native bar last drew at, or 0 while it has not. */
export function nativeTabBarDrawnHeight(): number {
  if (typeof document === "undefined") return 0;
  return document.documentElement.classList.contains(NATIVE_TABBAR_CLASS)
    ? Number.parseFloat(document.documentElement.style.getPropertyValue(NATIVE_TABBAR_HEIGHT)) || 0
    : 0;
}

let pluginPromise: Promise<NativeTabBarPlugin> | null = null;
function plugin(): Promise<NativeTabBarPlugin> {
  pluginPromise ??= import("@capacitor/core").then(({ registerPlugin }) => registerPlugin<NativeTabBarPlugin>(PLUGIN));
  return pluginPromise;
}

/**
 * Drives the native bar from the shell. Returns whether it is in use (the
 * web bar then renders nothing visible). `onSelect` receives a tab id.
 */
export function useNativeTabBar(options: {
  tabs: NativeTab[];
  active: string;
  hidden: boolean;
  onSelect: (id: string) => void;
}): boolean {
  const [available, setAvailable] = useState(false);
  // The native bar drew nothing or failed: the web bar is used instead.
  const [failed, setFailed] = useState(false);
  const shownRef = useRef<{ shown: boolean; active: string | null }>({ shown: false, active: null });
  const tabsRef = useRef(options.tabs);
  tabsRef.current = options.tabs;
  const onSelectRef = useRef(options.onSelect);
  onSelectRef.current = options.onSelect;
  const tabsKey = options.tabs.map((tab) => `${tab.id}:${tab.title}`).join("|");
  const tabsKeyRef = useRef(tabsKey);
  tabsKeyRef.current = tabsKey;
  // What the native bar was last drawn with, to redraw only on a real change.
  const drawnRef = useRef<{ key: string; tint: string; look: string } | null>(null);

  useEffect(() => {
    const ok = nativeTabBarAvailable() && !failed;
    trace(`available=${ok}${failed ? " (failed before)" : ""}`);
    setAvailable(ok);
  }, [failed]);

  // The answer to every `show`: on screen (the web bar steps aside and its
  // height is kept), or not (the web bar stays).
  const onShown = (result: { height?: number } | undefined) => {
    trace(`show answered ${JSON.stringify(result ?? null)}`);
    if (!nativeBarDrawn(result)) {
      setFailed(true);
      return;
    }
    const root = document.documentElement;
    root.style.setProperty(NATIVE_TABBAR_HEIGHT, `${result!.height}px`);
    root.classList.add(NATIVE_TABBAR_CLASS);
  };
  const onShowFailed = (error: unknown) => {
    trace(`show failed: ${error instanceof Error ? error.message : String(error)}`);
    setFailed(true);
  };

  // While the native bar is in use: listen for taps (the web bar steps
  // aside only once the native one has drawn, in onShown).
  useEffect(() => {
    if (!available) return;
    const root = document.documentElement;
    let removeListener: (() => void) | null = null;
    let cancelled = false;
    void plugin()
      .then((bar) => bar.addListener("tabSelected", ({ id }) => onSelectRef.current(id)))
      .then((handle) => {
        if (cancelled) void handle.remove();
        else removeListener = () => void handle.remove();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      removeListener?.();
      root.classList.remove(NATIVE_TABBAR_CLASS);
      root.style.removeProperty(NATIVE_TABBAR_HEIGHT);
      shownRef.current = { shown: false, active: null };
      void plugin()
        .then((bar) => bar.hide())
        .catch(() => undefined);
    };
  }, [available]);

  // Show, hide or move the active tab as the page changes.
  useEffect(() => {
    const shown = shownRef.current;
    const action = nativeTabBarAction({
      available,
      hidden: options.hidden,
      shown: shown.shown,
      active: options.active,
      shownActive: shown.active,
    });
    if (action.kind === "none") return;
    if (action.kind === "hide") shownRef.current = { shown: false, active: null };
    else shownRef.current = { shown: true, active: options.active };
    // What a "show" draws is settled now, before the redraw effect below
    // runs, so the bar is not drawn a second time on start.
    let drawing: { tint: string; look: BarLook } | null = null;
    trace(`action ${action.kind}${action.kind === "setActive" ? ` ${action.id}` : ""}`);
    if (action.kind === "show") {
      drawing = { tint: goldTint(), look: currentLook() };
      drawnRef.current = { key: tabsKeyRef.current, tint: drawing.tint, look: `${drawing.look.dir}:${drawing.look.style}` };
    }
    void plugin()
      .then((bar) => {
        if (action.kind === "show") {
          return drawing
            ? bar.show({ tabs: tabsRef.current, active: options.active, tint: drawing.tint, ...drawing.look }).then(onShown)
            : undefined;
        }
        if (action.kind === "hide") return bar.hide();
        return bar.setActive({ id: action.id });
      })
      .catch((error: unknown) => {
        if (action.kind === "show") onShowFailed(error);
      });
  }, [available, options.hidden, options.active]);

  // New labels or direction (a language change), or a new gold and look (a
  // theme change): draw it again.
  useEffect(() => {
    if (!available) return;
    const redraw = () => {
      const shown = shownRef.current;
      if (!shown.shown || !shown.active) return;
      const active = shown.active;
      const tint = goldTint();
      const look = currentLook();
      const lookKey = `${look.dir}:${look.style}`;
      const drawn = drawnRef.current;
      if (drawn && drawn.key === tabsKey && drawn.tint === tint && drawn.look === lookKey) return;
      drawnRef.current = { key: tabsKey, tint, look: lookKey };
      void plugin()
        .then((bar) => bar.show({ tabs: tabsRef.current, active, tint, ...look }))
        .then(onShown)
        .catch(onShowFailed);
    };
    redraw();
    // The light theme is a class on <body> (use-theme-mode.ts); the direction is <html dir>.
    const observer = new MutationObserver(redraw);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["dir"] });
    return () => observer.disconnect();
  }, [available, tabsKey]);

  return available;
}
