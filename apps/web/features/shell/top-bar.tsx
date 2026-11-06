"use client";

import { useLayoutEffect, useRef } from "react";

import { Icon } from "@/components/icon";
import { useBand } from "@/lib/bands";
import { useWebDesign } from "@/lib/use-web-design";

import { CommandBar } from "./command-bar";
import { useShellMode } from "./mode-context";
import { useRoomWide } from "./room";
import { TOP_BAR_READER_ID } from "./top-bar-slots";
import { useCommandShortcut } from "./use-command-shortcut";
import { useWorkspace } from "./workspace-context";
import type { ShellMode } from "./mode-context";

import { t } from "@/lib/i18n";

/** The theme toggle icon button — shows the theme you'd switch TO. Used on the
 *  phone Home screen; on larger screens the rail carries its own (left-rail.tsx),
 *  and Settings has the full choice. */
export function ThemeButton({ className = "qb-icon-btn" }: { className?: string }) {
  const { state, actions } = useWorkspace();
  const dark = state.theme !== "light";
  return (
    <button
      type="button"
      className={className}
      onClick={actions.toggleTheme}
      title={dark ? t("السِّمة الفاتحة") : t("السِّمة الداكنة")}
      aria-label={dark ? t("التبديل إلى السِّمة الفاتحة") : t("التبديل إلى السِّمة الداكنة")}
    >
      <Icon name={dark ? "sun" : "moon"} size={18} />
    </button>
  );
}

export function TopBar() {
  const { mode, setMode } = useShellMode();
  const web = useWebDesign();
  // ⌘K / `/` work everywhere: they open Search (whose bar then takes focus).
  useCommandShortcut(() => setMode("search"));
  const phone = useBand() === "phone";
  // The web design: one top bar on every page (WebTopBar). On a phone a page
  // draws its own compact header (no top-bar slots there) and the reader its
  // own bar, so the top bar stays only where it carries the command bar.
  if (web && phone && mode !== "search" && mode !== "home") return null;
  if (web) return <WebTopBar mode={mode} />;
  // The command bar is Search's own surface: elsewhere it would only cost a
  // row of height (the reader bar carries a search button; Home has its hero
  // ask bar), so it shows in Search mode only.
  if (mode !== "search") return null;

  return (
    <div className="qb-topbar">
      <CommandBar />
    </div>
  );
}

/**
 * The web design's top bar. It names no page (the rail already shows where you
 * are); it carries each page's own tools instead, in two zones that sit over
 * the columns below:
 *   - the page zone, over the panel: the page's heading, tabs or field
 *     (#qb-topbar-slot), the command bar on Search and Home, the page's
 *     actions (#qb-topbar-actions) — pages portal into them (top-bar-slots.ts);
 *   - the reader zone (#qb-topbar-reader), over the Mushaf: the reader bar
 *     (surah, tools, «العرض»…), wherever the Mushaf shows (reader-bar.tsx).
 * On the reading page the reader zone takes the whole bar. Beside a panel the
 * page zone is measured to the panel's width, so the reader's tools stand
 * over the Mushaf.
 */
function WebTopBar({ mode }: { mode: ShellMode }) {
  const barRef = useRef<HTMLDivElement>(null);
  const [wide] = useRoomWide();
  const reading = mode === "reading";

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar || reading) return;
    let frame = 0;
    const fit = () => {
      frame = 0;
      const panel = document.querySelector<HTMLElement>(".qb-workspace-canvas > .qb-side-panel, .qb-workspace-canvas > .qb-companion-panel");
      if (!panel) {
        bar.style.removeProperty("--qb-panel-w");
        return;
      }
      const box = bar.getBoundingClientRect();
      const edge = panel.getBoundingClientRect();
      const style = getComputedStyle(bar);
      const pad = parseFloat(style.paddingInlineStart) || 0;
      const width = style.direction === "rtl" ? box.right - pad - edge.left : edge.right - box.left - pad;
      bar.style.setProperty("--qb-panel-w", `${Math.max(0, Math.round(width))}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(fit);
    };
    schedule();
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resize?.observe(bar);
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
    };
  }, [mode, wide, reading]);

  return (
    <div ref={barRef} className={`qb-topbar qb-topbar-web${reading ? " has-tools" : ""}${mode === "home" ? " is-home" : ""}`}>
      {reading ? null : (
        <div className="qb-topbar-page">
          <div id="qb-topbar-slot" className="qb-topbar-slot" />
          {mode === "search" || mode === "home" ? <CommandBar /> : null}
          <div id="qb-topbar-actions" className="qb-topbar-actions" />
        </div>
      )}
      <div id={TOP_BAR_READER_ID} className="qb-topbar-reader" />
    </div>
  );
}
