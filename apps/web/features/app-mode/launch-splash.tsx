"use client";

import "./launch-splash.web.css";

import { useEffect, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { GirihPattern } from "@/components/girih";
import { releaseNativeSplash, whenSplashLifts } from "@/lib/app-mode/boot";

/** The rosette's first rings draw before the splash may leave. */
const MIN_SHOWN_MS = 1600;
/** Its fade into the first screen (launch-splash.web.css). */
const FADE_MS = 450;

/**
 * The app's launch screen: Home's rosette (components/girih.tsx) drawing
 * itself around the mark, over the app's own background. The native splash
 * is only the plain launch colour; it steps aside as soon as this is painted
 * (lib/app-mode/boot.ts), and this fades out once the start-up is done.
 */
export function LaunchSplash({ onGone }: { onGone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const shownAt = performance.now();
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // Two frames: this splash is on screen before the native one goes.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => void releaseNativeSplash());
    });
    const timers: number[] = [];
    void whenSplashLifts().then(() => {
      if (cancelled) return;
      const wait = Math.max(0, (reduce ? 0 : MIN_SHOWN_MS) - (performance.now() - shownAt));
      timers.push(
        window.setTimeout(() => {
          setLeaving(true);
          timers.push(window.setTimeout(onGone, reduce ? 0 : FADE_MS));
        }, wait),
      );
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [onGone]);

  return (
    <div className={`qb-launch${leaving ? " is-leaving" : ""}`} aria-hidden="true">
      <GirihPattern className="qb-launch-girih" drawn />
      <span className="qb-launch-mark">
        <BrandMark size={68} themed />
      </span>
    </div>
  );
}
