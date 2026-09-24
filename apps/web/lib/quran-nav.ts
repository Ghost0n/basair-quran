/**
 * Quran navigation parsing, shared by the command bar and the reader's «انتقل»
 * sheet so both understand the same references.
 */

export type NavCommand =
  | { type: "page"; page: number }
  | { type: "surah"; surah: number }
  | { type: "ayah"; surah: number; ayah: number }
  | { type: "juz"; juz: number };

export const TOTAL_PAGES = 604;

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits → ASCII, so parsing is script-agnostic. */
export function toAsciiDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

/**
 * Parse «صفحة N», «سورة N», «جزء N», or a reference «2:255» (سورة:آية).
 * Returns null for anything else (the caller falls back to search / filtering).
 */
export function parseNavCommand(raw: string): NavCommand | null {
  const value = toAsciiDigits(raw.trim());
  if (!value) return null;
  let m = value.match(/^(\d{1,3})\s*[:：]\s*(\d{1,3})$/);
  if (m) {
    const surah = Number(m[1]);
    const ayah = Number(m[2]);
    return surah >= 1 && surah <= 114 && ayah >= 1 ? { type: "ayah", surah, ayah } : null;
  }
  m = value.match(/^صفحة\s+(\d{1,3})$/);
  if (m) {
    const page = Number(m[1]);
    return page >= 1 && page <= TOTAL_PAGES ? { type: "page", page } : null;
  }
  m = value.match(/^سورة\s+(\d{1,3})$/);
  if (m) {
    const surah = Number(m[1]);
    return surah >= 1 && surah <= 114 ? { type: "surah", surah } : null;
  }
  m = value.match(/^جزء\s+(\d{1,2})$/);
  if (m) {
    const juz = Number(m[1]);
    return juz >= 1 && juz <= 30 ? { type: "juz", juz } : null;
  }
  return null;
}

/**
 * Fold an Arabic surah name for forgiving matching: drop tashkeel/Quranic marks
 * and tatweel, unify alef/ya/ta-marbuta forms, drop the «ال» article.
 * «البَقَرَة» → «بقره», «الأعراف» → «اعراف».
 */
export function foldArabicName(value: string): string {
  return value
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/^سوره\s+/, "")
    .replace(/(^|\s)ال/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Does a surah (by number and name) match a free-text filter? */
export function surahMatches(filter: string, surah: { id: number; name: string; name_english?: string | null }): boolean {
  const raw = toAsciiDigits(filter.trim());
  if (!raw) return true;
  if (/^\d+$/.test(raw)) return String(surah.id).startsWith(raw);
  const folded = foldArabicName(raw);
  if (folded && foldArabicName(surah.name).includes(folded)) return true;
  return Boolean(surah.name_english && surah.name_english.toLowerCase().includes(raw.toLowerCase()));
}
