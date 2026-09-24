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

import { API_BASE_URL } from "@/lib/config";
import { DEFAULT_MUSHAF_ID } from "@/lib/mushaf-defaults";
import { usePreferences } from "@/lib/preferences-context";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

function pad3(value: number): string {
  return String(value).padStart(3, "0");
}

export type RecitationPosition = { surah: number; ayah: number };

type RecitationValue = {
  reciters: ReciterItem[];
  /** Mushaf catalogue (with riwāyah), for reciter/mushaf mismatch detection. */
  mushafs: MushafItem[];
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
  /** The bar shown in an IDLE state (no ayah playing yet) — opened from the
   *  reader footer so the user can pick a reciter before pressing play. */
  idle: boolean;
  /** Where the idle bar's play button starts from (the reader's current page). */
  pendingStart: RecitationPosition | null;
  openIdle: (start?: RecitationPosition | null) => void;
  /** Start the pending ayah (idle → playing). */
  startPending: () => void;
};

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
      audio.src = `${activeReciter.audio_base}/${pad3(position.surah)}${pad3(position.ayah)}.mp3`;
      audio.playbackRate = speed;
      void audio.play().then(
        () => setIsPlaying(true),
        () => setIsPlaying(false),
      );
    },
    [speed],
  );

  const playAyah = useCallback(
    (surah: number, ayah: number) => {
      setCurrent({ surah, ayah });
      setIdle(false); // a real ayah takes over from the idle bar
      loadAndPlay({ surah, ayah }, reciter);
    },
    [loadAndPlay, reciter],
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
  }, []);

  const next = useCallback(() => {
    if (!current) return;
    const surahMeta = surahs.find((s) => s.id === current.surah);
    const ayahCount = surahMeta?.ayah_count ?? current.ayah;
    if (current.ayah < ayahCount) {
      playAyah(current.surah, current.ayah + 1);
    } else if (current.surah < 114) {
      playAyah(current.surah + 1, 1);
    } else {
      stop();
    }
  }, [current, surahs, playAyah, stop]);

  const prev = useCallback(() => {
    if (!current) return;
    if (current.ayah > 1) {
      playAyah(current.surah, current.ayah - 1);
    } else if (current.surah > 1) {
      const prevSurah = surahs.find((s) => s.id === current.surah - 1);
      playAyah(current.surah - 1, prevSurah?.ayah_count ?? 1);
    }
  }, [current, surahs, playAyah]);

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

  const openIdle = useCallback((start?: RecitationPosition | null) => {
    setPendingStart(start ?? null);
    setIdle(true);
  }, []);

  const startPending = useCallback(() => {
    if (pendingStart) playAyah(pendingStart.surah, pendingStart.ayah);
  }, [pendingStart, playAyah]);

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
      reciterId,
      reciter,
      current,
      isPlaying,
      progress,
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
    }),
    [
      reciters,
      mushafs,
      reciterId,
      reciter,
      current,
      isPlaying,
      progress,
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
