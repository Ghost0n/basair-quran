import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { DIRECT_SOURCES, directRecitation, fromMp3quran, fromQdc, hasDirectSource, resetDirectSourcesForTests } from "./direct-source";

/** A stand-in for the network: URL → JSON body (anything else is a 404); records what was asked. */
function fakeFetch(routes: Record<string, unknown>) {
  const asked: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    return url in routes ? new Response(JSON.stringify(routes[url])) : new Response("", { status: 404 });
  }) as typeof fetch;
  return { impl, asked };
}

const QDC = (id: number, surah: number) => `https://api.qurancdn.com/api/qdc/audio/reciters/${id}/audio_files?chapter=${surah}&segments=true`;
const READS = "https://www.mp3quran.net/api/v3/ayat_timing/reads";
const TIMING = (read: number, surah: number) => `https://www.mp3quran.net/api/v3/ayat_timing?surah=${surah}&read=${read}`;

// Al-Ikhlas: 4 verses.
const qdcIkhlas = {
  audio_files: [
    {
      audio_url: "https://download.quranicaudio.com/qdc/mishari_al_afasy/murattal/112.mp3",
      duration: 16000,
      file_size: 250000,
      verse_timings: [
        { verse_key: "112:2", timestamp_from: 5000, timestamp_to: 8000 },
        { verse_key: "112:1", timestamp_from: 0, timestamp_to: 5000 },
        { verse_key: "112:3", timestamp_from: 8000, timestamp_to: 11000 },
        { verse_key: "112:4", timestamp_from: 11000, timestamp_to: 15500 },
      ],
    },
  ],
};
const mp3Ikhlas = [
  { ayah: 0, start_time: 0, end_time: 4000 }, // the basmala row
  { ayah: 1, start_time: 4000, end_time: 7000 },
  { ayah: 2, start_time: 7000, end_time: 9000 },
  { ayah: 3, start_time: 9000, end_time: 12000 },
  { ayah: 4, start_time: 12000, end_time: 16000 },
];

beforeEach(() => resetDirectSourcesForTests());

describe("a surah straight from its public source", () => {
  it("reads Quran.com's chapter file and verse timings", async () => {
    const { impl } = fakeFetch({ [QDC(7, 112)]: qdcIkhlas });
    const found = await fromQdc(7, 112, impl);
    expect(found).toMatchObject({ surah: 112, audio_url: qdcIkhlas.audio_files[0].audio_url, duration_ms: 16000, attribution: "Quran.com (quranicaudio.com)" });
    expect(found?.verses.map((verse) => [verse.ayah, verse.start_ms, verse.end_ms])).toEqual([
      [1, 0, 5000],
      [2, 5000, 8000],
      [3, 8000, 11000],
      [4, 11000, 15500],
    ]);
  });

  it("reads mp3quran's surah file and the timed read's verses (not its basmala row)", async () => {
    const { impl } = fakeFetch({ [READS]: [{ id: 123, folder_url: "https://cdn.mp3quran.net/audio/mishary-alafasy/r1/" }], [TIMING(123, 112)]: mp3Ikhlas });
    const found = await fromMp3quran(123, 112, impl);
    expect(found?.audio_url).toBe("https://cdn.mp3quran.net/audio/mishary-alafasy/r1/112.mp3");
    expect(found?.verses.map((verse) => verse.ayah)).toEqual([1, 2, 3, 4]);
    expect(found?.verses[0].start_ms).toBe(4000);
  });

  it("refuses timings that miss a verse, and audio on another host", async () => {
    const missing = { audio_files: [{ ...qdcIkhlas.audio_files[0], verse_timings: qdcIkhlas.audio_files[0].verse_timings.slice(0, 3) }] };
    expect(await fromQdc(7, 112, fakeFetch({ [QDC(7, 112)]: missing }).impl)).toBeNull();
    const elsewhere = { audio_files: [{ ...qdcIkhlas.audio_files[0], audio_url: "https://evil.example.org/112.mp3" }] };
    expect(await fromQdc(7, 112, fakeFetch({ [QDC(7, 112)]: elsewhere }).impl)).toBeNull();
  });

  it("tries the reciter's sources in order: Quran.com, then mp3quran", async () => {
    const { impl, asked } = fakeFetch({ [READS]: [{ id: 123, folder_url: "https://cdn.mp3quran.net/audio/mishary-alafasy/r1/" }], [TIMING(123, 112)]: mp3Ikhlas });
    const found = await directRecitation("alafasy", 112, impl);
    expect(found).toMatchObject({ reciter_id: "alafasy", attribution: "mp3quran.net" });
    expect(asked[0]).toBe(QDC(7, 112)); // Quran.com first (it had nothing)
  });

  it("gives nothing for a reciter without a whole-surah source", async () => {
    expect(hasDirectSource("someone-else")).toBe(false);
    expect(await directRecitation("someone-else", 112, fakeFetch({}).impl)).toBeNull();
  });

  it("knows the same sources as the server's preparation (scripts/recitation_sources.json)", () => {
    const file = resolve(__dirname, "../../../../scripts/recitation_sources.json");
    const config = JSON.parse(readFileSync(file, "utf8")) as { reciters: { id: string; sources: Record<string, unknown>[] }[] };
    const expected = Object.fromEntries(
      config.reciters
        .map((reciter) => [reciter.id, reciter.sources.filter((source) => "qdc" in source || "mp3quran" in source)] as const)
        .filter(([, sources]) => sources.length),
    );
    expect(DIRECT_SOURCES).toEqual(expected);
  });
});
