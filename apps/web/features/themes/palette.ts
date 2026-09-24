import type { ThemeColor } from "@q-basair/shared";

/**
 * The fixed theme palette (مواضيع). A closed set keeps every highlight legible
 * on both light/dark themes and on the QCF glyph pages; the actual tints live in
 * themes.css as `--hl-<key>` (fill) and `--hl-<key>-ink` (dot / border).
 */
export const THEME_PALETTE: { key: ThemeColor; label: string }[] = [
  // Gold is the reader's selection colour, so new themes start elsewhere.
  { key: "green", label: "أخضر" },
  { key: "blue", label: "أزرق" },
  { key: "rose", label: "وردي" },
  { key: "violet", label: "بنفسجي" },
  { key: "teal", label: "فيروزي" },
  { key: "sand", label: "رملي" },
  { key: "gold", label: "ذهبي" },
  { key: "grey", label: "رمادي" },
];

/** The first palette colour not yet used by the given themes (cycles when all are). */
export function nextThemeColor(used: ThemeColor[]): ThemeColor {
  const free = THEME_PALETTE.find((entry) => !used.includes(entry.key));
  return free?.key ?? THEME_PALETTE[used.length % THEME_PALETTE.length].key;
}
