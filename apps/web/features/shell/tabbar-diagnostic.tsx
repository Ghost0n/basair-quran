// i18n-ignore-file — a temporary developer readout, not interface text.
"use client";

import { useEffect, useState } from "react";

import { nativeTabBarDrawnHeight, nativeTabBarTrace } from "@/lib/native-tab-bar";

/** How long the native bar has to draw before the readout appears. */
const GRACE_MS = 4000;

interface CapacitorProbe {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
  PluginHeaders?: { name: string }[];
}

function readout(): string {
  const cap = (window as unknown as { Capacitor?: CapacitorProbe }).Capacitor;
  const root = document.documentElement;
  const bar = document.querySelector<HTMLElement>(".qb-tabbar");
  const style = bar ? getComputedStyle(bar) : null;
  const rect = bar?.getBoundingClientRect();
  return [
    `platform=${cap?.getPlatform?.()} native=${cap?.isNativePlatform?.()} plugin=${cap?.isPluginAvailable?.("NativeTabBar")}`,
    `headers=${(cap?.PluginHeaders ?? []).map((header) => header.name).join(",") || "-"}`,
    `html=${root.className} kb=${root.dataset.kb ?? "-"} mode=${root.dataset.shellMode ?? "-"}`,
    `view=${window.innerWidth}x${window.innerHeight} phone=${window.matchMedia("(max-width: 768px)").matches}`,
    bar && style && rect
      ? `webbar display=${style.display} vis=${style.visibility} op=${style.opacity} rect=${Math.round(rect.top)},${Math.round(rect.bottom)},${Math.round(rect.left)},${Math.round(rect.right)}`
      : "webbar=absent",
    ...nativeTabBarTrace,
  ].join("\n");
}

/**
 * TEMPORARY (the iPhone app's missing tab bar, 2026-11-07): when the native
 * bar has not drawn within a few seconds, shows what the app sees, for a
 * screenshot. Never shows in a browser, nor once the native bar is up.
 */
export function TabBarDiagnostic() {
  const [text, setText] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: CapacitorProbe }).Capacitor;
    if (!cap?.isNativePlatform?.() || cap.getPlatform?.() !== "ios") return;
    let timer = 0;
    const start = window.setTimeout(() => {
      const tick = () => setText(nativeTabBarDrawnHeight() > 0 ? null : readout());
      tick();
      timer = window.setInterval(tick, 1000);
    }, GRACE_MS);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, []);

  if (!text || closed) return null;
  return (
    <div className="qb-tabbar-diag" role="status">
      <button type="button" onClick={() => setClosed(true)} aria-label="Close">
        ×
      </button>
      <pre>{text}</pre>
    </div>
  );
}
