/**
 * Recitations for offline listening, downloaded one surah at a time and
 * played from the device afterwards: a prepared surah's one recording and its
 * timings (docs/recitation-audio.md), or else the reciter's verse MP3s from
 * its public audio_base.
 */
import type { SurahRecitation } from "@q-basair/shared";

import { REMOTE_ORIGIN } from "./config";
import { appRuntime } from "./runtime";

const REGISTRY_KEY = "qb.audio";
const pad3 = (value: number) => String(value).padStart(3, "0");

export const audioPath = (reciter: string, surah: number, ayah: number) => `audio/${reciter}/${pad3(surah)}${pad3(ayah)}.mp3`;
/** A prepared surah's recording on the device (its timings are kept beside, in TIMING_KEY). */
export const recordingPath = (reciter: string, surah: number) => `audio/${reciter}/${pad3(surah)}.mp3`;
const TIMING_KEY = (reciter: string, surah: number) => `qb.audio.timing:${reciter}:${surah}`;

export type AudioRegistry = Record<string, Record<string, number>>; // reciter → surah → bytes

export async function downloadedAudio(): Promise<AudioRegistry> {
  const { platform } = await appRuntime();
  const raw = await platform.kv.get(REGISTRY_KEY);
  return raw ? (JSON.parse(raw) as AudioRegistry) : {};
}

/** The local file for this ayah, when its surah was downloaded for this reciter. */
export async function localAudioUrl(reciter: string, surah: number, ayah: number): Promise<string | null> {
  const registry = await downloadedAudio();
  if (!registry[reciter]?.[surah]) return null;
  const { platform } = await appRuntime();
  return platform.files.url(audioPath(reciter, surah, ayah));
}

/** A downloaded prepared surah: its timings and the file to play, or null. */
export async function localRecording(reciter: string, surah: number): Promise<{ recitation: SurahRecitation; url: string } | null> {
  const registry = await downloadedAudio();
  if (!registry[reciter]?.[surah]) return null;
  const { platform } = await appRuntime();
  const timing = await platform.kv.get(TIMING_KEY(reciter, surah));
  if (!timing) return null;
  const url = await platform.files.url(recordingPath(reciter, surah));
  return url ? { recitation: JSON.parse(timing) as SurahRecitation, url } : null;
}

/**
 * Run `work` over `items`, at most `concurrency` at a time, in order of start.
 * Stops starting new items once `signal` aborts (the ones under way finish)
 * and rejects with the first error.
 */
export async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  work: (item: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let next = 0;
  let failure: unknown = null;
  const lane = async () => {
    while (next < items.length && !failure && !signal?.aborted) {
      const item = items[next];
      next += 1;
      try {
        await work(item);
      } catch (error) {
        failure ??= error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, lane));
  if (failure) throw failure;
  if (signal?.aborted) throw new DOMException("Download stopped", "AbortError");
}

/** Files fetched at once: quicker than one by one, gentle on the reciter's server. */
const PARALLEL_FILES = 4;

export type DownloadableReciter = { id: string; audio_base: string; surahs?: number[] };

/** The prepared surah as one file + its timings (progress counts its verses, all at the end). */
async function downloadRecording(
  reciter: DownloadableReciter,
  surah: number,
  ayahCount: number,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<number> {
  const { platform } = await appRuntime();
  const answer = await fetch(`/api/recitations/${encodeURIComponent(reciter.id)}/${surah}`, { signal });
  if (!answer.ok) throw new Error(`recitation ${reciter.id} ${surah} (${answer.status})`);
  const recitation = (await answer.json()) as SurahRecitation;
  const url = /^https?:/.test(recitation.audio_url) ? recitation.audio_url : `${REMOTE_ORIGIN}${recitation.audio_url}`;
  const path = recordingPath(reciter.id, surah);
  let bytes: number;
  if (platform.files.download) {
    bytes = await platform.files.download(url, path);
  } else {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`recording ${reciter.id} ${surah} (${response.status})`);
    const data = new Uint8Array(await response.arrayBuffer());
    await platform.files.write(path, data);
    bytes = data.length;
  }
  await platform.kv.set(TIMING_KEY(reciter.id, surah), JSON.stringify(recitation));
  onProgress?.(ayahCount, ayahCount);
  return bytes;
}

export async function downloadSurahAudio(
  reciter: DownloadableReciter,
  surah: number,
  ayahCount: number,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const { platform } = await appRuntime();
  if (reciter.surahs?.includes(surah)) {
    const size = await downloadRecording(reciter, surah, ayahCount, onProgress, signal);
    const registry = await downloadedAudio();
    registry[reciter.id] = { ...(registry[reciter.id] ?? {}), [surah]: size };
    await platform.kv.set(REGISTRY_KEY, JSON.stringify(registry));
    return;
  }
  let bytes = 0;
  let done = 0;
  const ayahs = Array.from({ length: ayahCount }, (_, index) => index + 1);
  await runPool(
    ayahs,
    PARALLEL_FILES,
    async (ayah) => {
      const url = `${reciter.audio_base}/${pad3(surah)}${pad3(ayah)}.mp3`;
      const path = audioPath(reciter.id, surah, ayah);
      if (platform.files.download) {
        bytes += await platform.files.download(url, path);
      } else {
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`audio ${surah}:${ayah} (${response.status})`);
        const data = new Uint8Array(await response.arrayBuffer());
        await platform.files.write(path, data);
        bytes += data.length;
      }
      done += 1;
      onProgress?.(done, ayahCount);
    },
    signal,
  );
  // Registered only once every verse is on the device (a stopped surah downloads again).
  const registry = await downloadedAudio();
  registry[reciter.id] = { ...(registry[reciter.id] ?? {}), [surah]: bytes };
  await platform.kv.set(REGISTRY_KEY, JSON.stringify(registry));
}

export async function removeReciterAudio(reciter: string, surah?: number): Promise<void> {
  const { platform } = await appRuntime();
  const registry = await downloadedAudio();
  if (surah === undefined) {
    await platform.files.remove(`audio/${reciter}/`);
    delete registry[reciter];
  } else {
    // The surah's verse files (SSSAAA.mp3) and its recording (SSS.mp3) share the prefix.
    await platform.files.remove(`audio/${reciter}/${pad3(surah)}`);
    await platform.kv.remove(TIMING_KEY(reciter, surah));
    if (registry[reciter]) delete registry[reciter][surah];
  }
  await platform.kv.set(REGISTRY_KEY, JSON.stringify(registry));
}
