/**
 * Forgiving text matching for the public pages (the guide's filter, the
 * FAQ's "ask a question"): what a visitor types is folded the same way as
 * the page's text, in any interface language.
 */

/**
 * Lower case; no Latin accents; Arabic without diacritics or tatweel, one
 * alif, ة as ه, ى as ي; Persian/Urdu ی ک as ي ك; punctuation as spaces.
 */
export function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC")
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
    .replace(/\u0629/g, "\u0647")
    .replace(/[\u0649\u06cc]/g, "\u064a")
    .replace(/\u06a9/g, "\u0643")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim();
}

/** Does the folded text contain every word of the query (in any order)? An empty query matches everything. */
export function matchesAll(query: string, text: string): boolean {
  const words = foldText(query).split(" ").filter(Boolean);
  if (!words.length) return true;
  const haystack = foldText(text);
  return words.every((word) => haystack.includes(word));
}
