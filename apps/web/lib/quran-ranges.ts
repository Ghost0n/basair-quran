import { HIZB_STARTS, JUZ_STARTS, RUB_STARTS, type VerseKey } from "./quran-divisions.generated";

/**
 * Verse ranges over the Ḥafṣ (Madani) numbering — the numbering the reciters'
 * per-ayah audio follows. A range is inclusive at both ends.
 */

export type VersePosition = { surah: number; ayah: number };
export type VerseRange = { start: VersePosition; end: VersePosition };
export type DivisionKind = "surah" | "juz" | "hizb" | "rub";

/** Ayah count of each surah, Ḥafṣ ʿan ʿĀṣim (Kufan count). */
export const SURAH_AYAHS: readonly number[] = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
  29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
  11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

export const DIVISION_COUNT: Record<DivisionKind, number> = { surah: 114, juz: 30, hizb: 60, rub: 240 };

const STARTS: Record<Exclude<DivisionKind, "surah">, readonly VerseKey[]> = {
  juz: JUZ_STARTS,
  hizb: HIZB_STARTS,
  rub: RUB_STARTS,
};

export function ayahCount(surah: number): number {
  return SURAH_AYAHS[surah - 1] ?? 0;
}

/** <0 when a comes first, 0 when equal, >0 when a comes after b. */
export function compareVerses(a: VersePosition, b: VersePosition): number {
  return a.surah - b.surah || a.ayah - b.ayah;
}

export function sameVerse(a: VersePosition | null | undefined, b: VersePosition | null | undefined): boolean {
  return Boolean(a && b && a.surah === b.surah && a.ayah === b.ayah);
}

/** The verse after `position`, or null after the last verse of the Quran. */
export function nextVerse(position: VersePosition): VersePosition | null {
  if (position.ayah < ayahCount(position.surah)) return { surah: position.surah, ayah: position.ayah + 1 };
  return position.surah < 114 ? { surah: position.surah + 1, ayah: 1 } : null;
}

/** The verse before `position`, or null before the first verse. */
export function previousVerse(position: VersePosition): VersePosition | null {
  if (position.ayah > 1) return { surah: position.surah, ayah: position.ayah - 1 };
  return position.surah > 1 ? { surah: position.surah - 1, ayah: ayahCount(position.surah - 1) } : null;
}

export function inRange(position: VersePosition, range: VerseRange): boolean {
  return compareVerses(position, range.start) >= 0 && compareVerses(position, range.end) <= 0;
}

/** The whole of surah / juz / hizb / quarter number `n` (1-based). */
export function divisionRange(kind: DivisionKind, n: number): VerseRange {
  const count = DIVISION_COUNT[kind];
  const index = Math.min(Math.max(Math.round(n), 1), count);
  if (kind === "surah") return { start: { surah: index, ayah: 1 }, end: { surah: index, ayah: ayahCount(index) } };
  const starts = STARTS[kind];
  const [surah, ayah] = starts[index - 1];
  const following = starts[index];
  const end = following ? previousVerse({ surah: following[0], ayah: following[1] }) : { surah: 114, ayah: 6 };
  return { start: { surah, ayah }, end: end ?? { surah, ayah } };
}

/** Which surah / juz / hizb / quarter `position` falls in (1-based). */
export function divisionOf(kind: DivisionKind, position: VersePosition): number {
  if (kind === "surah") return position.surah;
  const starts = STARTS[kind];
  let found = 1;
  for (let index = 0; index < starts.length; index += 1) {
    const [surah, ayah] = starts[index];
    if (compareVerses({ surah, ayah }, position) <= 0) found = index + 1;
    else break;
  }
  return found;
}

/** A custom range, ordered and clamped to real verses. */
export function customRange(from: VersePosition, to: VersePosition): VerseRange {
  const clamp = (p: VersePosition): VersePosition => {
    const surah = Math.min(Math.max(Math.round(p.surah), 1), 114);
    return { surah, ayah: Math.min(Math.max(Math.round(p.ayah), 1), ayahCount(surah)) };
  };
  const a = clamp(from);
  const b = clamp(to);
  return compareVerses(a, b) <= 0 ? { start: a, end: b } : { start: b, end: a };
}
