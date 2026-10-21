"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

import landing from "@/features/site/landing-data.json";

import "./ribbon.web.css";

/** The 114 surah names (Ḥafṣ), Al-Fātiḥa first. */
export const SURAH_NAMES: readonly string[] = landing.surah_names;

/**
 * Bar heights (0–1) for a distribution over the surahs: the square root of each
 * surah's share of the peak, so small counts stay visible; a floor marks empty
 * surahs. `flat` draws yes/no data (read / not read).
 */
export function ribbonHeights(counts: readonly number[], opts: { flat?: boolean } = {}): number[] {
  if (opts.flat) return counts.map((c) => (c ? 1 : 0.32));
  const peak = Math.max(1, ...counts);
  return counts.map((c) => (c ? 0.12 + 0.88 * Math.sqrt(c / peak) : 0.05));
}

export type RibbonProps = {
  /** One count per surah, Al-Fātiḥa first. */
  counts: readonly number[];
  /** Accessible name of the chart. */
  label: string;
  /** The surah where the reader is (lit). */
  here?: number | null;
  /** A picked surah: the others dim. */
  focus?: number | null;
  flat?: boolean;
  /** Bars rise once when first shown. */
  grow?: boolean;
  /** Height in px (default 60). */
  height?: number;
  /** Readout for a hovered / focused surah (format numbers with the numerals helper). */
  readout?: (index: number) => string;
  /** Readout when nothing is hovered (defaults to the `here` surah's readout). */
  restReadout?: string;
  /** Makes the ribbon a chooser: click or drag chooses a surah, ←/→ move the choice, Esc clears it. */
  onPick?: (index: number | null) => void;
  /** Makes each surah a way somewhere: ←/→ move along the ribbon, Enter or a click opens the surah. */
  onActivate?: (index: number) => void;
  /** Hide the axis row (surah names and readout). */
  bare?: boolean;
  className?: string;
};

/**
 * The 114-bar surah ribbon — the one instrument for "where in the Quran"
 * (from the landing page). Al-Fātiḥa sits on the right in every interface
 * language: the ribbon follows the Mushaf's order, not the page direction.
 */
export function Ribbon({
  counts,
  label,
  here = null,
  focus = null,
  flat = false,
  grow = false,
  height = 60,
  readout,
  restReadout,
  onPick,
  onActivate,
  bare = false,
  className = "",
}: RibbonProps) {
  const [hover, setHover] = useState<number | null>(null);
  const dragging = useRef(false);
  const lastPick = useRef<number | null>(null);
  // The keyboard's place on the ribbon (also follows pointer picks).
  const keyIndex = useRef<number | null>(focus);
  const heights = ribbonHeights(counts, { flat });
  const interactive = Boolean(onPick || onActivate);

  const indexAt = (event: PointerEvent<HTMLDivElement>): number | null => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-i]");
    if (target) return Number(target.dataset.i);
    // Between bars: the nearest one by x.
    const bars = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-i]"));
    const hit = bars.find((bar) => {
      const r = bar.getBoundingClientRect();
      return event.clientX >= r.left - 1 && event.clientX <= r.right + 1;
    });
    return hit ? Number(hit.dataset.i) : null;
  };

  // A choice fires once per surah: moving within the same bar, or jitter, does nothing.
  const pick = (i: number | null) => {
    keyIndex.current = i;
    if (!onPick || i === lastPick.current) return;
    lastPick.current = i;
    onPick(i);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const i = indexAt(event);
    if (i == null) return;
    setHover(i);
    if (dragging.current) pick(i);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!onPick) return;
    dragging.current = true;
    lastPick.current = null;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture is a nicety (drag across bars).
    }
    pick(indexAt(event));
  };
  const endDrag = () => {
    dragging.current = false;
  };
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!onActivate) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-i]");
    if (target) onActivate(Number(target.dataset.i));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    // Bars run right to left (Al-Fātiḥa on the right): ← moves forward in the Mushaf.
    let next = keyIndex.current;
    if (event.key === "ArrowLeft") next = Math.min(counts.length - 1, (next ?? -1) + 1);
    else if (event.key === "ArrowRight") next = Math.max(0, (next ?? 1) - 1);
    else if (event.key === "Escape") next = null;
    else if ((event.key === "Enter" || event.key === " ") && onActivate && keyIndex.current != null) {
      event.preventDefault();
      onActivate(keyIndex.current);
      return;
    } else return;
    event.preventDefault();
    keyIndex.current = next;
    setHover(next);
    if (onPick) {
      lastPick.current = next;
      onPick(next);
    }
  };

  const shown = hover ?? null;
  const text = shown != null && readout ? readout(shown) : restReadout ?? (here != null && readout ? readout(here) : "");

  return (
    <div className={`qb-ribbon-wrap ${className}`.trim()}>
      <div
        className={`qb-ribbon${interactive ? " is-live" : ""}${grow ? " is-grow" : ""}`}
        style={{ ["--rh" as string]: `${height}px` } as CSSProperties}
        role={interactive ? "slider" : "img"}
        aria-label={label}
        aria-valuemin={interactive ? 1 : undefined}
        aria-valuemax={interactive ? counts.length : undefined}
        aria-valuenow={interactive ? (hover ?? focus ?? here ?? 0) + 1 : undefined}
        aria-valuetext={interactive && readout ? readout(hover ?? focus ?? here ?? 0) : undefined}
        tabIndex={interactive ? 0 : undefined}
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          if (!dragging.current) setHover(null);
        }}
        onPointerDown={onPointerDown}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        {counts.map((count, i) => (
          <span
            key={i}
            data-i={i}
            className={[
              "bar",
              count ? "on" : "",
              here === i ? "here" : "",
              focus != null && focus !== i ? "dim" : "",
              hover === i ? "hov" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ ["--h" as string]: heights[i], ["--i" as string]: i } as CSSProperties}
          />
        ))}
      </div>
      {bare ? null : (
        <div className="qb-ribbon-axis">
          <span>{SURAH_NAMES[0]}</span>
          <span className="readout" aria-live="polite">
            {text}
          </span>
          <span>{SURAH_NAMES[SURAH_NAMES.length - 1]}</span>
        </div>
      )}
    </div>
  );
}

/** A 114px ribbon without axis, for rows and chips. */
export function MiniRibbon({ counts }: { counts: readonly number[] }) {
  const peak = Math.max(1, ...counts);
  return (
    <span className="qb-mini-ribbon" aria-hidden="true">
      {counts.map((c, i) => (
        <i key={i} style={{ height: `${c ? 15 + 85 * Math.sqrt(c / peak) : 0}%` }} />
      ))}
    </span>
  );
}
