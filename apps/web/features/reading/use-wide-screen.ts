"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tracks whether the viewport is at least `breakpoint` wide — used to decide
 * when the authentic reader shows a two-page facing spread. Below it, the
 * reader collapses to a single centred page. SSR-safe (starts false).
 */
export function useWideScreen(breakpoint = 1180): boolean {
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [breakpoint]);

  return wide;
}

/**
 * Tracks whether the viewport is at most `maxHeight` tall. The auto layout uses
 * it to send short / landscape screens to `scroll`: a fit-to-height page has no
 * room there and collapses the authentic glyph text toward MIN_SCALE. SSR-safe.
 */
export function useShortViewport(maxHeight = 560): boolean {
  const [short, setShort] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(`(max-height: ${maxHeight}px)`);
    const update = () => setShort(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [maxHeight]);

  return short;
}

/** Phone or short/landscape screen — where "auto" reads best as continuous scroll. */
export function useCompactReader(): boolean {
  const narrow = !useWideScreen(768);
  const short = useShortViewport(560);
  return narrow || short;
}

/**
 * Live content-box size of an element (0×0 until measured). `pick` selects a
 * related node (e.g. the parent) from the ref'd element. The observer is only
 * re-created when the observed node actually changes.
 */
export function useElementSize(
  ref: { current: HTMLElement | null },
  pick?: (node: HTMLElement) => HTMLElement | null,
): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const observed = useRef<{ node: HTMLElement; observer: ResizeObserver } | null>(null);
  const pickRef = useRef(pick);
  pickRef.current = pick;

  useEffect(() => {
    const base = ref.current;
    const node = base ? (pickRef.current ? pickRef.current(base) : base) : null;
    if (observed.current?.node === node) return;
    observed.current?.observer.disconnect();
    observed.current = null;
    if (!node || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const width = Math.round(node.clientWidth);
      const height = Math.round(node.clientHeight);
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    observed.current = { node, observer };
  });

  useEffect(
    () => () => {
      observed.current?.observer.disconnect();
      observed.current = null;
    },
    [],
  );

  return size;
}
