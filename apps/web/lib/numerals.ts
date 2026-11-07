/**
 * Numeral helpers — formats UI numbers per the user's chosen script.
 *
 * The Qurʾān's own ayah-number glyphs (﴿...﴾) are NEVER touched here;
 * they follow the mushaf rasm and are rendered as the API returns them.
 * This file only converts UI numerals (ayah counts, page numbers, session
 * message counts, etc.).
 *
 * Phase 0: the hook returns the static default. Phase 7 will wire it
 * to PreferencesProvider so it reads from the user's chosen numeral script.
 */

export type NumeralScript = "arabic-indic" | "latin" | "persian";

const ARABIC_INDIC_DIGITS: readonly string[] = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
const PERSIAN_DIGITS: readonly string[] = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

function mapDigits(input: number | string, table: readonly string[]): string {
  return String(input).replace(/\d/g, (d) => table[Number(d)] ?? d);
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

export function formatNumber(n: number | string, script: NumeralScript = "arabic-indic"): string {
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

/**
 * Returns the active numeral formatter for the current preferences scope.
 *
 * Phase 0 returns the default (Arabic-Indic). Phase 7 will read the
 * active script from PreferencesProvider + TweaksProvider.
 */
export function useNumeralFormat(): (n: number | string) => string {
  const script: NumeralScript = "arabic-indic";
  return (n) => formatNumber(n, script);
}
