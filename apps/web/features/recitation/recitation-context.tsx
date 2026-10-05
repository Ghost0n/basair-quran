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

import { APP_MODE } from "@/lib/app-mode/config";
import { API_BASE_URL } from "@/lib/config";
import { DEFAULT_MUSHAF_ID } from "@/lib/mushaf-defaults";
import { usePreferences } from "@/lib/preferences-context";
import { divisionRange, inRange, nextVerse, previousVerse, sameVerse, type VerseRange } from "@/lib/quran-ranges";

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
export type RecitationRange = VerseRange & { repeat: boolean };

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
  clearRange: () => void;
  setRangeRepeat: (repeat: boolean) => void;
  /** What repeats: nothing, the verse, or the chosen range (the surah when none was chosen). */
  repeatMode: RepeatMode;
  setRepeatMode: (mode: RepeatMode) => void;
  /** A recitation session is open: from play until the player is closed (pausing keeps it open). */
  active: boolean;
};

export type RepeatMode = "off" | "verse" | "range";

const RecitationContext = createContext<RecitationValue | null>(null);

const SPEEDS = [0.75, 1, 1.25, 1.5];

/**
 * RecitationProvider — owns the single global <audio> element. Per-ayah
 * audio is streamed from each reciter's everyayah.com folder. Consumed by
 * the Recitation room and the Mushaf footer mini-player.
 */
export function RecitationProvider({ children }: { children: ReactNode }) {
  const { preferences } = usePreferences();
  const audioRef = useRef<HTMLAudioElement | null>(null);
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

  const reciter = useMemo(
    () => reciters.find((item) => item.id === reciterId) ?? reciters[0] ?? null,
    [reciters, reciterId],
  );

  useEffect(() => {
    let cancelled = false;
    // Audio files follow Ḥafṣ (Kūfī) ayah numbering, so auto-advance uses Ḥafṣ counts.
    Promise.all([api.getReciters(), api.getSurahs(DEFAULT_MUSHAF_ID), api.getMushafs()])
      .then(([reciterList, surahList, mushafList]) => {
        if (cancelled) return;
        setReciters(reciterList);
        setSurahs(surahList);
        setMushafs(mushafList);
        if (reciterList[0]) setReciterId((current) => (reciterList.some((r) => r.id === current) ? current : reciterList[0].id));
      })
      .catch(() => {
        /* recitation just stays unavailable if the catalogue fails */
      });
    return () => {
      cancelled = true;
    };
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

  const loadAndPlay = useCallback(
    (position: RecitationPosition, activeReciter: ReciterItem | null) => {
      const audio = audioRef.current;
      if (!audio || !activeReciter) return;
      setAyahTime(0);
      void audioSource(activeReciter, position).then((src) => {
        audio.src = src;
        audio.playbackRate = speed;
        void audio.play().then(
          () => setIsPlaying(true),
          () => setIsPlaying(false),
        );
      });
    },
    [speed],
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

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setIsPlaying(false);
    // Clear the active position AND the idle state so the media bar collapses
    // fully (it renders while `current` OR `idle`). Without this the bar was
    // stuck open on close.
    setCurrent(null);
    setProgress(0);
    setIdle(false);
    setPendingStart(null);
    setRange(null);
  }, []);

  // The end of a chosen range: pause and leave the bar ready at its start.
  const finishRange = useCallback((start: RecitationPosition) => {
    audioRef.current?.pause();
    setIsPlaying(false);
    setCurrent(null);
    setProgress(0);
    setPendingStart(start);
    setIdle(true);
  }, []);

  const next = useCallback(() => {
    if (!current) return;
    if (range && sameVerse(current, range.end)) {
      if (range.repeat) playPosition(range.start);
      else finishRange(range.start);
      return;
    }
    const following = nextVerse(current);
    if (following) playPosition(following);
    else stop();
  }, [current, range, playPosition, finishRange, stop]);

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
    if (audioRef.current) audioRef.current.playbackRate = value;
  }, []);

  const seek = useCallback((ratio: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration || Number.isNaN(audio.duration)) return;
    const clamped = Math.min(Math.max(ratio, 0), 1);
    audio.currentTime = audio.duration * clamped;
    setProgress(clamped);
  }, []);

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
    if (!reciter || currentSurah == null) return;
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
    const list = durationsRef.current.get(`${reciter.id}:${current.surah}`);
    if (!list || !list.length) return null;
    const { seconds, exact } = surahSeconds(list);
    const before = seconds.slice(0, current.ayah - 1).reduce((sum, value) => sum + value, 0);
    const total = seconds.reduce((sum, value) => sum + value, 0);
    const elapsed = total > 0 ? Math.min(before + ayahTime, total) : before + ayahTime;
    return { elapsed, total, exact, progress: total > 0 ? Math.min(1, elapsed / total) : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, reciter, durationsVersion, ayahTime]);

  const seekSurah = useCallback(
    (ratio: number) => {
      const audio = audioRef.current;
      if (!audio || !current || !reciter) return;
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

  // Audio element event wiring.
  const handleEnded = useCallback(() => {
    if (repeatAyah && current) {
      loadAndPlay(current, reciter);
    } else {
      next();
    }
  }, [repeatAyah, current, reciter, loadAndPlay, next]);

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
      clearRange,
      setRangeRepeat,
      repeatMode,
      setRepeatMode,
      active: Boolean(current) || idle,
    }),
    [
      surahs,
      range,
      playRange,
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
      <audio
        ref={audioRef}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;
          setProgress(audio.duration > 0 ? audio.currentTime / audio.duration : 0);
          setAyahTime(audio.currentTime);
        }}
        onLoadedMetadata={(event) => {
          const audio = event.currentTarget;
          // The playing verse's exact length joins the surah's durations.
          if (reciter && current && Number.isFinite(audio.duration)) {
            const list = durationsRef.current.get(`${reciter.id}:${current.surah}`);
            if (list && Number.isNaN(list[current.ayah - 1])) {
              list[current.ayah - 1] = audio.duration;
              setDurationsVersion((version) => version + 1);
            }
          }
          if (pendingSeekRef.current != null) {
            audio.currentTime = Math.min(pendingSeekRef.current, Math.max(0, audio.duration - 0.05));
            pendingSeekRef.current = null;
            setAyahTime(audio.currentTime);
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={handleEnded}
        hidden
      />
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
