"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { MushafItem, ReciterItem, SurahListItem } from "@q-basair/shared";

import { APP_MODE, REMOTE_ORIGIN } from "@/lib/app-mode/config";
import { API_BASE_URL } from "@/lib/config";
import { DEFAULT_MUSHAF_ID } from "@/lib/mushaf-defaults";
import { usePreferences } from "@/lib/preferences-context";
import { loadUntilReady } from "@/lib/retry";
import { divisionRange, inRange, nextVerse, previousVerse, sameVerse, type VerseRange } from "@/lib/quran-ranges";

import { boundaryAction, startOf, toTrack, untilVerseEnd, verseAt, type Track } from "./track";
import { SILENCE_URL, upcomingVerse } from "./upcoming";
import { knownDurations, mergeDurations, rememberDurations } from "./verse-durations";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

function pad3(value: number): string {
  return String(value).padStart(3, "0");
}

export type RecitationPosition = { surah: number; ayah: number };

/** Where the recitation is within its surah, in seconds. */
export type SurahTiming = {
  elapsed: number;
  total: number;
  /** false while some verse durations are still estimated. */
  exact: boolean;
  /** 0..1 over the whole surah. */
  progress: number;
};

/** The audio file of one verse (the standalone app prefers a downloaded one). */
async function audioSource(reciter: ReciterItem, position: RecitationPosition): Promise<string> {
  const remote = `${reciter.audio_base}/${pad3(position.surah)}${pad3(position.ayah)}.mp3`;
  if (!APP_MODE) return remote;
  try {
    const { localAudioUrl } = await import("@/lib/app-mode/audio");
    return (await localAudioUrl(reciter.id, position.surah, position.ayah)) ?? remote;
  } catch {
    return remote;
  }
}

/** The reciter's surah is prepared as one recording (docs/recitation-audio.md). */
function hasPrepared(reciter: ReciterItem | null, surah: number): boolean {
  return Boolean(reciter?.surahs?.includes(surah));
}

/** A prepared recording's address: the app streams it from the server (or plays its download). */
function recordingUrl(audioUrl: string): string {
  if (/^https?:/.test(audioUrl) || !APP_MODE) return audioUrl;
  return `${REMOTE_ORIGIN}${audioUrl}`;
}

// Prepared surahs' timings, once fetched (a failure is asked again later).
const tracks = new Map<string, Track>();
const trackLoads = new Map<string, Promise<Track | null>>();

/** A prepared surah's recording and timings (a downloaded one first, in the app). */
function loadTrack(reciter: ReciterItem, surah: number): Promise<Track | null> {
  const key = `${reciter.id}:${surah}`;
  const known = tracks.get(key);
  if (known) return Promise.resolve(known);
  const loading = trackLoads.get(key);
  if (loading) return loading;
  const load = (async () => {
    if (APP_MODE) {
      try {
        const { localRecording } = await import("@/lib/app-mode/audio");
        const local = await localRecording(reciter.id, surah);
        if (local) return toTrack(local.recitation, local.url);
      } catch {
        /* not downloaded: stream it */
      }
    }
    const recitation = await api.getSurahRecitation(reciter.id, surah);
    return toTrack(recitation, recordingUrl(recitation.audio_url));
  })().then(
    (track) => {
      tracks.set(key, track);
      trackLoads.delete(key);
      return track;
    },
    () => {
      trackLoads.delete(key);
      return null;
    },
  );
  trackLoads.set(key, load);
  return load;
}

/** A verse's duration from its file's metadata only (NaN when it can't be read). */
function probeDuration(src: string): Promise<number> {
  return new Promise((resolve) => {
    const probe = new Audio();
    let settled = false;
    const done = (value: number) => {
      if (settled) return;
      settled = true;
      probe.removeAttribute("src");
      probe.load();
      resolve(value);
    };
    probe.preload = "metadata";
    probe.onloadedmetadata = () => done(Number.isFinite(probe.duration) ? probe.duration : Number.NaN);
    probe.onerror = () => done(Number.NaN);
    setTimeout(() => done(Number.NaN), 15000);
    probe.src = src;
  });
}

/** Seconds of each verse, with unknown ones estimated from the known average. */
function surahSeconds(list: number[]): { seconds: number[]; exact: boolean } {
  const known = list.filter((value) => !Number.isNaN(value));
  const average = known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : 0;
  return {
    seconds: list.map((value) => (Number.isNaN(value) ? average : value)),
    exact: known.length === list.length,
  };
}

/** A span to recite (inclusive); `repeat` loops it instead of stopping at its end. */
/** `once`: one verse heard on its own (a search result's ▶) — the session ends with it. */
export type RecitationRange = VerseRange & { repeat: boolean; once?: boolean };

type RecitationValue = {
  reciters: ReciterItem[];
  /** Mushaf catalogue (with riwāyah), for reciter/mushaf mismatch detection. */
  mushafs: MushafItem[];
  /** The surah catalogue (names for the range picker). */
  surahs: SurahListItem[];
  reciterId: string;
  reciter: ReciterItem | null;
  current: RecitationPosition | null;
  isPlaying: boolean;
  progress: number;
  speed: number;
  repeatAyah: boolean;
  setReciter: (id: string) => void;
  setSpeed: (speed: number) => void;
  toggleRepeat: () => void;
  playAyah: (surah: number, ayah: number) => void;
  toggle: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  /** Jump within the current ayah's audio (0..1 of its duration). */
  seek: (ratio: number) => void;
  /** The recitation's place in the whole surah (null when nothing plays). */
  surahTiming: SurahTiming | null;
  /** Jump anywhere in the surah (0..1 of its length): the right verse, at the right moment. */
  seekSurah: (ratio: number) => void;
  /** Move by `seconds` within the surah (keyboard seek). */
  seekBy: (seconds: number) => void;
  /** The bar shown in an IDLE state (no ayah playing yet) — opened from the
   *  reader footer so the user can pick a reciter before pressing play. */
  idle: boolean;
  /** Where the idle bar's play button starts from (the reader's current page). */
  pendingStart: RecitationPosition | null;
  openIdle: (start?: RecitationPosition | null) => void;
  /** Start the pending ayah (idle → playing). */
  startPending: () => void;
  /** The span being recited, if one was chosen (surah, juz, hizb, page, custom). */
  range: RecitationRange | null;
  /** Recite `range` from its first verse. */
  playRange: (range: VerseRange, options?: { repeat?: boolean }) => void;
  /** Recite one verse and stop (the session closes at its end). */
  playVerseOnce: (surah: number, ayah: number) => void;
  clearRange: () => void;
  setRangeRepeat: (repeat: boolean) => void;
  /** What repeats: nothing, the verse, or the chosen range (the surah when none was chosen). */
  repeatMode: RepeatMode;
  setRepeatMode: (mode: RepeatMode) => void;
  /**
   * A recitation session is open: from play until the player is closed
   * (pausing keeps it open). A verse heard on its own (`playVerseOnce`, a
   * search result's ▶) is not a session: no player, no bar, the reader
   * doesn't follow it.
   */
  active: boolean;
};

export type RepeatMode = "off" | "verse" | "range";

const RecitationContext = createContext<RecitationValue | null>(null);

const SPEEDS = [0.75, 1, 1.25, 1.5];

/** Which reciter's verse an <audio> holds ("reciter:surah:ayah"). */
const verseKey = (reciter: ReciterItem, position: RecitationPosition) => `${reciter.id}:${position.surah}:${position.ayah}`;

/**
 * RecitationProvider — owns the recitation's audio. Per-ayah audio is
 * streamed from each reciter's everyayah.com folder (or a downloaded copy in
 * the standalone app). Two <audio> elements take turns: while one recites a
 * verse, the other already loads the verse that comes next (upcomingVerse),
 * so when the verse ends the next one starts at once instead of waiting for
 * its file to arrive. In the background (iOS only lets the playing element go
 * on) the same element loads the next verse, and only the recitation's
 * element is ever allowed to sound. Consumed by the reader's dock, the phone
 * player and the media bar.
 */
export function RecitationProvider({ children }: { children: ReactNode }) {
  const { preferences } = usePreferences();
  // The element reciting now; the other one (standby) loads the next verse.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const elementsRef = useRef<(HTMLAudioElement | null)[]>([null, null]);
  // What the standby element holds, once its file is set (verseKey).
  const preloadedRef = useRef<string | null>(null);
  // iOS lets an <audio> start without a tap once it has played under one.
  const standbyPrimedRef = useRef(false);
  // The latest load: a slower source lookup can't overwrite a newer verse.
  const loadTokenRef = useRef(0);
  // Counts switches to the standby element: a repeated verse (same position)
  // still needs the next one loaded ahead.
  const [swaps, setSwaps] = useState(0);
  const [reciters, setReciters] = useState<ReciterItem[]>([]);
  const [mushafs, setMushafs] = useState<MushafItem[]>([]);
  const [surahs, setSurahs] = useState<SurahListItem[]>([]);
  const [reciterId, setReciterId] = useState<string>(() => preferences.reciter || "alafasy");
  // Once the user picks a reciter this session, stop auto-seeding from the pref.
  const userPickedReciterRef = useRef(false);
  const [current, setCurrent] = useState<RecitationPosition | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeedState] = useState(1);
  const [repeatAyah, setRepeatAyah] = useState(false);
  const [idle, setIdle] = useState(false);
  const [pendingStart, setPendingStart] = useState<RecitationPosition | null>(null);
  const [range, setRange] = useState<RecitationRange | null>(null);
  // Verse durations per reciter + surah ("id:surah" -> seconds by verse, NaN =
  // not known yet), filled in the background; the version re-derives timing.
  const durationsRef = useRef<Map<string, number[]>>(new Map());
  const [durationsVersion, setDurationsVersion] = useState(0);
  const [ayahTime, setAyahTime] = useState(0);
  // A surah seek that lands in another verse applies once that verse loads.
  const pendingSeekRef = useRef<number | null>(null);
  // A prepared surah being recited from its one recording (null: verse by verse).
  const trackRef = useRef<Track | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  // Where the recording is (seconds), for the surah's progress.
  const [trackTime, setTrackTime] = useState(0);
  // A precise stop / loop at the end of the verse (time updates are coarse).
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest state, for the audio element's events.
  const currentRef = useRef<RecitationPosition | null>(null);
  currentRef.current = current;

  const reciter = useMemo(
    () => reciters.find((item) => item.id === reciterId) ?? reciters[0] ?? null,
    [reciters, reciterId],
  );

  // The catalogues, each loaded on its own until it arrives (lib/retry.ts): one
  // failing at a cold start no longer leaves the player without reciters.
  // Audio files follow Ḥafṣ (Kūfī) ayah numbering, so auto-advance uses Ḥafṣ counts.
  useEffect(() => {
    const stops = [
      loadUntilReady(() => api.getReciters(), (reciterList) => {
        setReciters(reciterList);
        if (reciterList[0]) setReciterId((current) => (reciterList.some((r) => r.id === current) ? current : reciterList[0].id));
      }),
      loadUntilReady(() => api.getSurahs(DEFAULT_MUSHAF_ID), setSurahs),
      loadUntilReady(() => api.getMushafs(), setMushafs),
    ];
    return () => stops.forEach((stop) => stop());
  }, []);

  // Honor the saved reciter preference: apply it once the catalogue has loaded
  // and the pref names a known reciter, until the user overrides it this session.
  useEffect(() => {
    if (userPickedReciterRef.current) return;
    const preferred = preferences.reciter;
    if (preferred && preferred !== reciterId && reciters.some((item) => item.id === preferred)) {
      setReciterId(preferred);
    }
  }, [preferences.reciter, reciters, reciterId]);

  const standby = useCallback((): HTMLAudioElement | null => {
    const [first, second] = elementsRef.current;
    return audioRef.current === first ? second : first;
  }, []);

  // Recite from a prepared surah's recording, from `position`'s verse.
  const startTrack = useCallback(
    (audio: HTMLAudioElement, next: Track, position: RecitationPosition) => {
      trackRef.current = next;
      setTrack(next);
      const at = startOf(next, position.ayah);
      delete audio.dataset.verse;
      delete audio.dataset.silence;
      audio.defaultPlaybackRate = speed;
      if (audio.dataset.track !== next.key) {
        audio.dataset.track = next.key;
        pendingSeekRef.current = at > 0 ? at : null;
        audio.src = next.url;
      } else {
        audio.currentTime = at;
      }
      audio.playbackRate = speed;
      setTrackTime(at);
      setProgress(0);
      void audio.play().then(
        () => setIsPlaying(true),
        () => setIsPlaying(false),
      );
    },
    [speed],
  );

  const loadAndPlay = useCallback(
    (position: RecitationPosition, activeReciter: ReciterItem | null) => {
      const audio = audioRef.current;
      if (!audio || !activeReciter) return;
      setAyahTime(0);
      const token = ++loadTokenRef.current;
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
      if (hasPrepared(activeReciter, position.surah)) {
        // The surah as one recording: the verses follow each other as recited.
        preloadedRef.current = null;
        const key = `${activeReciter.id}:${position.surah}`;
        const begin = (next: Track | null) => {
          if (token !== loadTokenRef.current) return;
          if (next) startTrack(audio, next, position);
          else if (activeReciter.audio_base) playVerseFile();
          else setIsPlaying(false);
        };
        const known = tracks.get(key);
        if (known) {
          begin(known);
          return;
        }
        // Keep the tap's permission to play while the timings arrive.
        if (audio.paused) {
          delete audio.dataset.track;
          audio.dataset.silence = "1";
          audio.src = SILENCE_URL;
          void audio.play().catch(() => undefined);
        }
        void loadTrack(activeReciter, position.surah).then(begin);
        return;
      }
      playVerseFile();

      function playVerseFile() {
      if (!audio || !activeReciter) return;
      trackRef.current = null;
      setTrack(null);
      delete audio.dataset.track;
      delete audio.dataset.silence;
      const spare = standby();
      // In the background (screen locked, another app) iOS only lets the
      // element already playing go on: starting the standby one is refused,
      // and held until the app is back in front — where it then plays over
      // the verse the user resumed. So there the same element loads the next
      // verse; the standby only takes over while the app is in front.
      const background = typeof document !== "undefined" && document.visibilityState === "hidden";
      // The verse is already loaded in the standby element: switch to it now.
      if (!background && spare && preloadedRef.current === verseKey(activeReciter, position)) {
        preloadedRef.current = null;
        audioRef.current = spare;
        audio.pause();
        spare.playbackRate = speed;
        if (pendingSeekRef.current != null && spare.readyState >= 1) {
          spare.currentTime = Math.min(pendingSeekRef.current, Math.max(0, spare.duration - 0.05));
          pendingSeekRef.current = null;
        } else if (spare.currentTime > 0) {
          spare.currentTime = 0;
        }
        setProgress(0);
        setSwaps((count) => count + 1);
        void spare.play().then(
          () => setIsPlaying(true),
          () => setIsPlaying(false),
        );
        return;
      }
      // Played from a tap: let the standby element play once too (silently),
      // so iOS later lets it start the next verse by itself.
      if (!background && spare && !standbyPrimedRef.current) {
        standbyPrimedRef.current = true;
        preloadedRef.current = null;
        delete spare.dataset.verse;
        spare.muted = true;
        spare.src = SILENCE_URL;
        void spare.play().then(
          () => {
            spare.pause();
            spare.muted = false;
          },
          () => {
            spare.muted = false;
            standbyPrimedRef.current = false;
          },
        );
      }
      void audioSource(activeReciter, position).then((src) => {
        if (token !== loadTokenRef.current) return;
        audio.dataset.verse = verseKey(activeReciter, position);
        audio.src = src;
        audio.playbackRate = speed;
        void audio.play().then(
          () => setIsPlaying(true),
          () => setIsPlaying(false),
        );
      });
      }
    },
    [speed, standby, startTrack],
  );

  // Plays one verse, keeping any chosen range (advance, prev/next, repeat).
  const playPosition = useCallback(
    (position: RecitationPosition) => {
      setCurrent(position);
      setIdle(false); // a real ayah takes over from the idle bar
      loadAndPlay(position, reciter);
    },
    [loadAndPlay, reciter],
  );

  // Public: playing a verse outside the chosen range leaves that range.
  const playAyah = useCallback(
    (surah: number, ayah: number) => {
      const position = { surah, ayah };
      setRange((current) => (current && !inRange(position, current) ? null : current));
      playPosition(position);
    },
    [playPosition],
  );

  const playRange = useCallback(
    (next: VerseRange, options?: { repeat?: boolean }) => {
      setRange({ start: next.start, end: next.end, repeat: options?.repeat ?? false });
      playPosition(next.start);
    },
    [playPosition],
  );

  const playVerseOnce = useCallback(
    (surah: number, ayah: number) => {
      const position = { surah, ayah };
      setRange({ start: position, end: position, repeat: false, once: true });
      playPosition(position);
    },
    [playPosition],
  );

  const clearRange = useCallback(() => setRange(null), []);
  const setRangeRepeat = useCallback(
    (repeat: boolean) => setRange((current) => (current ? { ...current, repeat } : current)),
    [],
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      void audio.play().then(() => setIsPlaying(true), () => setIsPlaying(false));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [current]);

  // Forget the verse loaded ahead (the recitation stopped or went elsewhere).
  const dropPreload = useCallback(() => {
    preloadedRef.current = null;
    const spare = standby();
    if (spare && spare.dataset.verse) {
      spare.pause();
      delete spare.dataset.verse;
      spare.removeAttribute("src");
      spare.load();
    }
  }, [standby]);

  const stop = useCallback(() => {
    loadTokenRef.current += 1;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    dropPreload();
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    trackRef.current = null;
    setTrack(null);
    setTrackTime(0);
    setIsPlaying(false);
    // Clear the active position AND the idle state so the media bar collapses
    // fully (it renders while `current` OR `idle`). Without this the bar was
    // stuck open on close.
    setCurrent(null);
    setProgress(0);
    setIdle(false);
    setPendingStart(null);
    setRange(null);
  }, [dropPreload]);

  // The end of a chosen range: pause and leave the bar ready at its start.
  const finishRange = useCallback((start: RecitationPosition) => {
    audioRef.current?.pause();
    setIsPlaying(false);
    setCurrent(null);
    setProgress(0);
    setPendingStart(start);
    setIdle(true);
  }, []);

  // On from `from` (the verse being recited unless said): the next verse,
  // or the range's loop / end.
  const advance = useCallback((from?: RecitationPosition | null) => {
    const current = from ?? currentRef.current;
    if (!current) return;
    if (range && sameVerse(current, range.end)) {
      if (range.repeat) playPosition(range.start);
      else if (range.once) stop();
      else finishRange(range.start);
      return;
    }
    const following = nextVerse(current);
    if (following) playPosition(following);
    else stop();
  }, [range, playPosition, finishRange, stop]);
  const next = useCallback(() => advance(current), [advance, current]);

  const prev = useCallback(() => {
    if (!current) return;
    if (range && sameVerse(current, range.start)) return;
    const before = previousVerse(current);
    if (before) playPosition(before);
  }, [current, range, playPosition]);

  const setReciter = useCallback(
    (id: string) => {
      userPickedReciterRef.current = true;
      setReciterId(id);
      if (current) {
        const nextReciter = reciters.find((item) => item.id === id) ?? null;
        loadAndPlay(current, nextReciter);
      }
    },
    [current, reciters, loadAndPlay],
  );

  const setSpeed = useCallback((value: number) => {
    setSpeedState(value);
    if (audioRef.current) {
      audioRef.current.defaultPlaybackRate = value;
      audioRef.current.playbackRate = value;
    }
  }, []);

  const seek = useCallback((ratio: number) => {
    const audio = audioRef.current;
    const clamped = Math.min(Math.max(ratio, 0), 1);
    const playingTrack = trackRef.current;
    const verse = playingTrack && current ? playingTrack.verses[current.ayah - 1] : undefined;
    if (audio && verse) {
      audio.currentTime = verse.start + (verse.end - verse.start) * clamped;
      setProgress(clamped);
      return;
    }
    if (!audio || !audio.duration || Number.isNaN(audio.duration)) return;
    audio.currentTime = audio.duration * clamped;
    setProgress(clamped);
  }, [current]);

  const toggleRepeat = useCallback(() => setRepeatAyah((value) => !value), []);

  const repeatMode: RepeatMode = repeatAyah ? "verse" : range?.repeat ? "range" : "off";
  // Repeating "the range" without one chosen repeats the surah being recited,
  // from where it is now (nothing restarts).
  const setRepeatMode = useCallback(
    (mode: RepeatMode) => {
      setRepeatAyah(mode === "verse");
      if (mode === "range") {
        setRange((currentRange) => {
          if (currentRange) return { ...currentRange, repeat: true };
          const surah = (current ?? pendingStart)?.surah;
          return surah ? { ...divisionRange("surah", surah), repeat: true } : null;
        });
      } else {
        setRange((currentRange) => (currentRange?.repeat ? { ...currentRange, repeat: false } : currentRange));
      }
    },
    [current, pendingStart],
  );

  const openIdle = useCallback((start?: RecitationPosition | null) => {
    setPendingStart(start ?? null);
    setIdle(true);
  }, []);

  const startPending = useCallback(() => {
    if (pendingStart) playAyah(pendingStart.surah, pendingStart.ayah);
  }, [pendingStart, playAyah]);

  // Every verse duration of the surah being recited. The server is the source:
  // it measures each reciter's surah once and serves it to every user
  // (GET /api/reciters/{id}/durations/{surah}, immutable once complete, so the
  // browser caches it too). While it is still measuring, the answer is partial
  // and we ask again shortly. Only when the server can't be reached (offline,
  // the standalone app) does the player read the missing durations itself.
  // The list starts from what is already known (warmed during the app's
  // splash, or kept on the device from an earlier recitation).
  const reciterKey = reciter?.id ?? null;
  const currentSurah = current?.surah ?? null;
  useEffect(() => {
    // A prepared surah knows its timings: nothing to measure.
    if (!reciter || currentSurah == null || hasPrepared(reciter, currentSurah)) return;
    const key = `${reciter.id}:${currentSurah}`;
    let list = durationsRef.current.get(key);
    if (!list) {
      list = knownDurations(reciter.id, currentSurah);
      durationsRef.current.set(key, list);
      setDurationsVersion((version) => version + 1);
    }
    const target = list;
    let cancelled = false;
    let poll: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const fill = (values: (number | null)[]) => {
      mergeDurations(reciter.id, currentSurah, values);
      let changed = false;
      values.forEach((value, index) => {
        if (typeof value === "number" && value > 0 && Number.isNaN(target[index])) {
          target[index] = value;
          changed = true;
        }
      });
      if (changed && !cancelled) setDurationsVersion((version) => version + 1);
    };

    // Fallback: read the missing durations from the audio files (metadata
    // only, four at a time).
    const probeMissing = () => {
      const queue = target.flatMap((value, index) => (Number.isNaN(value) ? [index] : []));
      let active = 0;
      let flush: ReturnType<typeof setTimeout> | null = null;
      const bump = () => {
        if (flush) return;
        flush = setTimeout(() => {
          flush = null;
          if (!cancelled) setDurationsVersion((version) => version + 1);
        }, 300);
      };
      const pump = () => {
        while (!cancelled && active < 4 && queue.length) {
          const index = queue.shift() as number;
          active += 1;
          void audioSource(reciter, { surah: currentSurah, ayah: index + 1 })
            .then(probeDuration)
            .then((seconds) => {
              active -= 1;
              if (!Number.isNaN(seconds) && Number.isNaN(target[index])) {
                target[index] = seconds;
                bump();
              }
              pump();
            });
        }
      };
      pump();
    };

    const ask = () => {
      if (cancelled || !target.some((value) => Number.isNaN(value))) return;
      attempts += 1;
      api.getReciterDurations(reciter.id, currentSurah).then(
        (answer) => {
          if (cancelled) return;
          fill(answer.durations);
          // Still measuring on the server: ask again in a moment (bounded).
          if (!answer.complete && attempts < 24) poll = setTimeout(ask, 2500);
        },
        () => {
          if (!cancelled) probeMissing();
        },
      );
    };
    ask();

    return () => {
      cancelled = true;
      if (poll) clearTimeout(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reciterKey, currentSurah]);

  // A surah whose every verse is now known stays on the device for next time.
  useEffect(() => {
    if (!reciter || currentSurah == null) return;
    const list = durationsRef.current.get(`${reciter.id}:${currentSurah}`);
    if (list) rememberDurations(reciter.id, currentSurah, list);
  }, [reciter, currentSurah, durationsVersion]);

  const surahTiming = useMemo<SurahTiming | null>(() => {
    if (!current || !reciter) return null;
    if (track && track.surah === current.surah && track.duration > 0) {
      const elapsed = Math.min(trackTime, track.duration);
      return { elapsed, total: track.duration, exact: true, progress: elapsed / track.duration };
    }
    const list = durationsRef.current.get(`${reciter.id}:${current.surah}`);
    if (!list || !list.length) return null;
    const { seconds, exact } = surahSeconds(list);
    const before = seconds.slice(0, current.ayah - 1).reduce((sum, value) => sum + value, 0);
    const total = seconds.reduce((sum, value) => sum + value, 0);
    const elapsed = total > 0 ? Math.min(before + ayahTime, total) : before + ayahTime;
    return { elapsed, total, exact, progress: total > 0 ? Math.min(1, elapsed / total) : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, reciter, durationsVersion, ayahTime, track, trackTime]);

  const seekSurah = useCallback(
    (ratio: number) => {
      const audio = audioRef.current;
      if (!audio || !current || !reciter) return;
      const playingTrack = trackRef.current;
      if (playingTrack && playingTrack.surah === current.surah) {
        // The surah is one recording: go there, and follow the verse it lands in.
        const time = Math.min(Math.max(ratio, 0), 1) * playingTrack.duration;
        audio.currentTime = time;
        setTrackTime(time);
        const ayah = verseAt(playingTrack, time);
        if (ayah !== current.ayah) setCurrent({ surah: current.surah, ayah });
        return;
      }
      const list = durationsRef.current.get(`${reciter.id}:${current.surah}`);
      if (!list || !list.length) return;
      const { seconds } = surahSeconds(list);
      const total = seconds.reduce((sum, value) => sum + value, 0);
      if (total <= 0) return;
      let remaining = Math.min(Math.max(ratio, 0), 1) * total;
      let ayah = seconds.length;
      for (let index = 0; index < seconds.length; index += 1) {
        if (remaining < seconds[index] || index === seconds.length - 1) {
          ayah = index + 1;
          break;
        }
        remaining -= seconds[index];
      }
      if (ayah === current.ayah) {
        audio.currentTime = Math.max(0, remaining);
        setAyahTime(audio.currentTime);
      } else {
        pendingSeekRef.current = Math.max(0, remaining);
        playAyah(current.surah, ayah);
      }
    },
    [current, reciter, playAyah],
  );

  const seekBy = useCallback(
    (delta: number) => {
      if (!surahTiming || surahTiming.total <= 0) return;
      seekSurah((surahTiming.elapsed + delta) / surahTiming.total);
    },
    [surahTiming, seekSurah],
  );

  // Load the verse that comes next into the standby element while this one
  // plays, so it can start the moment this one ends.
  useEffect(() => {
    if (!current || !reciter) return;
    const upcoming = upcomingVerse(current, { repeatAyah, range });
    if (!upcoming) return;
    // A prepared surah goes on in its own recording; the next one's timings
    // are fetched ahead instead.
    if (hasPrepared(reciter, upcoming.surah)) {
      if (upcoming.surah !== current.surah) void loadTrack(reciter, upcoming.surah);
      return;
    }
    if (!reciter.audio_base) return;
    const key = verseKey(reciter, upcoming);
    if (preloadedRef.current === key) return;
    let cancelled = false;
    void audioSource(reciter, upcoming).then((src) => {
      const spare = standby();
      if (cancelled || !spare) return;
      spare.preload = "auto";
      spare.dataset.verse = key;
      spare.src = src;
      spare.load();
      preloadedRef.current = key;
    });
    return () => {
      cancelled = true;
    };
  }, [current, reciter, repeatAyah, range, standby, swaps]);

  // Audio element event wiring.
  const handleEnded = useCallback(() => {
    const playingTrack = trackRef.current;
    // The end of a prepared surah's recording is the end of its last verse,
    // whatever the last (coarse) time update showed.
    const from = playingTrack && current ? { surah: playingTrack.surah, ayah: playingTrack.verses.length } : current;
    if (repeatAyah && from) {
      loadAndPlay(from, reciter);
    } else {
      advance(from);
    }
  }, [repeatAyah, current, reciter, loadAndPlay, advance]);

  // A prepared surah: follow the verses as the recording plays, and stop or
  // loop exactly at a verse's end (repeat, the end of a range).
  const followTrack = (audio: HTMLAudioElement) => {
    const playingTrack = trackRef.current;
    const position = currentRef.current;
    if (!playingTrack || !position || audio.dataset.track !== playingTrack.key) return;
    const time = audio.currentTime;
    setTrackTime(time);
    const verse = playingTrack.verses[position.ayah - 1];
    if (verse) {
      setAyahTime(Math.max(0, time - verse.start));
      setProgress(verse.end > verse.start ? Math.min(1, Math.max(0, (time - verse.start) / (verse.end - verse.start))) : 0);
    }
    const action = boundaryAction(playingTrack, position, time, { repeatAyah, range });
    if (action.kind === "follow") {
      const following = { surah: playingTrack.surah, ayah: action.ayah };
      currentRef.current = following;
      setCurrent(following);
    } else if (action.kind === "loop-verse") {
      audio.currentTime = startOf(playingTrack, position.ayah);
    } else if (action.kind === "range-end" && range) {
      if (range.repeat) playPosition(range.start);
      else if (range.once) stop();
      else finishRange(range.start);
      return;
    }
    // A stop or a loop due within the next update: time it exactly.
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    endTimerRef.current = null;
    const exactEnd = repeatAyah || (range != null && sameVerse(position, range.end));
    const left = exactEnd && !audio.paused ? untilVerseEnd(playingTrack, position, time) : null;
    if (left != null && left < 0.4) {
      endTimerRef.current = setTimeout(() => followTrack(audio), (left / (audio.playbackRate || 1)) * 1000);
    }
  };

  const value = useMemo<RecitationValue>(
    () => ({
      reciters,
      mushafs,
      surahs,
      reciterId,
      reciter,
      current,
      isPlaying,
      progress,
      surahTiming,
      seekSurah,
      seekBy,
      speed,
      repeatAyah,
      setReciter,
      setSpeed,
      toggleRepeat,
      playAyah,
      toggle,
      stop,
      next,
      prev,
      seek,
      idle,
      pendingStart,
      openIdle,
      startPending,
      range,
      playRange,
      playVerseOnce,
      clearRange,
      setRangeRepeat,
      repeatMode,
      setRepeatMode,
      active: (Boolean(current) && !range?.once) || idle,
    }),
    [
      surahs,
      range,
      playRange,
      playVerseOnce,
      clearRange,
      setRangeRepeat,
      repeatMode,
      setRepeatMode,
      reciters,
      mushafs,
      reciterId,
      reciter,
      current,
      isPlaying,
      progress,
      surahTiming,
      seekSurah,
      seekBy,
      speed,
      repeatAyah,
      setReciter,
      setSpeed,
      toggleRepeat,
      playAyah,
      toggle,
      stop,
      next,
      prev,
      seek,
      idle,
      pendingStart,
      openIdle,
      startPending,
    ],
  );

  return (
    <RecitationContext.Provider value={value}>
      {children}
      {[0, 1].map((slot) => (
        <audio
          key={slot}
          ref={(element) => {
            elementsRef.current[slot] = element;
            if (slot === 0 && !audioRef.current) audioRef.current = element;
          }}
          onTimeUpdate={(event) => {
            const audio = event.currentTarget;
            if (audio !== audioRef.current || audio.dataset.silence) return;
            if (audio.dataset.track) {
              followTrack(audio);
              return;
            }
            setProgress(audio.duration > 0 ? audio.currentTime / audio.duration : 0);
            setAyahTime(audio.currentTime);
          }}
          onLoadedMetadata={(event) => {
            const audio = event.currentTarget;
            // A verse's exact length joins its surah's durations (the one
            // reciting, or the one loaded ahead).
            const [reciterId, surah, ayah] = (audio.dataset.verse ?? "").split(":");
            if (reciterId && Number.isFinite(audio.duration)) {
              const list = durationsRef.current.get(`${reciterId}:${surah}`);
              const index = Number(ayah) - 1;
              if (list && Number.isNaN(list[index])) {
                list[index] = audio.duration;
                setDurationsVersion((version) => version + 1);
              }
            }
            if (audio !== audioRef.current) return;
            if (pendingSeekRef.current != null) {
              audio.currentTime = Number.isFinite(audio.duration)
                ? Math.min(pendingSeekRef.current, Math.max(0, audio.duration - 0.05))
                : pendingSeekRef.current;
              pendingSeekRef.current = null;
              setAyahTime(audio.currentTime);
            }
          }}
          onPlay={(event) => {
            const audio = event.currentTarget;
            if (audio === audioRef.current) {
              setIsPlaying(true);
              // Only one verse ever sounds: the other element is silenced.
              const other = elementsRef.current.find((element) => element && element !== audio);
              if (other && !other.paused) other.pause();
              return;
            }
            // A start that isn't the recitation's (iOS releasing one it held,
            // the silent priming aside): stop it at once.
            if (!audio.muted) audio.pause();
          }}
          onPause={(event) => {
            if (event.currentTarget !== audioRef.current) return;
            setIsPlaying(false);
            if (endTimerRef.current) clearTimeout(endTimerRef.current);
          }}
          onEnded={(event) => {
            const audio = event.currentTarget;
            // The moment of silence that kept a tap's permission isn't a verse.
            if (audio !== audioRef.current || audio.dataset.silence) return;
            handleEnded();
          }}
          hidden
        />
      ))}
    </RecitationContext.Provider>
  );
}

export function useRecitation(): RecitationValue {
  const ctx = useContext(RecitationContext);
  if (!ctx) {
    throw new Error("useRecitation must be used within <RecitationProvider>");
  }
  return ctx;
}

export const RECITATION_SPEEDS = SPEEDS;
