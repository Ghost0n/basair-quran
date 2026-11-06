"use client";

import "./mobile-tab-bar.css";
import "./mobile-tab-bar.web.css";

import { useCallback, useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

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
 * current tab sits under a glass lens (always gold) that glides from tab to
 * tab; a press can slide along the bar — the lens follows the finger and the
 * tab under it opens on release, as on iOS. Entering the reader, the bar
 * splits into the reader's back button and dock (view transitions,
 * app/motion.css).
 *
 * It also tracks the on-screen keyboard (`html[data-kb]`, `--qb-kb`): the bar
 * steps aside while a field is typed into, and the bottom search bar rides on
 * top of the keyboard.
 */
export function MobileTabBar() {
  const { mode } = useShellMode();
  const open = useOpenDestination();
  useKeyboardInset();
  const navRef = useRef<HTMLElement | null>(null);
  const lensRef = useRef<HTMLSpanElement | null>(null);
  const activeIndex = PHONE_TABS.findIndex((item) => item.owns.includes(mode));
  // A press that slid across the bar: the lens follows the finger, and the
  // tab under it opens on release (the click that follows is ignored).
  const dragRef = useRef<{ id: number; x: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  // The lens rests on the current tab (it glides there on every change).
  const placeLens = useCallback(() => {
    const nav = navRef.current;
    const lens = lensRef.current;
    if (!nav || !lens) return;
    const tab = nav.querySelectorAll<HTMLElement>(".qb-stab")[activeIndex];
    if (!tab) {
      lens.style.opacity = "0";
      return;
    }
    lens.style.opacity = "1";
    lens.style.width = `${tab.offsetWidth - 8}px`;
    lens.style.transform = `translateX(${tab.offsetLeft + 4}px)`;
  }, [activeIndex]);

  useLayoutEffect(() => {
    placeLens();
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(placeLens);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [placeLens]);

  function tabAt(clientX: number): number {
    const tabs = navRef.current?.querySelectorAll<HTMLElement>(".qb-stab") ?? [];
    for (let index = 0; index < tabs.length; index++) {
      const rect = tabs[index].getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right) return index;
    }
    return -1;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" || !event.isPrimary) return;
    dragRef.current = { id: event.pointerId, x: event.clientX, moved: false };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    const nav = navRef.current;
    const lens = lensRef.current;
    if (!drag || drag.id !== event.pointerId || !nav || !lens) return;
    if (!drag.moved && Math.abs(event.clientX - drag.x) < 10) return;
    if (!drag.moved) {
      drag.moved = true;
      nav.setPointerCapture?.(event.pointerId);
      nav.classList.add("is-dragging");
    }
    const box = nav.getBoundingClientRect();
    const width = lens.offsetWidth;
    const x = Math.min(Math.max(event.clientX - box.left - width / 2, 4), box.width - width - 4);
    lens.style.opacity = "1";
    lens.style.transform = `translateX(${x}px)`;
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    const nav = navRef.current;
    if (!drag || drag.id !== event.pointerId || !drag.moved) return;
    nav?.classList.remove("is-dragging");
    suppressClickRef.current = true;
    window.setTimeout(() => (suppressClickRef.current = false), 400);
    const index = event.type === "pointercancel" ? -1 : tabAt(event.clientX);
    const item = PHONE_TABS[index];
    if (item && index !== activeIndex) open(item);
    else placeLens();
  }

  return (
    <nav
      ref={navRef}
      className="qb-tabbar qb-stable-tabbar"
      aria-label={t("التنقل")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <span ref={lensRef} className="qb-tab-lens" aria-hidden="true" />
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
              if (suppressClickRef.current) return;
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
      // The visible area itself: with the keyboard up the app frame follows it
      // (phone-ergonomics.css), whatever the browser scrolled to show the field.
      root.style.setProperty("--qb-vvh", `${Math.round(viewport.height)}px`);
      root.style.setProperty("--qb-vvtop", `${Math.round(viewport.offsetTop)}px`);
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
      root.style.removeProperty("--qb-vvh");
      root.style.removeProperty("--qb-vvtop");
      delete root.dataset.kb;
    };
  }, []);
}
