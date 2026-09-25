import type { ThemeColor } from "@q-basair/shared";

import { t } from "@/lib/i18n";

/**
 * The fixed theme palette (مواضيع). A closed set keeps every highlight legible
 * on both light/dark themes and on the QCF glyph pages; the actual tints live in
 * themes.css as `--hl-<key>` (fill) and `--hl-<key>-ink` (dot / border).
 */
export const THEME_PALETTE: { key: ThemeColor; label: string }[] = [
  // Gold is the reader's selection colour, so new themes start elsewhere.
  { key: "green", get label() {
    return t("أخضر");
  } },
  { key: "blue", get label() {
    return t("أزرق");
  } },
  { key: "rose", get label() {
    return t("وردي");
  } },
  { key: "violet", get label() {
    return t("بنفسجي");
  } },
  { key: "teal", get label() {
    return t("فيروزي");
  } },
  { key: "sand", get label() {
    return t("رملي");
  } },
  { key: "gold", get label() {
    return t("ذهبي");
  } },
  { key: "grey", get label() {
    return t("رمادي");
  } },
];

/** The first palette colour not yet used by the given themes (cycles when all are). */
export function nextThemeColor(used: ThemeColor[]): ThemeColor {
  const free = THEME_PALETTE.find((entry) => !used.includes(entry.key));
  return free?.key ?? THEME_PALETTE[used.length % THEME_PALETTE.length].key;
}
