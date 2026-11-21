import type { PaginatedSearchResponse, ResearchSearchItem, SearchVerse } from "@q-basair/shared";

/** How many more ayahs one tap on «آيات أخرى» shows. */
export const MORE_AYAHS_STEP = 8;
// The searches read again for more ayahs, and how many of each (the search's page cap).
const MAX_SEARCHES = 6;
const PER_SEARCH = 50;

type SearchV2 = (query: string, mode: ResearchSearchItem["mode"], mushaf: number, pageSize: number) => Promise<PaginatedSearchResponse>;

/** Whether an answer's searches found more ayahs than it shows. */
export function hasMoreAyahs(searches: readonly ResearchSearchItem[], shown: number): boolean {
  return searches.reduce((sum, search) => sum + (search.result_count || 0), 0) > shown;
}

/**
 * The ayahs an answer's own searches found beyond those it shows: the same
 * Quran searches run again (no model involved), each search's verses in its
 * order, taken in turn from each search so one root doesn't crowd out the
 * others; an ayah appears once.
 */
export async function loadMoreAyahsPool(
  searchV2: SearchV2,
  searches: readonly ResearchSearchItem[],
  mushaf: number,
  shownIds: ReadonlySet<number>,
): Promise<SearchVerse[]> {
  const used = searches.filter((search) => search.result_count > 0 && search.query.trim()).slice(0, MAX_SEARCHES);
  const lists = await Promise.all(
    used.map((search) =>
      searchV2(search.query, search.mode, mushaf, PER_SEARCH).then(
        (answer) => answer.results.flatMap((result) => result.verses),
        () => [] as SearchVerse[],
      ),
    ),
  );
  return interleave(lists, shownIds);
}

export function interleave(lists: SearchVerse[][], shownIds: ReadonlySet<number>): SearchVerse[] {
  const seen = new Set(shownIds);
  const pool: SearchVerse[] = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let index = 0; index < longest; index += 1) {
    for (const list of lists) {
      const verse = list[index];
      if (!verse || seen.has(verse.ayah_id)) continue;
      seen.add(verse.ayah_id);
      pool.push(verse);
    }
  }
  return pool;
}
