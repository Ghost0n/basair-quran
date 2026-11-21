"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The public pages' top bar follows the reading: `data-scrolled` once the page
 * has moved (the glass grows denser), `--progress` (0–1) for the gold thread
 * along its lower edge, and — given section ids — the section being read, for
 * the bar's links. One passive scroll listener, throttled to the frame.
 */
export function useBarScroll<T extends HTMLElement>(sectionIds: readonly string[] = []) {
  const ref = useRef<T | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const ids = sectionIds.join(" ");

  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const root = document.documentElement;
      const range = root.scrollHeight - window.innerHeight;
      const y = window.scrollY;
      bar.style.setProperty("--progress", range > 0 ? String(Math.min(1, Math.max(0, y / range))) : "0");
      bar.toggleAttribute("data-scrolled", y > 8);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!ids || typeof IntersectionObserver === "undefined") return;
    const sections = ids
      .split(" ")
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    // A section is "being read" while it crosses the middle band of the screen.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setCurrent(entry.target.id);
          else setCurrent((now) => (now === entry.target.id ? null : now));
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [ids]);

  return [ref, current] as const;
}
