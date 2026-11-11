import type { SurahRecitation } from "@q-basair/shared";

import { ayahCount } from "@/lib/quran-ranges";

/**
 * A surah's recording as ONE file with its verse timings, fetched straight
 * from the reciter's public source when our server hasn't prepared it
 * (docs/recitation-audio.md): the same sources, in the same order, that
 * scripts/build_recitations.py prepares from (scripts/recitation_sources.json,
 * kept equal by direct-source.test.ts). Reciting then sounds as recited, with
 * no pause between verses, before — and wherever — the server has nothing.
 *
 *  - `qdc`: Quran.com's chapter recording (download.quranicaudio.com) and its
 *    verse timings (api.qurancdn.com);
 *  - `mp3quran`: mp3quran.net's surah recording and its timed read's verse
 *    timings.
 *
 * Both answer any origin (CORS `*`). Only these hosts are fetched; a timing
 * list that doesn't hold every verse of the surah, in order, is not used.
 */
export type DirectSource = { qdc: number } | { mp3quran: number };

/** Each reciter's whole-surah sources (no everyayah: those are verse files). */
export const DIRECT_SOURCES: Readonly<Record<string, readonly DirectSource[]>> = {
  alafasy: [{ qdc: 7 }, { mp3quran: 123 }],
  husary: [{ qdc: 6 }],
  abdulbasit: [{ qdc: 2 }, { mp3quran: 53 }],
  minshawi: [{ qdc: 9 }, { mp3quran: 112 }],
  sudais: [{ qdc: 3 }, { mp3quran: 54 }],
  shuraim: [{ qdc: 10 }, { mp3quran: 31 }],
  ghamdi: [{ mp3quran: 30 }],
  ajmy: [{ mp3quran: 5 }],
  "abdulbasit-mujawwad": [{ qdc: 1 }, { mp3quran: 51 }],
  "husary-muallim": [{ qdc: 12 }],
  "yasser-dosari": [{ qdc: 97 }, { mp3quran: 92 }],
  "abubakr-shatri": [{ qdc: 4 }, { mp3quran: 4 }],
  "hani-rifai": [{ qdc: 5 }, { mp3quran: 89 }],
  "khalifa-tunaiji": [{ qdc: 161 }],
};

const QDC_API = "https://api.qurancdn.com/api/qdc/audio/reciters";
const MP3QURAN_API = "https://www.mp3quran.net/api/v3";
const ALLOWED_HOSTS = ["download.quranicaudio.com", "mp3quran.net"];

export function hasDirectSource(reciterId: string | null | undefined): boolean {
  return Boolean(reciterId && DIRECT_SOURCES[reciterId]?.length);
}

type Verse = SurahRecitation["verses"][number];
type Fetch = typeof fetch;

function allowedAudio(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && ALLOWED_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

/** Every verse of the surah, once, in order, each starting before it ends. */
export function completeVerses(verses: Verse[], surah: number): boolean {
  const count = ayahCount(surah);
  if (verses.length !== count) return false;
  let previous = -1;
  return verses.every((verse, index) => {
    const ok = verse.ayah === index + 1 && verse.start_ms >= 0 && verse.end_ms > verse.start_ms && verse.start_ms >= previous;
    previous = verse.start_ms;
    return ok;
  });
}

async function getJson(fetchImpl: Fetch, url: string): Promise<unknown> {
  const response = await fetchImpl(url, { credentials: "omit" });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
}

/** Quran.com: the chapter file and its verse timings. */
export async function fromQdc(id: number, surah: number, fetchImpl: Fetch = fetch): Promise<Omit<SurahRecitation, "reciter_id"> | null> {
  const payload = (await getJson(fetchImpl, `${QDC_API}/${id}/audio_files?chapter=${surah}&segments=true`)) as {
    audio_files?: { audio_url?: string; duration?: number; file_size?: number; verse_timings?: { verse_key?: string; timestamp_from?: number; timestamp_to?: number }[] }[];
  };
  const file = payload.audio_files?.[0];
  if (!file?.audio_url || !allowedAudio(file.audio_url)) return null;
  const verses: Verse[] = [];
  for (const timing of file.verse_timings ?? []) {
    const [chapter, ayah] = String(timing.verse_key ?? "").split(":").map(Number);
    if (chapter !== surah || !ayah) continue;
    verses.push({ ayah, start_ms: Number(timing.timestamp_from), end_ms: Number(timing.timestamp_to) });
  }
  verses.sort((a, b) => a.ayah - b.ayah);
  if (!completeVerses(verses, surah)) return null;
  return {
    surah,
    audio_url: file.audio_url,
    duration_ms: Math.max(Number(file.duration) || 0, verses[verses.length - 1].end_ms),
    bytes: Number(file.file_size) || 0,
    attribution: "Quran.com (quranicaudio.com)",
    verses,
  };
}

// mp3quran's timed reads (their folders), fetched once.
let mp3quranReads: Promise<Map<number, string>> | null = null;

function readFolders(fetchImpl: Fetch): Promise<Map<number, string>> {
  if (!mp3quranReads) {
    mp3quranReads = (getJson(fetchImpl, `${MP3QURAN_API}/ayat_timing/reads`) as Promise<{ id?: number; folder_url?: string }[]>)
      .then((reads) => new Map(reads.filter((read) => read.id && read.folder_url).map((read) => [Number(read.id), String(read.folder_url)])))
      .catch((error) => {
        mp3quranReads = null; // asked again next time
        throw error;
      });
  }
  return mp3quranReads;
}

/** mp3quran.net: the surah file of a timed read and its verse timings. */
export async function fromMp3quran(read: number, surah: number, fetchImpl: Fetch = fetch): Promise<Omit<SurahRecitation, "reciter_id"> | null> {
  const folder = (await readFolders(fetchImpl)).get(read);
  if (!folder) return null;
  const url = `${folder.replace(/\/$/, "")}/${String(surah).padStart(3, "0")}.mp3`;
  if (!allowedAudio(url)) return null;
  const rows = (await getJson(fetchImpl, `${MP3QURAN_API}/ayat_timing?surah=${surah}&read=${read}`)) as { ayah?: number; start_time?: number; end_time?: number }[];
  if (!Array.isArray(rows)) return null;
  const verses = rows
    .filter((row) => Number(row.ayah) >= 1)
    .map((row) => ({ ayah: Number(row.ayah), start_ms: Number(row.start_time), end_ms: Number(row.end_time) }))
    .sort((a, b) => a.ayah - b.ayah);
  if (!completeVerses(verses, surah)) return null;
  return { surah, audio_url: url, duration_ms: verses[verses.length - 1].end_ms, bytes: 0, attribution: "mp3quran.net", verses };
}

/** The surah from the reciter's first source that has it, or null (then verse by verse). */
export async function directRecitation(reciterId: string, surah: number, fetchImpl: Fetch = fetch): Promise<SurahRecitation | null> {
  for (const source of DIRECT_SOURCES[reciterId] ?? []) {
    try {
      const found = "qdc" in source ? await fromQdc(source.qdc, surah, fetchImpl) : await fromMp3quran(source.mp3quran, surah, fetchImpl);
      if (found) return { reciter_id: reciterId, ...found };
    } catch {
      /* this source is unreachable or has no such surah: the next one */
    }
  }
  return null;
}

export function resetDirectSourcesForTests(): void {
  mp3quranReads = null;
}
