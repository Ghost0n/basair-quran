/**
 * Text normalization, ported from src/app/services/quran_service.py. Every
 * function keeps the server's name (camelCased) and behaviour: search results
 * and highlights depend on these being identical.
 */
import { PY_SPACE_CLASS, chars, isSpace, split, strip } from "./py";

const SEARCH_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭ]/g;
const PY_SPACES = new RegExp(`[${PY_SPACE_CLASS}]+`, "g");

export const ARTICLE_LEMMA = "ال";
export const SUPPORTED_PREFIX_LEMMAS = new Set(["و", "ف", "ب", "ك", "ل"]);

// Qālūn and Warsh write some letters the other narrations write otherwise: a
// yā' barī «ے» is a yā' (فِے, رَبِّے), and a yā' carrying a separate hamza
// mark is «ئ» (يَسْتَهْزِۓُ). Folded before any other normalization so that
// a word reads, and is searched, the same in every narration.
const SEATED_HAMZA = /[\u064A\u06D2]([\u064B-\u0653\u0655-\u065F\u0670]*)\u0654/g;

/** Fold the narrations' spellings of yā' and seated hamza (see above). */
export function foldNarrationLetters(text: string): string {
  return text.replace(SEATED_HAMZA, "\u0626$1").replaceAll("\u06D2", "\u064A");
}

/** Matches build_db normalization logic. */
export function normalizeTextSearch(text: string): string {
  let result = foldNarrationLetters(text).replace(SEARCH_MARKS, "");
  result = result.replace(/[أإآٱ]/g, "ا");
  result = result.replaceAll("ء", "");
  return strip(result);
}

export function normalizeQuerySearch(text: string): string {
  return split(normalizeTextSearch(text)).join(" ");
}

export function containsLatinText(text: string | null | undefined): boolean {
  return /[A-Za-z0-9]/.test(text ?? "");
}

export function normalizeLatinLookup(text: string | null | undefined): string {
  let normalized = (text ?? "").toLowerCase();
  normalized = normalized.replaceAll("’", "'").replaceAll("`", "'");
  normalized = normalized.replace(new RegExp(`[^a-z0-9'${PY_SPACE_CLASS}]`, "gu"), " ");
  normalized = strip(normalized.replace(PY_SPACES, " "));
  normalized = normalized.replaceAll("aa", "a").replaceAll("ee", "i").replaceAll("ii", "i");
  normalized = normalized.replaceAll("oo", "u").replaceAll("ou", "u").replaceAll("uu", "u");
  return normalized;
}

export function buildLatinSkeleton(text: string): string {
  let normalized = normalizeLatinLookup(text);
  normalized = normalized.replaceAll("kh", "5").replaceAll("gh", "4").replaceAll("sh", "x");
  normalized = normalized.replaceAll("th", "v").replaceAll("dh", "c").replaceAll("ch", "x");
  normalized = normalized.replaceAll("ph", "f");
  normalized = normalized.replace(/[aeiouyw']/g, "");
  normalized = normalized.replaceAll("5", "kh").replaceAll("4", "gh").replaceAll("x", "sh");
  normalized = normalized.replaceAll("v", "th").replaceAll("c", "dh");
  return normalized;
}

const LATIN: Record<string, string> = {
  "ا": "a", "أ": "a", "إ": "a", "آ": "a", "ٱ": "a", "ب": "b", "ت": "t", "ث": "th", "ج": "j", "ح": "h",
  "خ": "kh", "د": "d", "ذ": "dh", "ر": "r", "ز": "z", "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t",
  "ظ": "z", "ع": "3", "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h",
  "ة": "h", "و": "w", "ي": "y", "ى": "a",
};

export function arabicTextToLatin(text: string): string {
  return chars(plainArabicDisplayText(text))
    .filter((char) => !isSpace(char))
    .map((char) => LATIN[char] ?? "")
    .join("");
}

export type LatinVariants = { full: string[]; skeleton: string[] };

const sortedUnique = (values: Iterable<string>) => [...new Set(values)].sort(codePointOrder);

function codePointOrder(a: string, b: string): number {
  // Latin keys are ASCII: plain comparison is code-point order.
  return a < b ? -1 : a > b ? 1 : 0;
}

export function buildLatinKeyVariants(arabicText: string): LatinVariants {
  let latinKey = normalizeLatinLookup(arabicTextToLatin(arabicText));
  if (!latinKey) latinKey = normalizeLatinLookup(arabicText);
  const variants = new Set<string>(latinKey ? [latinKey] : []);
  const plainText = plainArabicDisplayText(arabicText);
  if (plainText.startsWith("ال") && chars(plainText).length > 2) {
    const articleless = normalizeLatinLookup(arabicTextToLatin(chars(plainText).slice(2).join("")));
    if (articleless) variants.add(articleless);
  }
  const present = [...variants].filter(Boolean);
  return { full: sortedUnique(present), skeleton: sortedUnique(present.map(buildLatinSkeleton)) };
}

export function rankLatinVariantMatch(queryFull: string, querySkeleton: string, variants: LatinVariants): [number, number] | null {
  let best: [number, number] | null = null;
  const consider = (rank: [number, number]) => {
    if (best === null || rank[0] < best[0] || (rank[0] === best[0] && rank[1] < best[1])) best = rank;
  };
  for (const key of variants.full) {
    if (key === queryFull) consider([0, chars(key).length]);
    else if (key.startsWith(queryFull)) consider([1, chars(key).length]);
  }
  if (querySkeleton) {
    for (const key of variants.skeleton) {
      if (key === querySkeleton) consider([2, chars(key).length]);
      else if (key.startsWith(querySkeleton)) consider([3, chars(key).length]);
    }
  }
  return best;
}

export function standardizeUthmani(text: string): string {
  return foldNarrationLetters(text)
    .replace(/ٱ/g, "ا")
    .replace(/ٰ/g, "ا")
    .replace(/[ۥۦ]/g, "")
    .replace(/ٞ/g, "ٌ")
    .replace(/[ْۡ]/g, "")
    .replace(/[ۖ-ۭ]/g, "");
}

const SHORT_VOWELS = "َُِ";

export function uthmaniMatchesQuery(queryStandard: string, candidateText: string): boolean {
  const candidateStandard = standardizeUthmani(candidateText);
  if (candidateStandard === queryStandard) return true;
  const query = chars(queryStandard);
  if (query[0] === "ا" && (query.length === 1 || !SHORT_VOWELS.includes(query[1]))) {
    return candidateStandard.replace(/^ا[َُِ]/, "ا") === queryStandard;
  }
  return false;
}

export function removeQuranicPauseMarks(text: string): string {
  return strip(text.replace(/[ۖ-ۭ]/g, ""));
}

export function plainArabicDisplayText(text: string): string {
  const result = text
    .replace(/ٱ/g, "ا")
    .replace(/[ۥۦ]/g, "")
    .replace(/ٞ/g, "ٌ")
    .replace(/ۡ/g, "")
    .replace(/[ؐ-ًؚ-ِْ-ٰٟۖ-ۭ]/g, "")
    .replace(PY_SPACES, " ");
  return strip(result);
}

const MARK = /^[ؐ-ًؚ-ٰٟۖ-ۭ]/;

export function isArabicMark(char: string): boolean {
  return MARK.test(char);
}

export function stripLeadingBaseLetters(text: string, count: number): string {
  if (count <= 0) return text;
  const letters = chars(text);
  let stripped = 0;
  let index = 0;
  while (index < letters.length && stripped < count) {
    if (!isArabicMark(letters[index]) && !isSpace(letters[index])) stripped += 1;
    index += 1;
  }
  while (index < letters.length && isArabicMark(letters[index])) index += 1;
  return strip(letters.slice(index).join(""));
}

export type VariantRecord = {
  search_simple: string;
  search_text: string;
  stripped_prefix_count: number;
  stripped_article_count: number;
};

export function buildCandidateSurfaceText(surfaceText: string, record: Partial<VariantRecord>): string {
  let strippedCount = record.stripped_prefix_count ?? 0;
  if (record.stripped_article_count) strippedCount += 2;
  return stripLeadingBaseLetters(surfaceText, strippedCount);
}

export function hasQueryDiacritics(text: string): boolean {
  return /[ً-ِْٰ]/.test(text);
}

export type QueryToken = { raw: string; simple: string; has_diacritics: boolean; standardized: string };

export function tokenizeExactQuery(query: string): QueryToken[] {
  const tokens: QueryToken[] = [];
  for (let raw of split(query)) {
    raw = strip(raw);
    if (!raw) continue;
    const simple = normalizeTextSearch(raw);
    if (!simple) continue;
    tokens.push({ raw, simple, has_diacritics: hasQueryDiacritics(raw), standardized: standardizeUthmani(raw) });
  }
  return tokens;
}

export function buildExactQuerySimple(query: string): string {
  return tokenizeExactQuery(query).map((token) => token.simple).join(" ");
}

export function buildExactQueryLabel(query: string, tokens: QueryToken[]): string {
  if (tokens.length) return tokens.map((token) => token.raw).join(" ");
  return strip(query);
}

export function formatSuggestionText(text: string, withChakl: boolean): string {
  return withChakl ? removeQuranicPauseMarks(text) : plainArabicDisplayText(text);
}

/** The rasm used for counting: search normalization, no tatweel, single spaces. */
export function normalizeCountText(text: string): string {
  return split(normalizeTextSearch(text).replaceAll("ـ", "")).join(" ");
}
