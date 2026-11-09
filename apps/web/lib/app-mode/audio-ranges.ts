/**
 * Downloading a recitation RANGE for offline listening (the recitation
 * sheet's «للاستماع دون اتصال»): the chosen range, the page, the surah, the
 * juz — or the whole Quran — for the reciter being listened to.
 *
 * Per surah of the range:
 *  - a surah prepared as one recording (docs/recitation-audio.md) downloads
 *    whole (one file + its timings), even for a few of its verses;
 *  - otherwise only the range's verse files download, recorded in the
 *    "partial" register (audio.ts); once every verse of the surah is on the
 *    device it counts as a whole surah, like those from Settings.
 * What is already on the device is skipped, so a stopped download resumes.
 */
import { ayahCount, type VerseRange } from "@/lib/quran-ranges";

import {
  downloadSurahAudio,
  downloadVerseFile,
  downloadedAudio,
  partialAudio,
  runPool,
  saveDownloadedAudio,
  savePartialAudio,
  type DownloadableReciter,
} from "./audio";

export const FULL_QURAN: VerseRange = { start: { surah: 1, ayah: 1 }, end: { surah: 114, ayah: 6 } };

export type RangePart = { surah: number; from: number; to: number };

/** The range, surah by surah (first and last verse of each). */
export function rangeParts(range: VerseRange): RangePart[] {
  const parts: RangePart[] = [];
  for (let surah = range.start.surah; surah <= range.end.surah; surah += 1) {
    const from = surah === range.start.surah ? range.start.ayah : 1;
    const to = surah === range.end.surah ? range.end.ayah : ayahCount(surah);
    if (to >= from) parts.push({ surah, from, to });
  }
  return parts;
}

/** The surahs of the range this reciter can be heard in (verse files, or a prepared recording). */
function available(reciter: DownloadableReciter, parts: RangePart[]): RangePart[] {
  return parts.filter((part) => Boolean(reciter.audio_base) || Boolean(reciter.surahs?.includes(part.surah)));
}

const count = (part: RangePart) => part.to - part.from + 1;

/** How much of the range is on the device for this reciter, in verses. */
export async function rangeOnDevice(reciter: DownloadableReciter, range: VerseRange): Promise<{ done: number; total: number }> {
  const parts = available(reciter, rangeParts(range));
  const whole = (await downloadedAudio())[reciter.id] ?? {};
  const partial = (await partialAudio())[reciter.id] ?? {};
  let done = 0;
  for (const part of parts) {
    if (whole[part.surah]) done += count(part);
    else done += (partial[part.surah]?.ayahs ?? []).filter((ayah) => ayah >= part.from && ayah <= part.to).length;
  }
  return { done, total: parts.reduce((sum, part) => sum + count(part), 0) };
}

/** Files fetched at once (as for a whole surah). */
const PARALLEL_FILES = 4;

export async function downloadRangeAudio(
  reciter: DownloadableReciter,
  range: VerseRange,
  onProgress?: (done: number, total: number, surah: number | null) => void,
  signal?: AbortSignal,
): Promise<void> {
  const parts = available(reciter, rangeParts(range));
  let { done, total } = await rangeOnDevice(reciter, range);
  onProgress?.(done, total, null);
  for (const part of parts) {
    if (signal?.aborted) throw new DOMException("Download stopped", "AbortError");
    if ((await downloadedAudio())[reciter.id]?.[part.surah]) continue;
    const partial = await partialAudio();
    const record = partial[reciter.id]?.[part.surah] ?? { ayahs: [], bytes: 0 };
    const have = new Set(record.ayahs);
    const inPart = (ayah: number) => ayah >= part.from && ayah <= part.to;
    onProgress?.(done, total, part.surah);

    if (reciter.surahs?.includes(part.surah)) {
      // One recording for the whole surah.
      await downloadSurahAudio(reciter, part.surah, ayahCount(part.surah), undefined, signal);
      done += count(part) - record.ayahs.filter(inPart).length;
      onProgress?.(done, total, part.surah);
      continue;
    }

    const missing: number[] = [];
    for (let ayah = part.from; ayah <= part.to; ayah += 1) if (!have.has(ayah)) missing.push(ayah);
    try {
      await runPool(
        missing,
        PARALLEL_FILES,
        async (ayah) => {
          // Read the total after the await: four files arrive at once.
          const size = await downloadVerseFile(reciter, part.surah, ayah, signal);
          record.bytes += size;
          have.add(ayah);
          done += 1;
          onProgress?.(done, total, part.surah);
        },
        signal,
      );
    } finally {
      // What arrived stays recorded, even when stopped or failed.
      record.ayahs = [...have].sort((a, b) => a - b);
      const latest = await partialAudio();
      latest[reciter.id] = { ...(latest[reciter.id] ?? {}), [part.surah]: record };
      if (record.ayahs.length === ayahCount(part.surah)) {
        // Every verse of the surah: it is a whole surah now.
        delete latest[reciter.id][part.surah];
        const registry = await downloadedAudio();
        registry[reciter.id] = { ...(registry[reciter.id] ?? {}), [part.surah]: record.bytes };
        await saveDownloadedAudio(registry);
      }
      await savePartialAudio(latest);
    }
  }
  onProgress?.(done, total, null);
}
