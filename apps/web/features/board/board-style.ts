import type { CSSProperties } from "react";

import { t } from "@/lib/i18n";

/**
 * Per-node look on the theme board: text colour, background, border, text
 * size and font. Stored as `node.data.style` (all fields optional — an unset
 * field keeps the node type's own look), so old boards render unchanged.
 */
export type BoardNodeStyle = {
  color?: string;
  bg?: string;
  border?: "none" | "solid" | "dashed";
  borderColor?: string;
  size?: "s" | "m" | "l" | "xl";
  font?: "naskh" | "kufi" | "sans";
};

export type BoardShape = "rect" | "ellipse" | "diamond";

/** Colours that read in both the light and the dark theme. */
export const BOARD_COLORS = ["#c9a227", "#c0563f", "#3f8f5b", "#3b6fb6", "#7a5ab5", "#8a8577"] as const;

export const BOARD_SIZES: { value: NonNullable<BoardNodeStyle["size"]>; px: number; label: string }[] = [
  { value: "s", px: 12, label: "S" },
  { value: "m", px: 14, label: "M" },
  { value: "l", px: 18, label: "L" },
  { value: "xl", px: 24, label: "XL" },
];

export const BOARD_FONTS: { value: NonNullable<BoardNodeStyle["font"]>; family: string; get label(): string }[] = [
  { value: "naskh", family: "var(--font-arabic-display)", get label() {
    return t("نسخ");
  } },
  { value: "kufi", family: "var(--font-arabic-heading)", get label() {
    return t("كوفي");
  } },
  { value: "sans", family: "var(--font-arabic-ui)", get label() {
    return t("بسيط");
  } },
];

const HEX = /^#[0-9a-f]{6}$/i;

/** A translucent fill of a palette colour (so text stays legible on it). */
export function tint(hex: string, alpha = 0.16): string {
  if (!HEX.test(hex)) return "transparent";
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Read a stored style defensively (boards are user data). */
export function readStyle(data: Record<string, unknown>): BoardNodeStyle {
  const raw = (data.style ?? {}) as Record<string, unknown>;
  const style: BoardNodeStyle = {};
  if (typeof raw.color === "string" && HEX.test(raw.color)) style.color = raw.color;
  if (typeof raw.bg === "string" && HEX.test(raw.bg)) style.bg = raw.bg;
  if (typeof raw.borderColor === "string" && HEX.test(raw.borderColor)) style.borderColor = raw.borderColor;
  if (raw.border === "none" || raw.border === "solid" || raw.border === "dashed") style.border = raw.border;
  if (BOARD_SIZES.some((size) => size.value === raw.size)) style.size = raw.size as BoardNodeStyle["size"];
  if (BOARD_FONTS.some((font) => font.value === raw.font)) style.font = raw.font as BoardNodeStyle["font"];
  return style;
}

/** CSS custom properties the node stylesheet reads (board.css). */
export function styleVars(style: BoardNodeStyle): CSSProperties {
  const vars: Record<string, string> = {};
  if (style.color) vars["--bn-fg"] = style.color;
  if (style.bg) vars["--bn-bg"] = tint(style.bg);
  if (style.border) vars["--bn-border-style"] = style.border;
  if (style.border === "none") vars["--bn-border-width"] = "0px";
  if (style.borderColor) vars["--bn-border"] = style.borderColor;
  if (style.size) vars["--bn-size"] = `${BOARD_SIZES.find((size) => size.value === style.size)!.px}px`;
  if (style.font) vars["--bn-font"] = BOARD_FONTS.find((font) => font.value === style.font)!.family;
  return vars as CSSProperties;
}

export function readShape(data: Record<string, unknown>): BoardShape {
  return data.shape === "ellipse" || data.shape === "diamond" ? data.shape : "rect";
}
