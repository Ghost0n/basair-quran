import type { RootDistributionResponse } from "@q-basair/shared";

/** One count per surah (Al-Fātiḥa first) from GET /api/root-distribution. */
export function rootSpreadCounts(spread: Pick<RootDistributionResponse, "surahs">): number[] {
  const counts = new Array<number>(114).fill(0);
  for (const item of spread.surahs) {
    if (item.surah_id >= 1 && item.surah_id <= 114) counts[item.surah_id - 1] = item.count;
  }
  return counts;
}
