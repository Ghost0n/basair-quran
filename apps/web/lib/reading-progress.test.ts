import { describe, expect, it } from "vitest";

import type { ReadingProgress } from "@q-basair/shared";

import {
  adoptNewerProgress,
  continueSeries,
  EMPTY_PROGRESS,
  observePage,
  READING_SERIES_LIMIT,
  resumeTracker,
  type SeriesTracker,
} from "./reading-progress";

const START: SeriesTracker = { activeId: null, lastSeen: null };

/** Pages seen in order, one second apart. */
function read(pages: number[], from: { progress?: ReadingProgress; tracker?: SeriesTracker; at?: number } = {}) {
  let progress = from.progress ?? EMPTY_PROGRESS;
  let tracker = from.tracker ?? START;
  let completed = false;
  let at = from.at ?? 1000;
  for (const page of pages) {
    const result = observePage(progress, tracker, { page, mushaf_id: 2, surah: `s${page}`, surah_id: 1, lastPage: 604, at: at++ });
    progress = result.progress;
    tracker = result.tracker;
    completed ||= result.completed;
  }
  return { progress, tracker, completed };
}

describe("page-turn series", () => {
  it("a page opened is not a series; turning on from it starts one", () => {
    expect(read([50]).progress.series).toEqual([]);
    const { progress } = read([50, 51, 52]);
    expect(progress.series).toHaveLength(1);
    expect(progress.series[0]).toMatchObject({ start: 50, end: 52, turns: 2, surah: "s52" });
  });

  it("a jump starts a new series; continue reading is the last page of the longest", () => {
    const { progress } = read([10, 11, 12, 13, 300, 301]);
    expect(progress.series.map((s) => [s.start, s.end, s.turns])).toEqual([
      [300, 301, 1],
      [10, 13, 3],
    ]);
    expect(continueSeries(progress)?.end).toBe(13);
  });

  it("the latest wins a tie", () => {
    const { progress } = read([10, 11, 300, 301]);
    expect(continueSeries(progress)?.end).toBe(301);
  });

  it("turns after «تابع القراءة» are added to the series it opened", () => {
    const first = read([10, 11, 12, 13, 300, 301]);
    const longest = continueSeries(first.progress)!;
    const { progress } = read([13, 14, 15], { progress: first.progress, tracker: resumeTracker(longest), at: 2000 });
    expect(progress.series).toHaveLength(2);
    expect(continueSeries(progress)).toMatchObject({ id: longest.id, start: 10, end: 15, turns: 5 });
  });

  it("turning on from where a series stopped continues it", () => {
    const first = read([10, 11, 12, 300]);
    const { progress } = read([12, 13], { progress: first.progress, tracker: first.tracker, at: 2000 });
    expect(progress.series).toHaveLength(1);
    expect(progress.series[0]).toMatchObject({ start: 10, end: 13, turns: 3 });
  });

  it("a spread turns two pages; the same page again changes nothing", () => {
    const first = read([11, 13, 13, 15]);
    expect(first.progress.series[0]).toMatchObject({ start: 11, end: 15, turns: 2 });
  });

  it("reaching the last page completes the reading: everything is cleared", () => {
    const { progress, completed } = read([10, 11, 602, 603, 604]);
    expect(completed).toBe(true);
    expect(progress.series).toEqual([]);
    expect(progress.reset_at).toBeGreaterThan(0);
    expect(continueSeries(progress)).toBeNull();
  });

  it("a spread whose facing page is the last one completes once it is drawn", () => {
    const first = read([601, 603]);
    expect(first.completed).toBe(false);
    const again = observePage(first.progress, first.tracker, { page: 603, mushaf_id: 2, lastPage: 603, at: 5000 });
    expect(again.completed).toBe(true);
  });

  it("keeps a bounded number of series, dropping the shortest", () => {
    let state = read([1, 2, 3, 4, 5]);
    for (let i = 0; i < READING_SERIES_LIMIT + 3; i += 1) {
      state = read([100 + i * 10, 101 + i * 10], { progress: state.progress, tracker: state.tracker, at: 2000 + i * 10 });
    }
    expect(state.progress.series).toHaveLength(READING_SERIES_LIMIT);
    expect(continueSeries(state.progress)?.end).toBe(5);
  });
});

describe("the account's copy", () => {
  it("replaces the device's only when it changed after the device's last change", () => {
    const local = read([10, 11]).progress;
    const remote = read([200, 201], { at: 9000 }).progress;
    expect(adoptNewerProgress(local, remote, 1001)).toEqual(remote);
    expect(adoptNewerProgress(local, read([200, 201], { at: 10 }).progress, 1001)).toBe(local);
    // Reset here after the account's series: they don't come back.
    expect(adoptNewerProgress({ series: [], reset_at: 9500 }, remote, 9500).series).toEqual([]);
  });
});
