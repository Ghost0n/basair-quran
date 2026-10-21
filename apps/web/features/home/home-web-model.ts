/**
 * The reading card's ribbon (web design): the surahs before the current one,
 * in Mushaf order — where you are, not a record of what was read.
 */
export function positionCounts(surah: number | null): number[] {
  const here = surah == null ? 0 : Math.max(0, Math.min(114, surah));
  return Array.from({ length: 114 }, (_, i) => (i < here - 1 ? 1 : 0));
}
