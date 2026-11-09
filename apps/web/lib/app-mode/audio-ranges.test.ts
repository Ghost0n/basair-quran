import { beforeEach, describe, expect, it, vi } from "vitest";

// The device: a key-value store and files (path → size); `download` stores a
// 10-byte file unless the URL is set to fail.
const store = new Map<string, string>();
const files = new Map<string, number>();
const fetched: string[] = [];
let failOn: string | null = null;
vi.mock("./runtime", () => ({
  appRuntime: async () => ({
    platform: {
      kv: {
        get: async (key: string) => store.get(key) ?? null,
        set: async (key: string, value: string) => void store.set(key, value),
        remove: async (key: string) => void store.delete(key),
      },
      files: {
        url: async (path: string) => (files.has(path) ? `file://${path}` : null),
        write: async (path: string, data: Uint8Array) => void files.set(path, data.length),
        remove: async (prefix: string) => {
          for (const path of [...files.keys()]) if (path.startsWith(prefix)) files.delete(path);
        },
        size: async () => 0,
        download: async (url: string, path: string) => {
          if (failOn && url.endsWith(failOn)) throw new Error("network");
          fetched.push(url.split("/").pop() as string);
          files.set(path, 10);
          return 10;
        },
      },
    },
  }),
}));
vi.mock("./config", () => ({ REMOTE_ORIGIN: "https://server.test" }));

import { downloadedAudio, localAudioUrl, partialAudio, removeReciterAudio } from "./audio";
import { downloadRangeAudio, FULL_QURAN, rangeOnDevice, rangeParts } from "./audio-ranges";

const verseFiles = { id: "husary", audio_base: "https://everyayah.test/Husary" };

beforeEach(() => {
  store.clear();
  files.clear();
  fetched.length = 0;
  failOn = null;
});

describe("rangeParts — a range, surah by surah", () => {
  it("cuts the first and last surah at the range's verses", () => {
    expect(rangeParts({ start: { surah: 112, ayah: 3 }, end: { surah: 114, ayah: 2 } })).toEqual([
      { surah: 112, from: 3, to: 4 },
      { surah: 113, from: 1, to: 5 },
      { surah: 114, from: 1, to: 2 },
    ]);
    expect(rangeParts(FULL_QURAN)).toHaveLength(114);
    expect(rangeParts(FULL_QURAN).reduce((sum, part) => sum + part.to - part.from + 1, 0)).toBe(6236);
  });
});

describe("downloading a range for offline listening", () => {
  it("downloads only the range's verses, plays them from the device, and resumes without fetching them again", async () => {
    const range = { start: { surah: 2, ayah: 1 }, end: { surah: 2, ayah: 5 } };
    const progress: [number, number][] = [];
    await downloadRangeAudio(verseFiles, range, (done, total) => progress.push([done, total]));
    expect(fetched.sort()).toEqual(["002001.mp3", "002002.mp3", "002003.mp3", "002004.mp3", "002005.mp3"]);
    expect(progress.at(-1)).toEqual([5, 5]);
    expect(await rangeOnDevice(verseFiles, range)).toEqual({ done: 5, total: 5 });
    // Not the whole surah: recorded as part of it.
    expect((await downloadedAudio()).husary?.[2]).toBeUndefined();
    expect((await partialAudio()).husary[2]).toEqual({ ayahs: [1, 2, 3, 4, 5], bytes: 50 });
    expect(await localAudioUrl("husary", 2, 3)).toBe("file://audio/husary/002003.mp3");
    expect(await localAudioUrl("husary", 2, 6)).toBeNull();

    fetched.length = 0;
    await downloadRangeAudio(verseFiles, { start: { surah: 2, ayah: 4 }, end: { surah: 2, ayah: 7 } });
    expect(fetched.sort()).toEqual(["002006.mp3", "002007.mp3"]);
  });

  it("counts a surah whole once all its verses are on the device", async () => {
    await downloadRangeAudio(verseFiles, { start: { surah: 112, ayah: 1 }, end: { surah: 112, ayah: 2 } });
    await downloadRangeAudio(verseFiles, { start: { surah: 112, ayah: 3 }, end: { surah: 113, ayah: 1 } });
    expect((await downloadedAudio()).husary).toEqual({ 112: 40 });
    expect((await partialAudio()).husary).toEqual({ 113: { ayahs: [1], bytes: 10 } });
  });

  it("downloads a prepared surah as its one recording, even for a few of its verses", async () => {
    const prepared = { id: "alafasy", audio_base: "", surahs: [112] };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ audio_url: "/api/recitations/audio/alafasy/112.mp3?v=1", verses: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const range = { start: { surah: 112, ayah: 2 }, end: { surah: 113, ayah: 1 } };
    // Surah 113 isn't prepared and the reciter has no verse files: not part of what can be downloaded.
    expect(await rangeOnDevice(prepared, range)).toEqual({ done: 0, total: 3 });
    await downloadRangeAudio(prepared, range);
    expect(fetched).toEqual(["112.mp3?v=1"]);
    expect((await downloadedAudio()).alafasy).toEqual({ 112: 10 });
    expect(await rangeOnDevice(prepared, range)).toEqual({ done: 3, total: 3 });
    vi.unstubAllGlobals();
  });

  it("keeps what arrived when a verse fails, and removing the reciter clears it all", async () => {
    failOn = "002004.mp3";
    await expect(downloadRangeAudio(verseFiles, { start: { surah: 2, ayah: 1 }, end: { surah: 2, ayah: 6 } })).rejects.toThrow("network");
    const kept = (await partialAudio()).husary[2].ayahs;
    expect(kept).not.toContain(4);
    expect(kept.length).toBeGreaterThan(0);
    await removeReciterAudio("husary");
    expect(await partialAudio()).toEqual({});
    expect(files.size).toBe(0);
  });
});
