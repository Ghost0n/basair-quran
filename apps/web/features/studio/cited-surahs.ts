/** How many cited verses come from each surah (Al-Fātiḥa first): the evidence ribbon. */
export function citedSurahCounts(ayahs: readonly { surah_id: number }[]): number[] {
  const counts = new Array<number>(114).fill(0);
  for (const ayah of ayahs) if (ayah.surah_id >= 1 && ayah.surah_id <= 114) counts[ayah.surah_id - 1] += 1;
  return counts;
}
