import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SILENCE_URL, upcomingVerse } from "./upcoming";

const none = { repeatAyah: false, range: null };

describe("upcomingVerse — what the player loads ahead", () => {
  it("is the next verse, across surahs", () => {
    expect(upcomingVerse({ surah: 1, ayah: 3 }, none)).toEqual({ surah: 1, ayah: 4 });
    expect(upcomingVerse({ surah: 1, ayah: 7 }, none)).toEqual({ surah: 2, ayah: 1 });
  });

  it("is nothing after the last verse of the Quran", () => {
    expect(upcomingVerse({ surah: 114, ayah: 6 }, none)).toBeNull();
  });

  it("is the same verse when the verse repeats", () => {
    expect(upcomingVerse({ surah: 2, ayah: 255 }, { repeatAyah: true, range: null })).toEqual({ surah: 2, ayah: 255 });
  });

  it("stops at the end of a range, or loops to its start", () => {
    const range = { start: { surah: 112, ayah: 1 }, end: { surah: 112, ayah: 4 } };
    expect(upcomingVerse({ surah: 112, ayah: 2 }, { repeatAyah: false, range: { ...range, repeat: false } })).toEqual({ surah: 112, ayah: 3 });
    expect(upcomingVerse({ surah: 112, ayah: 4 }, { repeatAyah: false, range: { ...range, repeat: false } })).toBeNull();
    expect(upcomingVerse({ surah: 112, ayah: 4 }, { repeatAyah: false, range: { ...range, repeat: true } })).toEqual({ surah: 112, ayah: 1 });
  });
});

describe("the silence that unlocks the standby player", () => {
  it("is a well-formed WAV in public/", () => {
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public", SILENCE_URL.slice(1));
    const bytes = readFileSync(file);
    expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString()).toBe("WAVE");
    expect(bytes.readUInt32LE(40)).toBe(bytes.length - 44);
  });
});
