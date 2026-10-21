import type { SurahListItem } from "@q-basair/shared";

export type SurahKind = "all" | "meccan" | "medinan";

/** The ids of the surahs of one kind (the index's «مكّيّة / مدنيّة» filter). */
export function surahsOfKind(surahs: readonly Pick<SurahListItem, "id" | "type">[], kind: SurahKind): Set<number> {
  return new Set(surahs.filter((surah) => kind === "all" || surah.type === kind).map((surah) => surah.id));
}

/** One ayah count per surah, Al-Fātiḥa first (the index's ribbon of lengths). */
export function surahLengths(surahs: readonly Pick<SurahListItem, "id" | "ayah_count">[]): number[] {
  const lengths = new Array<number>(114).fill(0);
  for (const surah of surahs) if (surah.id >= 1 && surah.id <= 114) lengths[surah.id - 1] = surah.ayah_count;
  return lengths;
}
