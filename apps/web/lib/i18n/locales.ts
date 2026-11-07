/**
 * Interface languages. Arabic is the source language (message ids are the
 * Arabic strings themselves); every other locale is a JSON dictionary in
 * `lib/i18n/locales/<code>.json`, loaded on demand. `numerals` is the digit
 * script a locale defaults to when it is chosen.
 */
export type LocaleInfo = {
  /** false while the dictionary is a machine-drafted first pass awaiting native review. */
  reviewed?: boolean;
  code: string;
  /** The language's own name. */
  native: string;
  dir: "rtl" | "ltr";
  numerals: "arabic-indic" | "latin" | "persian";
};

export const SOURCE_LOCALE = "ar";

export const LOCALES: LocaleInfo[] = [
  { code: "ar", native: "العربية", dir: "rtl", numerals: "arabic-indic", reviewed: true },
  { code: "en", native: "English", dir: "ltr", numerals: "latin" },
  { code: "fr", native: "Français", dir: "ltr", numerals: "latin" },
  { code: "es", native: "Español", dir: "ltr", numerals: "latin" },
  { code: "de", native: "Deutsch", dir: "ltr", numerals: "latin" },
  { code: "pt", native: "Português", dir: "ltr", numerals: "latin" },
  { code: "it", native: "Italiano", dir: "ltr", numerals: "latin" },
  { code: "nl", native: "Nederlands", dir: "ltr", numerals: "latin" },
  { code: "ru", native: "Русский", dir: "ltr", numerals: "latin" },
  { code: "tr", native: "Türkçe", dir: "ltr", numerals: "latin" },
  { code: "az", native: "Azərbaycanca", dir: "ltr", numerals: "latin" },
  { code: "uz", native: "Oʻzbekcha", dir: "ltr", numerals: "latin" },
  { code: "bs", native: "Bosanski", dir: "ltr", numerals: "latin" },
  { code: "sq", native: "Shqip", dir: "ltr", numerals: "latin" },
  { code: "fa", native: "فارسی", dir: "rtl", numerals: "persian" },
  { code: "ur", native: "اردو", dir: "rtl", numerals: "persian" },
  { code: "id", native: "Bahasa Indonesia", dir: "ltr", numerals: "latin" },
  { code: "ms", native: "Bahasa Melayu", dir: "ltr", numerals: "latin" },
  { code: "bn", native: "বাংলা", dir: "ltr", numerals: "latin" },
  { code: "hi", native: "हिन्दी", dir: "ltr", numerals: "latin" },
  { code: "zh", native: "中文", dir: "ltr", numerals: "latin" },
  { code: "ja", native: "日本語", dir: "ltr", numerals: "latin" },
  { code: "ko", native: "한국어", dir: "ltr", numerals: "latin" },
  { code: "sw", native: "Kiswahili", dir: "ltr", numerals: "latin" },
];

export const LOCALE_CODES = LOCALES.map((locale) => locale.code);

export function localeInfo(code: string | null | undefined): LocaleInfo {
  return LOCALES.find((locale) => locale.code === code) ?? LOCALES[0];
}

/**
 * The best supported locale for a browser language list (`navigator.languages`),
 * by base language ("fr-CA" → fr, "zh-Hans-CN" → zh; older Android reports
 * Indonesian as "in"); Arabic when none matches. The web opens in it until the
 * reader picks a language (docs/i18n.md). Mirrored, minified, in
 * `LOCALE_INIT_SCRIPT` — `browser-locale.test.ts` keeps both in step.
 */
export function matchLocale(preferred: readonly string[] | null | undefined): string {
  for (const tag of preferred ?? []) {
    let base = String(tag || "").toLowerCase().split(/[-_]/)[0];
    if (base === "in") base = "id";
    if (base && LOCALE_CODES.includes(base)) return base;
  }
  return SOURCE_LOCALE;
}
