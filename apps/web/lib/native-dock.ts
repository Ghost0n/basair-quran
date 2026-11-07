"use client";

import { useEffect, useState } from "react";

import { renderGlyph, type GlyphRender, type TabGlyph } from "./native-tab-icons";

/**
 * The reader's dock in the iPhone app on iOS 26: drawn natively in Liquid
 * Glass by the NativeTabBar plugin (apps/mobile/ios/App/App/NativeTabBarPlugin.swift),
 * so that entering the Mushaf the tab bar changes shape rather than giving
 * way to another bar: its Home part pulls away as a drop of glass (the round
 * button) and the rest draws in to become the toolbox.
 *
 * The web dock (reader-bar.tsx) stays the one source of truth: it is still
 * rendered, in place but unseen (`html.qb-native-dock`, reading.web.css), and
 * this module reads it — each button's label, icon and state, in its order —
 * for the native dock to show; a native tap presses the web button itself.
 * So every state of the dock (a tool chosen, the display open, a recitation's
 * controls) reaches the native one without a second copy of its logic.
 */

export type DockItem = {
  /** Its place among the dock's buttons: a native tap names it back. */
  key: string;
  /** The visible label (empty for an icon-only control). */
  label: string;
  /** The accessible name. */
  title: string;
  glyph: TabGlyph | null;
  on: boolean;
  disabled: boolean;
  /** The recitation's play button: a filled gold disc. */
  prominent: boolean;
  /** A changed setting's dot. */
  badge: boolean;
  /** Mirrored, as the page mirrors directional icons. */
  flip: boolean;
};

export type ReaderDock = {
  view: "tools" | "recite";
  /** The round button: the logo (Home) or an arrow back. */
  lead: { title: string; glyph: TabGlyph | null; flip: boolean };
  items: DockItem[];
};

export type NativeDockItemPayload = {
  key: string;
  title: string;
  accessibility: string;
  image?: string;
  on: boolean;
  disabled: boolean;
  prominent: boolean;
  badge: boolean;
};

export type NativeDockPayload = {
  view: ReaderDock["view"];
  lead: { title: string; image?: string; original: boolean };
  items: NativeDockItemPayload[];
};

export const NATIVE_DOCK_CLASS = "qb-native-dock";

const DOCK = ".qb-reader-dock";
const LEAD = ".qb-reader-back";

/** The dock's buttons, in the page's order (a menu or sheet it opened is not part of it). */
function dockButtons(root: ParentNode): HTMLButtonElement[] {
  const dock = root.querySelector(DOCK);
  if (!dock) return [];
  return [...dock.querySelectorAll<HTMLButtonElement>("button")].filter((button) => !button.closest('[role="menu"], [role="dialog"]'));
}

function glyphOf(button: Element): { glyph: TabGlyph | null; flip: boolean } {
  const icon = button.querySelector(".qb-icon");
  const d = icon?.querySelector("path")?.getAttribute("d");
  if (!icon || !d) return { glyph: null, flip: false };
  return { glyph: { kind: "icon", d }, flip: icon.classList.contains("dir-flip") };
}

/** The dock as the page shows it, or null when the reader's dock is not on the page. */
export function readReaderDock(root: ParentNode, dir: "rtl" | "ltr"): ReaderDock | null {
  const dock = root.querySelector(DOCK);
  const lead = root.querySelector<HTMLButtonElement>(LEAD);
  if (!dock || !lead) return null;
  // Directional icons are drawn for right-to-left and mirrored in left-to-right (globals.css).
  const mirrored = dir === "ltr";
  const items = dockButtons(root).map((button, index): DockItem => {
    const { glyph, flip } = glyphOf(button);
    const classes = button.classList;
    return {
      key: String(index),
      label: button.querySelector(".lbl")?.textContent?.trim() ?? "",
      title: button.getAttribute("aria-label") ?? "",
      glyph,
      on:
        classes.contains("on") ||
        classes.contains("is-live") ||
        (classes.contains("on-tool") && !classes.contains("is-idle")) ||
        button.getAttribute("aria-expanded") === "true",
      disabled: button.disabled,
      prominent: classes.contains("play") && button.closest(".qb-ptransport") !== null,
      badge: button.querySelector(".dot") !== null,
      flip: flip && mirrored,
    };
  });
  const leadGlyph = glyphOf(lead);
  return {
    view: dock.classList.contains("is-reciting") ? "recite" : "tools",
    lead: {
      title: lead.getAttribute("aria-label") ?? "",
      // No line icon: the logo.
      glyph: leadGlyph.glyph ?? { kind: "brand" },
      flip: leadGlyph.flip && mirrored,
    },
    items,
  };
}

/** What the native dock shows, as one string: it is redrawn only when this changes. */
export function dockKey(dock: ReaderDock): string {
  return JSON.stringify(dock);
}

/** A native tap: press the web button it stands for (`lead`: the round button). */
export function clickDockItem(root: ParentNode, key: string): void {
  if (key === "lead") {
    root.querySelector<HTMLButtonElement>(LEAD)?.click();
    return;
  }
  const button = dockButtons(root)[Number(key)];
  if (button && !button.disabled) button.click();
}

/** Points, as the tab bar's icons (lib/native-tab-icons.ts). */
const ICON_PT = 25;
const PLAY_PT = 24;
const BRAND_PT = 34;
const STROKE = 1.7;

/** The dock as the plugin takes it: every icon drawn (templates the dock tints; the logo in gold). */
export function nativeDockPayload(dock: ReaderDock, tint: string, render: GlyphRender = renderGlyph): NativeDockPayload {
  const leadGlyph = dock.lead.glyph;
  const brand = leadGlyph?.kind === "brand";
  const leadImage = leadGlyph
    ? render(
        leadGlyph,
        brand ? { size: BRAND_PT, stroke: 0, color: tint || "#d4af37" } : { size: ICON_PT, stroke: STROKE, color: "#000000", flip: dock.lead.flip },
      )
    : null;
  return {
    view: dock.view,
    lead: { title: dock.lead.title, ...(leadImage ? { image: leadImage } : {}), original: brand },
    items: dock.items.map((item) => {
      const image = item.glyph
        ? render(item.glyph, { size: item.prominent ? PLAY_PT : ICON_PT, stroke: item.prominent ? 2 : STROKE, color: "#000000", flip: item.flip })
        : null;
      return {
        key: item.key,
        title: item.label,
        accessibility: item.title,
        ...(image ? { image } : {}),
        on: item.on,
        disabled: item.disabled,
        prominent: item.prominent,
        badge: item.badge,
      };
    }),
  };
}

/**
 * The reader's dock as the page shows it, kept in step while `enabled` (the
 * Mushaf on a phone, in the iPhone app): it follows every change of its
 * buttons, read once per task at most. Not once per frame: the page
 * transition holds frames back while the new page settles, and the native
 * bar would only start turning into the dock after it.
 */
export function useReaderDock(enabled: boolean): ReaderDock | null {
  const [dock, setDock] = useState<ReaderDock | null>(null);
  useEffect(() => {
    if (!enabled) {
      setDock(null);
      return;
    }
    let timer = 0;
    let key = "";
    const read = () => {
      timer = 0;
      const next = readReaderDock(document, document.documentElement.dir === "rtl" ? "rtl" : "ltr");
      const nextKey = next ? dockKey(next) : "";
      if (nextKey === key) return;
      key = nextKey;
      setDock(next);
    };
    read();
    const schedule = () => {
      if (!timer) timer = window.setTimeout(read, 0);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "disabled", "aria-label", "aria-expanded", "aria-pressed", "d"],
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["dir"] });
    return () => {
      observer.disconnect();
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled]);
  return dock;
}
