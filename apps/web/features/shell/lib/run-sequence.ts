"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** A single step: wait `delayMs` (relative to the previous step) then run `fn`. */
export type SequenceStep = [delayMs: number, fn: () => void];

/**
 * Port of the design prototype's `run(key, steps)` helper.
 *
 * Schedules a choreographed sequence of callbacks with *cumulative* delays,
 * cancelling any in-flight sequence stored under the same `key` first — so a
 * re-triggered animation (page turn, travel, pin, theme sweep, evidence
 * reveal) never stacks on top of a previous replay. All pending timers are
 * cleared on unmount.
 *
 * Usage:
 *   const { run } = useSequencer();
 *   run("page", [
 *     [0,   () => setState({ pageOn: false })],
 *     [40,  () => setState({ page: target, pageOn: true })],
 *   ]);
 */
export function useSequencer() {
  const timers = useRef<Map<string, number[]>>(new Map());

  const cancel = useCallback((key: string) => {
    const list = timers.current.get(key);
    if (list) {
      list.forEach((t) => window.clearTimeout(t));
      timers.current.set(key, []);
    }
  }, []);

  const run = useCallback(
    (key: string, steps: SequenceStep[]) => {
      cancel(key);
      const list: number[] = [];
      let elapsed = 0;
      for (const [ms, fn] of steps) {
        elapsed += ms;
        list.push(window.setTimeout(fn, elapsed));
      }
      timers.current.set(key, list);
    },
    [cancel],
  );

  useEffect(() => {
    const store = timers.current;
    return () => {
      store.forEach((list) => list.forEach((t) => window.clearTimeout(t)));
      store.clear();
    };
  }, []);

  return { run, cancel };
}

/**
 * Reactive `prefers-reduced-motion` reader for the JS-driven sequences
 * (long-jump page-counter scrub, pin-ghost flight) that must choose the
 * reduced path in code rather than via CSS. CSS-only animations are already
 * handled by the reduced-motion variant in motion.css / tokens-motion.css.
 *
 * SSR-safe: starts `false`, resolves after mount.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
