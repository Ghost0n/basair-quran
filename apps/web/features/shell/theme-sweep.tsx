"use client";

import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "./lib/run-sequence";
import { useWorkspace } from "./workspace-context";

import "./theme-sweep.css";

/**
 * ThemeSweep — a blurred gold beam kneads the scene right→left (reading
 * direction) whenever the theme flips, so the change reads as dawn/dusk rather
 * than a switch. Reduced motion drops the beam entirely; the body's own
 * background-color transition already crossfades the palette.
 */
export function ThemeSweep() {
  const { state } = useWorkspace();
  const reduced = useReducedMotion();
  const [sweeping, setSweeping] = useState(false);
  const previous = useRef(state.theme);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (previous.current === state.theme) return;
    previous.current = state.theme;
    if (reduced) return;
    setSweeping(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSweeping(false), 720);
  }, [state.theme, reduced]);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  if (!sweeping) return null;
  return <div className="qb-theme-sweep" data-motion="sweep" aria-hidden />;
}
