"use client";

import { useEffect, useSyncExternalStore } from "react";

import type { IconName } from "@/components/icon";

import { useShellMode, type ShellMode } from "./mode-context";

import { t } from "@/lib/i18n";

/**
 * The app's destinations and the three worlds they belong to — reading,
 * research, community. Navigation never switches worlds: the phone's tab bar
 * and the desktop rail list their destinations directly, always in the same
 * place. A world only tints: each borrows one hue of the app's ambient glow
 * (gold, teal, copper — `html[data-world]`, shell/worlds.css) for the page
 * and its active destination. Home and Settings keep the current tint.
 */
export type WorldId = "reading" | "research" | "community";

export type Destination = {
  id: string;
  mode: ShellMode;
  /** Extra query parameters (null removes one). */
  params?: Record<string, string | null>;
  icon: IconName;
  label: string;
  world: WorldId | null;
  /** Pages that light this destination. */
  owns: readonly ShellMode[];
  /** The notebook reopens where it was left (a board, a research…). */
  resume?: boolean;
};

const LIBRARY: readonly ShellMode[] = ["notebook", "bookmarks", "history", "roots", "board", "document"];

function destination(item: Omit<Destination, "label">, label: () => string): Destination {
  return Object.defineProperty(item, "label", { get: label, enumerable: true }) as Destination;
}

export const HOME = destination({ id: "home", mode: "home", icon: "home", world: null, owns: ["home"] }, () => t("الرئيسية"));
export const READER = destination({ id: "reader", mode: "reading", icon: "book", world: "reading", owns: ["reading"] }, () =>
  t("المصحف"),
);
export const INDEX = destination({ id: "index", mode: "index", icon: "menu", world: "reading", owns: ["index"] }, () => t("الفهرس"));
export const SAVED = destination({ id: "saved", mode: "saved", icon: "bookmark", world: "reading", owns: ["saved"] }, () =>
  t("المحفوظة"),
);
export const SEARCH = destination(
  { id: "search", mode: "search", icon: "search", world: "research", owns: ["search", "heatmap"] },
  () => t("البحث"),
);
export const STUDY = destination({ id: "study", mode: "studio", icon: "sparkles", world: "research", owns: ["studio"] }, () =>
  t("الدراسة"),
);
export const NOTEBOOK = destination(
  { id: "notebook", mode: "notebook", icon: "notebook", world: "research", owns: LIBRARY, resume: true },
  () => t("الدفتر"),
);
export const COMMUNITY = destination(
  { id: "community", mode: "community", params: { tab: null }, icon: "users", world: "community", owns: ["community", "post"] },
  () => t("المجتمع"),
);

/**
 * The phone's five tabs (thumb reach: 3–5 labelled destinations, R7 in
 * docs/mobile-ergonomics.md). The reader's tab also lights on its index and
 * saved pages; Home on Settings. Community is one tap away from Home.
 */
export const PHONE_TABS: readonly Destination[] = [
  owning(HOME, ["home", "settings"]),
  owning(READER, ["reading", "saved", "index"]),
  SEARCH,
  STUDY,
  NOTEBOOK,
];

/** The same destination lighting on more pages (its label stays live, never copied). */
function owning(base: Destination, owns: readonly ShellMode[]): Destination {
  const { id, mode, params, icon, world, resume } = base;
  return destination({ id, mode, params, icon, world, resume, owns }, () => base.label);
}

/** The desktop rail: every destination, grouped by world (there is room for all of them). */
export const RAIL_GROUPS: readonly (readonly Destination[])[] = [
  [READER, INDEX, SAVED],
  [SEARCH, STUDY, NOTEBOOK],
  [COMMUNITY],
];

/** The world a page belongs to (null: Home and Settings keep the current one). */
export function worldOfMode(mode: ShellMode): WorldId | null {
  for (const group of RAIL_GROUPS) {
    for (const item of group) if (item.owns.includes(mode)) return item.world;
  }
  return null;
}

// ---------- The current tint (remembered on this device) ----------

const KEY = "qb.world";
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

function setCurrentWorld(world: WorldId): void {
  if (read() === world) return;
  current = world;
  try {
    window.localStorage.setItem(KEY, world);
  } catch {
    /* private mode: the tint lasts until reload */
  }
  for (const listener of listeners) listener();
}

function useCurrentWorld(): WorldId {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => "reading",
  );
}

/** Follows the page into its world and sets `html[data-world]` (the tint). Mount once. */
export function useWorldSync(): WorldId {
  const { mode } = useShellMode();
  const world = useCurrentWorld();
  useEffect(() => {
    const owner = worldOfMode(mode);
    if (owner) setCurrentWorld(owner);
  }, [mode]);
  useEffect(() => {
    document.documentElement.dataset.world = world;
  }, [world]);
  return world;
}

/** Open a destination. */
export function useOpenDestination() {
  const { setMode } = useShellMode();
  return (item: Destination) => setMode(item.mode, { resume: item.resume, viaTab: true, params: { tab: null, ...item.params } });
}
