import { BRAND_GEOMETRY } from "@/components/brand-mark";
import { BRAND_GLYPH_PATH } from "@/components/brand-glyph.generated";

import type { NativeTab } from "./native-tab-bar";

/**
 * The native tab bar's icons are the app's own (components/icon.tsx and the
 * logo), not Apple's stock symbols: drawn here on a canvas, sent as PNG data
 * to the plugin (NativeTabBarPlugin.swift). A line icon is a template image
 * that the bar tints (grey, gold when current); the logo keeps its gold, as
 * on the web bar. When a canvas cannot draw, the tab keeps its SF Symbol.
 */
export type TabGlyph = { kind: "icon"; d: string } | { kind: "brand" };

export type GlyphRender = (glyph: TabGlyph, options: { size: number; stroke: number; color: string }) => string | null;

/** What the plugin receives for a tab. */
export type NativeTabPayload = Omit<NativeTab, "glyph"> & { image?: string; selectedImage?: string; original?: boolean };

/** Points, as Apple's tab bar icons (about 25 pt; the logo a little larger, as the web bar's). */
const ICON_PT = 25;
const BRAND_PT = 30;
/** The web bar's strokes (mobile-tab-bar.tsx): lighter at rest, heavier when current. */
const STROKE = 1.7;
const STROKE_CURRENT = 2.1;
/** Drawn at the phone's 3x. */
const SCALE = 3;

/** Draws a glyph as a PNG data URL, or null where no canvas can draw (tests, very old WebKit). */
export const renderGlyph: GlyphRender = (glyph, { size, stroke, color }) => {
  if (typeof document === "undefined" || typeof Path2D === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.round(size * SCALE);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    if (glyph.kind === "icon") {
      ctx.scale(canvas.width / 24, canvas.width / 24);
      ctx.lineWidth = stroke;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke(new Path2D(glyph.d));
    } else {
      // The logo on its 100-unit square, a little inset so the ring's stroke is whole.
      const unit = canvas.width / 104;
      ctx.scale(unit, unit);
      ctx.translate(2, 2);
      const { ring, squares, squareWidth, nuqta } = BRAND_GEOMETRY;
      ctx.lineWidth = ring.width * 1.3;
      ctx.beginPath();
      ctx.arc(50, 50, ring.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = squareWidth * 1.3;
      ctx.lineJoin = "miter";
      for (const points of squares) {
        const path = new Path2D(`M${points.split(" ").join("L")}Z`);
        ctx.stroke(path);
      }
      ctx.fill(new Path2D(BRAND_GLYPH_PATH));
      ctx.beginPath();
      ctx.arc(nuqta.cx, nuqta.cy, nuqta.r, 0, Math.PI * 2);
      ctx.fill();
    }
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
};

/** The tabs as the plugin takes them: each with its drawn icon when it has a glyph that could be drawn. */
export function nativeTabsPayload(tabs: readonly NativeTab[], tint: string, render: GlyphRender = renderGlyph): NativeTabPayload[] {
  return tabs.map(({ glyph, ...tab }) => {
    if (!glyph) return tab;
    if (glyph.kind === "brand") {
      // The logo keeps its own gold (no tint read: the web bar's gold token).
      const image = render(glyph, { size: BRAND_PT, stroke: 0, color: tint || "#d4af37" });
      return image ? { ...tab, image, original: true } : tab;
    }
    // Template images: only their shape counts, the bar colours them.
    const image = render(glyph, { size: ICON_PT, stroke: STROKE, color: "#000000" });
    const selectedImage = render(glyph, { size: ICON_PT, stroke: STROKE_CURRENT, color: "#000000" });
    return image && selectedImage ? { ...tab, image, selectedImage, original: false } : tab;
  });
}
