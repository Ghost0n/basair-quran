"use client";

import { useEffect, useRef } from "react";

import { APP_MODE } from "@/lib/app-mode/config";

import { coverArtwork } from "./media-cover";
import { useNowPlaying } from "./phone-player";
import { useRecitation } from "./recitation-context";

import { t } from "@/lib/i18n";

type Action = "play" | "pause" | "previoustrack" | "nexttrack" | "seekto" | "stop";
type Metadata = { title: string; artist: string; album: string; artwork: { src: string; sizes: string; type: string }[] };

/**
 * Where the system's media controls live: the lock screen, Control Center
 * and the Dynamic Island on iPhone, the notification shade on Android, the
 * browser's media hub on desktops.
 *
 * - iPhone and the web: WebKit / the browser implement the Media Session API
 *   themselves (the playing <audio> is the session).
 * - Android: its WebView has no media notification, so the native plugin
 *   (@capgo/capacitor-media-session, a media-playback service) does it.
 */
interface Session {
  setMetadata(metadata: Metadata | null): void;
  setPlaybackState(state: "none" | "paused" | "playing"): void;
  setPosition(position: { duration: number; position: number; playbackRate: number } | null): void;
  setActionHandler(action: Action, handler: ((details: { seekTime?: number }) => void) | null): void;
}

function webSession(): Session | null {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return null;
  const media = navigator.mediaSession;
  return {
    setMetadata: (metadata) => {
      media.metadata = metadata ? new MediaMetadata(metadata) : null;
    },
    setPlaybackState: (state) => {
      media.playbackState = state;
    },
    setPosition: (position) => {
      try {
        media.setPositionState?.(position ?? undefined);
      } catch {
        /* an inconsistent position (duration not known yet): skip it */
      }
    },
    setActionHandler: (action, handler) => {
      try {
        media.setActionHandler(action, handler ? (details) => handler({ seekTime: details.seekTime ?? undefined }) : null);
      } catch {
        /* an action this browser doesn't know */
      }
    },
  };
}

async function androidSession(): Promise<Session | null> {
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.getPlatform() !== "android") return null;
  const { MediaSession } = await import("@capgo/capacitor-media-session");
  const quiet = (promise: Promise<unknown>) => void promise.catch(() => undefined);
  return {
    setMetadata: (metadata) => metadata && quiet(MediaSession.setMetadata(metadata)),
    setPlaybackState: (state) => quiet(MediaSession.setPlaybackState({ playbackState: state })),
    setPosition: (position) => position && quiet(MediaSession.setPositionState(position)),
    setActionHandler: (action, handler) =>
      quiet(MediaSession.setActionHandler({ action }, handler ? (details) => handler({ seekTime: details.seekTime ?? undefined }) : null)),
  };
}

/** The cover: page URLs on the web and iPhone, inline data on Android (its plugin can't read app files). */
async function artwork(inline: boolean): Promise<Metadata["artwork"]> {
  const covers = coverArtwork(window.location.href);
  if (!inline) return covers;
  const cover = covers[0];
  try {
    const blob = await (await fetch(cover.src)).blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return [{ ...cover, src: data }];
  } catch {
    return [];
  }
}

/**
 * Keeps the system's now-playing card in step with the recitation: the
 * verse as the title, the reciter, «بصائر» and its mark, play / pause,
 * previous and next verse, and the surah's progress (dragging it on the lock
 * screen seeks within the surah). Renders nothing.
 */
export function RecitationMediaSession() {
  const recitation = useRecitation();
  const now = useNowPlaying();
  const sessionRef = useRef<Session | null>(null);
  const coverRef = useRef<Metadata["artwork"]>([]);
  const actionsRef = useRef(recitation);
  actionsRef.current = recitation;

  // Pick the session once (Android loads its plugin).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const android = APP_MODE ? await androidSession().catch(() => null) : null;
      const session = android ?? webSession();
      if (cancelled || !session) return;
      coverRef.current = await artwork(Boolean(android));
      if (cancelled) return;
      sessionRef.current = session;
      const act = (action: Action, run: (details: { seekTime?: number }) => void) => session.setActionHandler(action, run);
      act("play", () => {
        const current = actionsRef.current;
        if (current.current && !current.isPlaying) current.toggle();
        else if (!current.current) current.startPending();
      });
      act("pause", () => {
        const current = actionsRef.current;
        if (current.isPlaying) current.toggle();
      });
      act("previoustrack", () => actionsRef.current.prev());
      act("nexttrack", () => actionsRef.current.next());
      act("stop", () => actionsRef.current.stop());
      act("seekto", ({ seekTime }) => {
        const timing = actionsRef.current.surahTiming;
        if (seekTime == null || !timing || timing.total <= 0) return;
        actionsRef.current.seekSurah(seekTime / timing.total);
      });
    })();
    return () => {
      cancelled = true;
      const session = sessionRef.current;
      sessionRef.current = null;
      if (!session) return;
      for (const action of ["play", "pause", "previoustrack", "nexttrack", "seekto", "stop"] as const) session.setActionHandler(action, null);
    };
  }, []);

  // The card: what plays, by whom, and whether it plays.
  const active = Boolean(recitation.current);
  const title = active ? now.where : null;
  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    if (!title) {
      session.setPlaybackState("none");
      session.setMetadata(null);
      return;
    }
    session.setMetadata({ title, artist: now.who, album: t("بصائر"), artwork: coverRef.current });
  }, [title, now.who]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || !active) return;
    session.setPlaybackState(recitation.isPlaying ? "playing" : "paused");
  }, [active, recitation.isPlaying]);

  // The surah's progress, set when it jumps (another verse, play / pause, a
  // seek): between those the system advances it by itself.
  const timing = recitation.surahTiming;
  const verseKey = recitation.current ? `${recitation.current.surah}:${recitation.current.ayah}` : null;
  useEffect(() => {
    const session = sessionRef.current;
    if (!session || !timing || timing.total <= 0) return;
    session.setPosition({
      duration: timing.total,
      position: Math.min(timing.elapsed, timing.total),
      // Never 0 (the API refuses it); paused is the playback state's job.
      playbackRate: recitation.speed || 1,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verseKey, recitation.isPlaying, recitation.speed, timing?.total, timing?.exact]);

  return null;
}
