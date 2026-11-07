import { beforeEach, describe, expect, it, vi } from "vitest";

const saved: Record<string, Record<string, number>> = {};
vi.mock("./audio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./audio")>();
  return { ...actual, downloadedAudio: async () => saved, downloadSurahAudio: vi.fn() };
});

import { runPool } from "./audio";
import { currentAudioJob, resetAudioJobForTests, startReciterDownload, stopReciterDownload } from "./audio-jobs";

const reciter = { id: "alafasy", audio_base: "https://example.test/alafasy" };
const surahs = [
  { id: 1, ayah_count: 7 },
  { id: 2, ayah_count: 3 },
  { id: 3, ayah_count: 2 },
];

describe("runPool", () => {
  it("runs every item, never more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    const seen: number[] = [];
    await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      seen.push(item);
      running -= 1;
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBe(3);
  });

  it("rejects with the first error", async () => {
    await expect(runPool([1, 2, 3], 2, async (item) => {
      if (item === 2) throw new Error("boom");
    })).rejects.toThrow("boom");
  });

  it("stops starting new items once aborted", async () => {
    const controller = new AbortController();
    const seen: number[] = [];
    await expect(
      runPool([1, 2, 3, 4], 1, async (item) => {
        seen.push(item);
        if (item === 2) controller.abort();
      }, controller.signal),
    ).rejects.toThrow("stopped");
    expect(seen).toEqual([1, 2]);
  });
});

describe("whole-recitation download", () => {
  beforeEach(() => {
    resetAudioJobForTests();
    for (const key of Object.keys(saved)) delete saved[key];
  });

  it("skips the surahs already on the device and counts their verses as done", async () => {
    saved.alafasy = { 1: 1000 };
    const download = vi.fn(async (_r, _surah, count: number, onProgress?: (done: number, total: number) => void) => {
      onProgress?.(count, count);
    });
    await startReciterDownload(reciter, surahs, download);
    expect(download.mock.calls.map((call) => call[1])).toEqual([2, 3]);
    expect(jobNow()).toMatchObject({ status: "done", done: 12, total: 12 });
  });

  it("stops between surahs and keeps what is complete", async () => {
    const download = vi.fn(async (_r, surah: number) => {
      if (surah === 1) stopReciterDownload();
    });
    await startReciterDownload(reciter, surahs, download);
    expect(download).toHaveBeenCalledTimes(1);
    expect(jobNow()).toMatchObject({ status: "stopped", done: 7 });
  });

  it("reports a failure without losing the progress", async () => {
    const download = vi.fn(async (_r, surah: number) => {
      if (surah === 2) throw new Error("offline");
    });
    await startReciterDownload(reciter, surahs, download);
    expect(jobNow()).toMatchObject({ status: "failed", done: 7 });
  });
});

function jobNow() {
  return currentAudioJob();
}
