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

export async function downloadSurahAudio(
  reciter: { id: string; audio_base: string },
  surah: number,
  ayahCount: number,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const { platform } = await appRuntime();
  let bytes = 0;
  for (let ayah = 1; ayah <= ayahCount; ayah += 1) {
    const url = `${reciter.audio_base}/${pad3(surah)}${pad3(ayah)}.mp3`;
    const path = audioPath(reciter.id, surah, ayah);
    if (platform.files.download) {
      bytes += await platform.files.download(url, path);
    } else {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`audio ${surah}:${ayah} (${response.status})`);
      const data = new Uint8Array(await response.arrayBuffer());
      await platform.files.write(path, data);
      bytes += data.length;
    }
    onProgress?.(ayah, ayahCount);
  }
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
