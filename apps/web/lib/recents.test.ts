import { describe, expect, it } from "vitest";

import { addRecentPage, addRecentSearch, adoptNewer, RECENTS_LIMIT } from "./recents";

const page = (n: number, at = n) => ({ page: n, mushaf_id: 2, surah: null, at });

describe("recent pages", () => {
  it("counts consecutive turns as one place, at the page reached", () => {
    let list = addRecentPage([], { page: 10, mushaf_id: 2, at: 1 });
    list = addRecentPage(list, { page: 11, mushaf_id: 2, at: 2 });
    list = addRecentPage(list, { page: 13, mushaf_id: 2, at: 3 }); // a spread turns two
    expect(list.map((p) => p.page)).toEqual([13]);
  });

  it("starts a new place on a jump, newest first, and keeps one entry per page", () => {
    let list = addRecentPage([], { page: 10, mushaf_id: 2, at: 1 });
    list = addRecentPage(list, { page: 300, mushaf_id: 2, at: 2 });
    list = addRecentPage(list, { page: 10, mushaf_id: 2, at: 3 });
    expect(list.map((p) => p.page)).toEqual([10, 300]);
  });

  it("keeps the last five", () => {
    let list: ReturnType<typeof addRecentPage> = [];
    for (const n of [1, 50, 100, 150, 200, 250, 300]) list = addRecentPage(list, { page: n, mushaf_id: 2, at: n });
    expect(list).toHaveLength(RECENTS_LIMIT);
    expect(list.map((p) => p.page)).toEqual([300, 250, 200, 150, 100]);
  });

  it("doesn't join turns across editions", () => {
    let list = addRecentPage([], { page: 10, mushaf_id: 2, at: 1 });
    list = addRecentPage(list, { page: 11, mushaf_id: 1, at: 2 });
    expect(list).toHaveLength(2);
  });
});

describe("recent searches", () => {
  it("puts a repeated search first, once — spacing and diacritics don't make a new one", () => {
    let list = addRecentSearch([], { query: "رحمة", mode: "exact", at: 1 });
    list = addRecentSearch(list, { query: "رحم", mode: "root", at: 2 });
    list = addRecentSearch(list, { query: "  رَحْمَة ", mode: "exact", at: 3 });
    expect(list.map((s) => [s.query, s.mode])).toEqual([
      ["رَحْمَة", "exact"],
      ["رحم", "root"],
    ]);
  });

  it("keeps the same words in another mode apart, and ignores an empty query", () => {
    let list = addRecentSearch([], { query: "رحم", mode: "exact", at: 1 });
    list = addRecentSearch(list, { query: "رحم", mode: "root", at: 2 });
    expect(list).toHaveLength(2);
    expect(addRecentSearch(list, { query: "   ", mode: "exact" })).toBe(list);
  });
});

describe("the account's copy", () => {
  it("replaces the device's only when it holds something newer than the device's last change", () => {
    const local = [page(5, 100)];
    const remote = [page(9, 200)];
    expect(adoptNewer(local, remote, 100)).toEqual(remote);
    expect(adoptNewer(local, [page(9, 50)], 100)).toBe(local);
    // Cleared here after the account's entries were written: they don't come back.
    expect(adoptNewer([], remote, 300)).toEqual([]);
    expect(adoptNewer(local, [], 0)).toBe(local);
  });
});
