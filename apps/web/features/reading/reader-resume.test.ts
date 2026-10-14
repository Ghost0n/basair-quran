import { describe, expect, it } from "vitest";

import { readerOpenPlan, readerRetryDelay } from "./reader-resume";

const position = { ayah_id: 300, mushaf_id: 2, surah: 2, ayah: 293, page: 49, updated_at: 1 };

describe("readerOpenPlan", () => {
  it("resumes at the saved verse on the first attempt", () => {
    expect(readerOpenPlan({ position, mushafId: 2, lastPage: 7, attempt: 0 })).toEqual({ kind: "ayah", ayahId: 300 });
  });

  it("resumes a verse saved in another riwāyah by its reference", () => {
    expect(readerOpenPlan({ position: { ...position, mushaf_id: 1 }, mushafId: 2, lastPage: 7, attempt: 0 })).toEqual({
      kind: "surah",
      surah: 2,
      ayah: 293,
    });
  });

  it("opens the last page read when there is no saved verse", () => {
    expect(readerOpenPlan({ position: null, mushafId: 2, lastPage: 7, attempt: 0 })).toEqual({ kind: "page", page: 7 });
  });

  it("falls back to the plain page once the first load failed", () => {
    // The saved verse's page in this mushaf…
    expect(readerOpenPlan({ position, mushafId: 2, lastPage: 7, attempt: 1 })).toEqual({ kind: "page", page: 49 });
    // …else the device's last page (another riwāyah's page number means nothing here).
    expect(readerOpenPlan({ position: { ...position, mushaf_id: 1 }, mushafId: 2, lastPage: 7, attempt: 2 })).toEqual({
      kind: "page",
      page: 7,
    });
    expect(readerOpenPlan({ position: null, mushafId: 2, lastPage: Number.NaN, attempt: 1 })).toEqual({ kind: "page", page: 1 });
  });
});

describe("readerRetryDelay", () => {
  it("retries a failed first load a few times, then waits for the reader", () => {
    expect(readerRetryDelay(1)).toBe(1000);
    expect(readerRetryDelay(2)).toBe(3000);
    expect(readerRetryDelay(3)).toBe(8000);
    expect(readerRetryDelay(4)).toBeNull();
  });
});
