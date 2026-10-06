"use client";

import "./stable-tab-bar.css";

import { useEffect } from "react";

import { Icon, type IconName } from "@/components/icon";

import { useShellMode, type ShellMode } from "./mode-context";

import { t } from "@/lib/i18n";

type Destination = {
  id: string;
  mode: ShellMode;
  icon: IconName;
  label: string;
  /** Pages that light this tab. */
  owns: readonly ShellMode[];
  /** The notebook reopens where it was left (a board, a research…). */
  resume?: boolean;
};

const DESTINATIONS: Destination[] = [
  { id: "home", mode: "home", icon: "home", owns: ["home", "settings"], get label() {
    return t("الرئيسية");
  } },
  { id: "reader", mode: "reading", icon: "book", owns: ["reading", "saved", "index"], get label() {
    return t("المصحف");
  } },
  { id: "search", mode: "search", icon: "search", owns: ["search", "heatmap"], get label() {
    return t("البحث");
  } },
  { id: "study", mode: "studio", icon: "sparkles", owns: ["studio"], get label() {
    return t("الدراسة");
  } },
  {
    id: "notebook",
    mode: "notebook",
    icon: "notebook",
    resume: true,
    owns: ["notebook", "bookmarks", "history", "roots", "board", "document"],
    get label() {
      return t("الدفتر");
    },
  },
];

/**
 * Phone prototype (lib/ux-prototype.ts): a plain bottom navigation bar — the
 * same five destinations, in the same place, on every screen, each with its
 * label. It replaces the worlds coin, whose fan hid six of nine pages behind a
 * tap and changed the tabs under the thumb (docs/mobile-ergonomics-prototype.md).
 *
 * Community, saved pages and the index stay one tap away from Home and the
 * reader. The world tint still follows the page (the rail, mounted on every
 * screen size, runs useWorldSync).
 *
 * It also tracks the on-screen keyboard (`html[data-kb]`, `--qb-kb`): the bar
 * steps aside while a field is typed into, and the bottom search bar rides on
 * top of the keyboard.
 */
export function StableTabBar() {
  const { mode, setMode } = useShellMode();
  useKeyboardInset();

  return (
    <nav className="qb-tabbar qb-stable-tabbar" aria-label={t("التنقل")}>
      {DESTINATIONS.map((item) => {
        const current = item.owns.includes(mode);
        return (
          <button
            key={item.id}
            type="button"
            className={`qb-stab${current ? " active" : ""}`}
            aria-current={current ? "page" : undefined}
            onClick={() => {
              if (current && item.mode === mode) {
                // A second tap on the current tab: back to its top.
                scrollCanvasToTop();
                return;
              }
              setMode(item.mode, { resume: item.resume, params: { tab: null } });
            }}
          >
            <span className="pill" aria-hidden="true">
              <Icon name={item.icon} size={22} stroke={current ? 2.1 : 1.7} />
            </span>
            <span className="label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** Every scrolled region of the page goes back to its top. */
function scrollCanvasToTop() {
  const canvas = document.querySelector(".qb-canvas");
  if (!canvas) return;
  for (const element of [canvas, ...canvas.querySelectorAll("*")]) {
    if (element.scrollTop > 0) element.scrollTo({ top: 0, behavior: "smooth" });
  }
}

/** Publishes the on-screen keyboard's height as `--qb-kb` and `html[data-kb="open"]`. */
function useKeyboardInset() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      // Under ~80px it is browser chrome settling, not a keyboard.
      const open = inset > 80;
      root.style.setProperty("--qb-kb", `${open ? Math.round(inset) : 0}px`);
      if (open) root.dataset.kb = "open";
      else delete root.dataset.kb;
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty("--qb-kb");
      delete root.dataset.kb;
    };
  }, []);
}
