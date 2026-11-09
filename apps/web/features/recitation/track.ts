import type { SurahRecitation } from "@q-basair/shared";

import { sameVerse, type VersePosition, type VerseRange } from "@/lib/quran-ranges";

/**
 * A prepared surah (docs/recitation-audio.md): one recording, and where each
 * verse sits in it (seconds). The player recites the whole surah from it and
 * follows the verses with these timings.
 */
export type Track = {
  /** "reciter:surah" */
  key: string;
  surah: number;
  url: string;
  duration: number;
  verses: { ayah: number; start: number; end: number }[];
};

export function toTrack(recitation: SurahRecitation, url: string): Track {
  return {
    key: `${recitation.reciter_id}:${recitation.surah}`,
    surah: recitation.surah,
    url,
    duration: recitation.duration_ms / 1000,
    verses: recitation.verses.map((verse) => ({ ayah: verse.ayah, start: verse.start_ms / 1000, end: verse.end_ms / 1000 })),
  };
}

/** Where reciting `ayah` starts: the surah's opening (its basmala) for the first verse. */
export function startOf(track: Track, ayah: number): number {
  if (ayah <= 1) return 0;
  return track.verses[ayah - 1]?.start ?? 0;
}

/** The verse being recited at `time` (the first before its start, the last after its end). */
export function verseAt(track: Track, time: number): number {
  const { verses } = track;
  let low = 0;
  let high = verses.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (verses[mid].start <= time) low = mid;
    else high = mid - 1;
  }
  return verses[low]?.ayah ?? 1;
}

/** Slightly before a verse's end counts as its end (timings are rounded to ms; timeupdate is coarse). */
const END_SLACK = 0.04;

export type BoundaryAction =
  | { kind: "none" }
  /** Moved on within the surah: follow it. */
  | { kind: "follow"; ayah: number }
  /** The verse repeats: back to its start. */
  | { kind: "loop-verse" }
  /** The chosen range ended: loop it, end the session, or stop at its start. */
  | { kind: "range-end" };

/**
 * What the player does at `time` while reciting `current` from `track`.
 * Called on every time update (and at timers set for precise ends).
 */
export function boundaryAction(
  track: Track,
  current: VersePosition,
  time: number,
  options: { repeatAyah: boolean; range: VerseRange | null },
): BoundaryAction {
  if (current.surah !== track.surah) return { kind: "none" };
  const verse = track.verses[current.ayah - 1];
  if (!verse) return { kind: "none" };
  const ended = time >= verse.end - END_SLACK;
  const at = verseAt(track, time);
  if (options.repeatAyah) return ended || at > current.ayah ? { kind: "loop-verse" } : { kind: "none" };
  const { range } = options;
  if (range && range.end.surah === track.surah && current.ayah <= range.end.ayah && (ended || at > current.ayah)) {
    // Ending the range's last verse, or skipping past it (a coarse update).
    if (sameVerse(current, range.end) || at > range.end.ayah) return { kind: "range-end" };
  }
  if (at !== current.ayah && (at > current.ayah || time < startOf(track, current.ayah) - END_SLACK)) {
    return { kind: "follow", ayah: at };
  }
  return { kind: "none" };
}

/** Seconds until the end of the verse being recited (for a precise stop or loop). */
export function untilVerseEnd(track: Track, current: VersePosition, time: number): number | null {
  const verse = current.surah === track.surah ? track.verses[current.ayah - 1] : undefined;
  return verse ? Math.max(0, verse.end - time) : null;
}
