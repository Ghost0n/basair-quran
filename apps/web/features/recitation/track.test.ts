import { describe, expect, it } from "vitest";

import { boundaryAction, startOf, toTrack, untilVerseEnd, verseAt } from "./track";

// Al-Ikhlāṣ: a 1.5 s opening (basmala), then four verses.
const track = toTrack(
  {
    reciter_id: "alafasy",
    surah: 112,
    audio_url: "/api/recitations/audio/alafasy/112.mp3?v=1",
    duration_ms: 12_000,
    bytes: 1,
    attribution: "",
    verses: [
      { ayah: 1, start_ms: 1500, end_ms: 4000 },
      { ayah: 2, start_ms: 4000, end_ms: 6000 },
      { ayah: 3, start_ms: 6000, end_ms: 9000 },
      { ayah: 4, start_ms: 9000, end_ms: 12_000 },
    ],
  },
  "https://example.test/112.mp3",
);
const at = (ayah: number) => ({ surah: 112, ayah });
const none = { repeatAyah: false, range: null };

describe("track — following a prepared surah", () => {
  it("finds the verse at a moment, and where each verse starts (the first with its basmala)", () => {
    expect(track.key).toBe("alafasy:112");
    expect(verseAt(track, 0)).toBe(1);
    expect(verseAt(track, 4.0)).toBe(2);
    expect(verseAt(track, 8.9)).toBe(3);
    expect(verseAt(track, 99)).toBe(4);
    expect(startOf(track, 1)).toBe(0);
    expect(startOf(track, 3)).toBe(6);
    expect(untilVerseEnd(track, at(2), 5.5)).toBeCloseTo(0.5);
  });

  it("follows the recording from verse to verse", () => {
    expect(boundaryAction(track, at(1), 3.5, none)).toEqual({ kind: "none" });
    expect(boundaryAction(track, at(1), 4.1, none)).toEqual({ kind: "follow", ayah: 2 });
    // A coarse update that skipped a verse still lands on the right one.
    expect(boundaryAction(track, at(1), 6.5, none)).toEqual({ kind: "follow", ayah: 3 });
    // Seeking back (outside the player's own seek) follows too.
    expect(boundaryAction(track, at(3), 4.5, none)).toEqual({ kind: "follow", ayah: 2 });
  });

  it("loops a repeated verse at its end", () => {
    const repeat = { repeatAyah: true, range: null };
    expect(boundaryAction(track, at(2), 5.0, repeat)).toEqual({ kind: "none" });
    expect(boundaryAction(track, at(2), 5.97, repeat)).toEqual({ kind: "loop-verse" });
    expect(boundaryAction(track, at(2), 6.3, repeat)).toEqual({ kind: "loop-verse" });
  });

  it("ends a chosen range at its last verse, even when an update skipped past it", () => {
    const range = { start: at(1), end: at(2) };
    expect(boundaryAction(track, at(1), 4.2, { repeatAyah: false, range })).toEqual({ kind: "follow", ayah: 2 });
    expect(boundaryAction(track, at(2), 5.99, { repeatAyah: false, range })).toEqual({ kind: "range-end" });
    expect(boundaryAction(track, at(1), 6.5, { repeatAyah: false, range })).toEqual({ kind: "range-end" });
    // A range ending in another surah doesn't stop this one.
    expect(boundaryAction(track, at(4), 11.99, { repeatAyah: false, range: { start: at(1), end: { surah: 113, ayah: 2 } } })).toEqual({
      kind: "none",
    });
  });

  it("ignores another surah's verse", () => {
    expect(boundaryAction(track, { surah: 113, ayah: 1 }, 5, none)).toEqual({ kind: "none" });
  });
});
