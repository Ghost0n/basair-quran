import type { FeedQuery } from "@q-basair/shared";

/** The community feed's filter state (search, sort and narrowing filters). */
export type FeedFilters = {
  sort: "latest" | "top";
  q: string;
  surah: number | null;
  tag: string | null;
  board: boolean;
  author: { id: number; name: string } | null;
};

export const EMPTY_FILTERS: FeedFilters = { sort: "top", q: "", surah: null, tag: null, board: false, author: null };

/** Filters that narrow the list (the sort order doesn't count). */
export function activeFilterCount(filters: FeedFilters): number {
  return [filters.q.trim(), filters.surah, filters.tag, filters.board || null, filters.author].filter(Boolean).length;
}

export function feedQuery(filters: FeedFilters, q: string, saved: boolean, cursor: string | null): FeedQuery {
  return {
    cursor,
    sort: filters.sort,
    q,
    surah: filters.surah,
    tag: filters.tag,
    board: filters.board,
    author: filters.author?.id ?? null,
    saved,
  };
}
