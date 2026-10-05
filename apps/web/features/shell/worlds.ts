"use client";

import { useEffect, useSyncExternalStore } from "react";

import type { IconName } from "@/components/icon";

import { useShellMode, type ShellMode } from "./mode-context";

import { t } from "@/lib/i18n";

/**
 * The app's three worlds — reading, research, community — each with its own
 * three pages. Home belongs to every world (it keeps the current one); the
 * phone's tab bar shows Home and the current world's pages around the coin
 * that switches worlds, the desktop rail the same around a world switch.
 *
 * Each world borrows one hue of the app's ambient glow: gold, teal, copper
 * (`html[data-world]`, shell/worlds.css).
 */
export type WorldId = "reading" | "research" | "community";

export type WorldTab = {
  id: string;
  mode: ShellMode;
  /** Extra query parameters (null removes one). */
  params?: Record<string, string | null>;
  icon: IconName;
  label: string;
  /** The library reopens where it was left (a board, a research…). */
  resume?: boolean;
};

export type World = { id: WorldId; icon: IconName; label: string; desc: string; tabs: WorldTab[] };

export const WORLD_ORDER: WorldId[] = ["reading", "research", "community"];

export const WORLDS: Record<WorldId, World> = {
  reading: {
    id: "reading",
    icon: "book",
    get label() {
      return t("القراءة");
    },
    get desc() {
      return t("المصحف وما حفظته");
    },
    tabs: [
      { id: "reader", mode: "reading", icon: "book", get label() {
        return t("المصحف");
      } },
      { id: "saved", mode: "saved", icon: "bookmark", get label() {
        return t("المحفوظة");
      } },
      { id: "index", mode: "index", icon: "menu", get label() {
        return t("الفهرس");
      } },
    ],
  },
  research: {
    id: "research",
    icon: "feather",
    get label() {
      return t("البحث");
    },
    get desc() {
      return t("البحث والدراسة والدفتر");
    },
    tabs: [
      { id: "search", mode: "search", icon: "search", get label() {
        return t("البحث");
      } },
      { id: "study", mode: "studio", icon: "sparkles", get label() {
        return t("الدراسة");
      } },
      { id: "notebook", mode: "notebook", icon: "notebook", resume: true, get label() {
        return t("الدفتر");
      } },
    ],
  },
  community: {
    id: "community",
    icon: "users",
    get label() {
      return t("المجتمع");
    },
    get desc() {
      return t("ما يشاركه الباحثون");
    },
    tabs: [
      { id: "feed", mode: "community", params: { tab: null }, icon: "cards", get label() {
        return t("الموجز");
      } },
      { id: "mine", mode: "community", params: { tab: "mine" }, icon: "edit", get label() {
        return t("منشوراتي");
      } },
      { id: "csaved", mode: "community", params: { tab: "saved" }, icon: "bookmark", get label() {
        return t("المحفوظة");
      } },
    ],
  },
};

const MODE_WORLD: Partial<Record<ShellMode, WorldId>> = {
  reading: "reading",
  saved: "reading",
  index: "reading",
  search: "research",
  studio: "research",
  notebook: "research",
  bookmarks: "research",
  history: "research",
  roots: "research",
  heatmap: "research",
  board: "research",
  document: "research",
  community: "community",
  post: "community",
};

/** The world a page belongs to (null: Home and Settings keep the current world). */
export function worldOfMode(mode: ShellMode): WorldId | null {
  return MODE_WORLD[mode] ?? null;
}

const LIBRARY: readonly ShellMode[] = ["notebook", "bookmarks", "history", "roots", "board", "document"];

/** The world tab that lights for this page. */
export function activeTabId(mode: ShellMode, communityTab: string | null): string | null {
  if (mode === "home") return "home";
  if (mode === "community") return communityTab === "mine" ? "mine" : communityTab === "saved" ? "csaved" : "feed";
  if (mode === "post") return "feed";
  if (LIBRARY.includes(mode)) return "notebook";
  for (const world of WORLD_ORDER) {
    const tab = WORLDS[world].tabs.find((item) => item.mode === mode);
    if (tab) return tab.id;
  }
  return null;
}

// ---------- The current world (remembered on this device) ----------

const KEY = "qb.world";
const TABS_KEY = "qb.worldTabs";
const listeners = new Set<() => void>();
let current: WorldId | null = null;

function isWorld(value: unknown): value is WorldId {
  return value === "reading" || value === "research" || value === "community";
}

function read(): WorldId {
  if (current) return current;
  try {
    const stored = window.localStorage.getItem(KEY);
    current = isWorld(stored) ? stored : "reading";
  } catch {
    current = "reading";
  }
  return current;
}

export function setCurrentWorld(world: WorldId): void {
  if (read() === world) return;
  current = world;
  try {
    window.localStorage.setItem(KEY, world);
  } catch {
    /* private mode: the world lasts until reload */
  }
  for (const listener of listeners) listener();
}

export function useCurrentWorld(): WorldId {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => "reading",
  );
}

/** The page last used in each world: changing world reopens it. */
export function lastTabOf(world: WorldId): string {
  try {
    const stored = JSON.parse(window.localStorage.getItem(TABS_KEY) ?? "{}") as Record<string, string>;
    return stored[world] ?? "home";
  } catch {
    return "home";
  }
}

function rememberTab(world: WorldId, tab: string): void {
  try {
    const stored = JSON.parse(window.localStorage.getItem(TABS_KEY) ?? "{}") as Record<string, string>;
    stored[world] = tab;
    window.localStorage.setItem(TABS_KEY, JSON.stringify(stored));
  } catch {
    /* not remembered */
  }
}

/** Follows the page into its world, remembers the tab, and sets `html[data-world]`. */
export function useWorldSync(communityTab: string | null): WorldId {
  const { mode } = useShellMode();
  const world = useCurrentWorld();
  useEffect(() => {
    const owner = worldOfMode(mode);
    if (owner) {
      setCurrentWorld(owner);
      const tab = activeTabId(mode, communityTab);
      if (tab) rememberTab(owner, tab);
    } else if (mode === "home") {
      rememberTab(read(), "home");
    }
  }, [mode, communityTab]);
  useEffect(() => {
    document.documentElement.dataset.world = world;
  }, [world]);
  return world;
}

/** Open a world tab (or Home). */
export function useWorldNavigation() {
  const { setMode } = useShellMode();
  function openTab(world: WorldId, tabId: string) {
    if (tabId === "home") {
      setCurrentWorld(world);
      setMode("home", { params: { tab: null } });
      return;
    }
    const tab = WORLDS[world].tabs.find((item) => item.id === tabId) ?? WORLDS[world].tabs[0];
    setMode(tab.mode, { resume: tab.resume, params: { tab: null, ...tab.params } });
  }
  /** Change world: on Home the deck turns; elsewhere the world's last page opens. */
  function changeWorld(world: WorldId, onHome: boolean) {
    setCurrentWorld(world);
    if (!onHome) openTab(world, lastTabOf(world));
  }
  return { openTab, changeWorld };
}

export function stepWorld(world: WorldId, delta: number): WorldId {
  const index = WORLD_ORDER.indexOf(world);
  return WORLD_ORDER[(index + delta + WORLD_ORDER.length) % WORLD_ORDER.length];
}
