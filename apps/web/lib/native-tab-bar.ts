"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The iPhone app's tab bar is Apple's own UITabBar (Liquid Glass on iOS 26),
 * drawn natively over the web view by the NativeTabBar plugin
 * (apps/mobile/ios/App/App/NativeTabBarPlugin.swift). The web app keeps the
 * state: it shows the bar, keeps its active tab in step with the page, hides
 * it in the Mushaf and wherever the side menu shows (iPad, a landscape
 * phone), and turns a native tap into the same navigation as a web tab.
 * While it is up, `html.qb-native-tabbar` hides the web-drawn bar.
 * Safari on iPhone and Android keep the web bar (features/shell/mobile-tab-bar.tsx).
 */

export interface NativeTab {
  id: string;
  title: string;
  /** An SF Symbol name. */
  symbol: string;
}

interface NativeTabBarPlugin {
  show(options: { tabs: NativeTab[]; active: string; tint: string }): Promise<void>;
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

/** The gold token as the native tint (it follows the light and dark themes). */
function goldTint(): string {
  const probe = document.createElement("span");
  probe.style.color = "var(--gold-text)";
  probe.style.display = "none";
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return rgbToHex(color) ?? "#c9a24a";
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
  const shownRef = useRef<{ shown: boolean; active: string | null }>({ shown: false, active: null });
  const tabsRef = useRef(options.tabs);
  tabsRef.current = options.tabs;
  const onSelectRef = useRef(options.onSelect);
  onSelectRef.current = options.onSelect;
  const tabsKey = options.tabs.map((tab) => `${tab.id}:${tab.title}`).join("|");
  const tabsKeyRef = useRef(tabsKey);
  tabsKeyRef.current = tabsKey;
  // What the native bar was last drawn with, to redraw only on a real change.
  const drawnRef = useRef<{ key: string; tint: string } | null>(null);

  useEffect(() => setAvailable(nativeTabBarAvailable()), []);

  // While the native bar is in use: hide the web one, and listen for taps.
  useEffect(() => {
    if (!available) return;
    const root = document.documentElement;
    root.classList.add(NATIVE_TABBAR_CLASS);
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
    void plugin()
      .then((bar) => {
        if (action.kind === "show") {
          const tint = goldTint();
          drawnRef.current = { key: tabsKeyRef.current, tint };
          return bar.show({ tabs: tabsRef.current, active: options.active, tint });
        }
        if (action.kind === "hide") return bar.hide();
        return bar.setActive({ id: action.id });
      })
      .catch(() => undefined);
  }, [available, options.hidden, options.active]);

  // New labels (a language change) or a new gold (a theme change): draw it again.
  useEffect(() => {
    if (!available) return;
    const redraw = () => {
      const shown = shownRef.current;
      if (!shown.shown || !shown.active) return;
      const active = shown.active;
      const tint = goldTint();
      const drawn = drawnRef.current;
      if (drawn && drawn.key === tabsKey && drawn.tint === tint) return;
      drawnRef.current = { key: tabsKey, tint };
      void plugin()
        .then((bar) => bar.show({ tabs: tabsRef.current, active, tint }))
        .catch(() => undefined);
    };
    redraw();
    // The light theme is a class on <body> (use-theme-mode.ts).
    const observer = new MutationObserver(redraw);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [available, tabsKey]);

  return available;
}
