/**
 * Downloading a reciter's whole recitation (114 surahs, 6,236 verses) for
 * offline listening, in the standalone app. The job lives here, not in the
 * settings screen, so it carries on while the reader goes elsewhere in the
 * app; stopping it keeps every surah already complete, and starting again
 * skips them.
 */
import { useSyncExternalStore } from "react";

import { downloadSurahAudio, downloadedAudio, type DownloadableReciter } from "./audio";

export type AudioJob = {
  reciterId: string;
  status: "running" | "stopped" | "failed" | "done";
  /** Verses on the device, of the whole recitation. */
  done: number;
  total: number;
  /** The surah being downloaded. */
  surah: number | null;
};

let job: AudioJob | null = null;
let controller: AbortController | null = null;
const listeners = new Set<() => void>();

function set(next: AudioJob | null) {
  job = next;
  for (const listener of listeners) listener();
}

export function currentAudioJob(): AudioJob | null {
  return job;
}

export function useAudioJob(): AudioJob | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => job,
    () => null,
  );
}

export async function startReciterDownload(
  reciter: DownloadableReciter,
  surahs: readonly { id: number; ayah_count: number }[],
  download: typeof downloadSurahAudio = downloadSurahAudio,
): Promise<void> {
  if (job?.status === "running") return;
  controller = new AbortController();
  const { signal } = controller;
  const saved = (await downloadedAudio())[reciter.id] ?? {};
  const total = surahs.reduce((sum, item) => sum + item.ayah_count, 0);
  let done = surahs.filter((item) => saved[item.id]).reduce((sum, item) => sum + item.ayah_count, 0);
  const pending = surahs.filter((item) => !saved[item.id]);
  set({ reciterId: reciter.id, status: "running", done, total, surah: pending[0]?.id ?? null });
  try {
    for (const item of pending) {
      if (signal.aborted) break;
      set({ ...(job as AudioJob), surah: item.id });
      await download(reciter, item.id, item.ayah_count, (verses) => set({ ...(job as AudioJob), done: done + verses }), signal);
      done += item.ayah_count;
    }
    set({ ...(job as AudioJob), done, surah: null, status: signal.aborted ? "stopped" : "done" });
  } catch (error) {
    const stopped = signal.aborted || (error instanceof DOMException && error.name === "AbortError");
    set({ ...(job as AudioJob), done, surah: null, status: stopped ? "stopped" : "failed" });
  } finally {
    controller = null;
  }
}

/** Stop after the files under way (complete surahs stay). */
export function stopReciterDownload(): void {
  controller?.abort();
}

export function resetAudioJobForTests(): void {
  controller?.abort();
  controller = null;
  job = null;
}
