import { nextVerse, sameVerse, type VersePosition, type VerseRange } from "@/lib/quran-ranges";

/**
 * The verse the recitation will play when `current` ends, if it simply goes
 * on: the same verse when it repeats, the range's start when the range
 * loops, nothing past the end of a range (or of the Quran). The player
 * loads it ahead (recitation-context.tsx) so it starts the moment the
 * current verse ends.
 */
export function upcomingVerse(
  current: VersePosition,
  options: { repeatAyah: boolean; range: (VerseRange & { repeat: boolean }) | null },
): VersePosition | null {
  if (options.repeatAyah) return current;
  const { range } = options;
  if (range && sameVerse(current, range.end)) return range.repeat ? range.start : null;
  return nextVerse(current);
}

/**
 * A tenth of a second of silence (public/silence.wav, served by the app
 * itself so the web's media-src policy allows it): played once under a tap
 * on the standby <audio>, so iOS later lets it start the next verse alone.
 */
export const SILENCE_URL = "/silence.wav";
