/**
 * Recitations for offline listening: a reciter's ayah MP3s, downloaded one
 * surah at a time from the reciter's public audio_base and played from the
 * device afterwards.
 */
import { appRuntime } from "./runtime";

const REGISTRY_KEY = "qb.audio";
const pad3 = (value: number) => String(value).padStart(3, "0");

export const audioPath = (reciter: string, surah: number, ayah: number) => `audio/${reciter}/${pad3(surah)}${pad3(ayah)}.mp3`;

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

export async function downloadSurahAudio(
  reciter: { id: string; audio_base: string },
  surah: number,
  ayahCount: number,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const { platform } = await appRuntime();
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
    await platform.files.remove(`audio/${reciter}/${pad3(surah)}`);
    if (registry[reciter]) delete registry[reciter][surah];
  }
  await platform.kv.set(REGISTRY_KEY, JSON.stringify(registry));
}
