"use client";

import "./mobile-tab-bar.css";

import { useEffect } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Icon } from "@/components/icon";

import { useShellMode } from "./mode-context";
import { PHONE_TABS, useOpenDestination } from "./worlds";

import { t } from "@/lib/i18n";

/**
 * The phone's bottom navigation bar: the same five destinations (Home ·
 * المصحف · البحث · الدراسة · الدفتر), in the same place, on every screen,
 * each with its label (docs/mobile-ergonomics.md). A second tap on the
 * current tab scrolls back to the top. Hidden on desktop (the rail lists
 * every destination there).
 *
 * Home is the app's logo, without a label. The index and saved pages are
 * one tap from Home and the reader's surah name; community from Home. The
 * active pill is always gold.
 *
 * It also tracks the on-screen keyboard (`html[data-kb]`, `--qb-kb`): the bar
 * steps aside while a field is typed into, and the bottom search bar rides on
 * top of the keyboard.
 */
export function MobileTabBar() {
  const { mode } = useShellMode();
  const open = useOpenDestination();
  useKeyboardInset();

  return (
    <nav className="qb-tabbar qb-stable-tabbar" aria-label={t("التنقل")}>
      {PHONE_TABS.map((item) => {
        const current = item.owns.includes(mode);
        const brand = item.id === "home";
        return (
          <button
            key={item.id}
            type="button"
            className={`qb-stab${brand ? " brand" : ""}${current ? " active" : ""}`}
            aria-current={current ? "page" : undefined}
            aria-label={brand ? item.label : undefined}
            onClick={() => {
              if (current && item.mode === mode) {
                // A second tap on the current tab: back to its top.
                scrollCanvasToTop();
                return;
              }
              open(item);
            }}
          >
            <span className="pill" aria-hidden="true">
              {brand ? <BrandMark size={34} themed /> : <Icon name={item.icon} size={22} stroke={current ? 2.1 : 1.7} />}
            </span>
            {brand ? null : <span className="label">{item.label}</span>}
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
