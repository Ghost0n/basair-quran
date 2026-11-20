/**
 * Numeral helpers — formats UI numbers in the reader's digits.
 *
 * The Qurʾān's own ayah-number glyphs (﴿...﴾) are NEVER touched here;
 * they follow the mushaf rasm and are rendered as the API returns them.
 * This file only converts UI numerals (ayah counts, page numbers, session
 * message counts, etc.).
 *
 * The digits setting (`numerals`) is "auto" — the interface language's own
 * digits — or a script the reader chose. `PreferencesProvider` resolves it
 * and installs the result here (`setActiveNumerals`) before its children
 * render, the way `I18nProvider` installs the dictionary `t()` reads, so
 * `formatNumber(n)` follows the reader everywhere (docs/i18n.md).
 */

import type { NumeralsSetting } from "@q-basair/shared";

export type NumeralScript = "arabic-indic" | "latin" | "persian";
export type { NumeralsSetting };

const ARABIC_INDIC_DIGITS: readonly string[] = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
const PERSIAN_DIGITS: readonly string[] = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

function mapDigits(input: number | string, table: readonly string[]): string {
  return String(input)
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/\d/g, (d) => table[Number(d)] ?? d);
}

export function toArabicDigits(n: number | string): string {
  return mapDigits(n, ARABIC_INDIC_DIGITS);
}

export function toPersianDigits(n: number | string): string {
  return mapDigits(n, PERSIAN_DIGITS);
}

export function toLatinDigits(n: number | string): string {
  return String(n)
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)));
}

let active: NumeralScript = "arabic-indic";

/** Installs the digits `formatNumber` uses when it isn't given a script. */
export function setActiveNumerals(script: NumeralScript): void {
  active = script;
}

/** The digits in use (the resolved setting). */
export function activeNumerals(): NumeralScript {
  return active;
}

/** The script a digits setting means in a language: "auto" takes the language's own. */
export function resolveNumerals(setting: NumeralsSetting | string | null | undefined, languageDigits: NumeralScript): NumeralScript {
  return setting === "arabic-indic" || setting === "latin" || setting === "persian" ? setting : languageDigits;
}

/**
 * What picking a script in a digits menu saves: the language's own digits
 * save "auto" (they keep following the language), any other is a choice.
 */
export function digitsSetting(script: NumeralScript, languageDigits: NumeralScript): NumeralsSetting {
  return script === languageDigits ? "auto" : script;
}

export function formatNumber(n: number | string, script: NumeralScript = active): string {
  switch (script) {
    case "latin":
      return toLatinDigits(n);
    case "persian":
      return toPersianDigits(n);
    case "arabic-indic":
    default:
      return toArabicDigits(n);
  }
}
