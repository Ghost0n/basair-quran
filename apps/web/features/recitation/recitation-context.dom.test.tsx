// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@q-basair/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@q-basair/api-client")>()),
  createQBasairApiClient: () => ({
    getReciters: async () => [
      { id: "alafasy", name: "مشاري", audio_base: "https://everyayah.com/data/Alafasy_128kbps", surahs: [112, 113] },
    ],
    getSurahRecitation: async (reciterId: string, surah: number) => {
      recitationRequests.push(`${reciterId}:${surah}`);
      const count = surah === 112 ? 4 : 5;
      return {
        reciter_id: reciterId,
        surah,
        audio_url: `/api/recitations/audio/${reciterId}/${surah}.mp3?v=1`,
        duration_ms: (count + 1) * 2000,
        bytes: 1,
        attribution: "",
        // A 2 s opening, then 2 s verses.
        verses: Array.from({ length: count }, (_, index) => ({ ayah: index + 1, start_ms: (index + 1) * 2000, end_ms: (index + 2) * 2000 })),
      };
    },
    getSurahs: async () => [],
    getMushafs: async () => [],
    getReciterDurations: async () => ({ durations: [], complete: true }),
  }),
}));

const recitationRequests: string[] = [];

import { playOrResume } from "./phone-player";
import { RecitationProvider, useRecitation } from "./recitation-context";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The media elements: play / pause flip `paused` and fire their events;
// `plays` records which element (by its src) started, in order.
const paused = new WeakMap<HTMLMediaElement, boolean>();
let plays: string[] = [];
beforeEach(() => {
  plays = [];
  Object.defineProperty(HTMLMediaElement.prototype, "paused", {
    configurable: true,
    get(this: HTMLMediaElement) {
      return paused.get(this) ?? true;
    },
  });
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    paused.set(this, false);
    plays.push(this.muted ? "muted" : this.getAttribute("src") ?? this.src);
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
    if (paused.get(this) === false) {
      paused.set(this, true);
      this.dispatchEvent(new Event("pause"));
    }
  };
  HTMLMediaElement.prototype.load = function () {};
});

let recitation: ReturnType<typeof useRecitation>;
function Probe() {
  recitation = useRecitation();
  return null;
}

let root: Root;
let host: HTMLElement;
async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<RecitationProvider><Probe /></RecitationProvider>));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}
const elements = () => Array.from(host.querySelectorAll("audio"));
const sounding = () => elements().filter((element) => !element.paused && !element.muted);
const file = (surah: number, ayah: number) =>
  `https://everyayah.com/data/Alafasy_128kbps/${String(surah).padStart(3, "0")}${String(ayah).padStart(3, "0")}.mp3`;
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  setVisibility("visible");
});

describe("RecitationProvider — one verse sounds at a time", () => {
  it("goes on in the background with the element already playing, never starting the other one", async () => {
    await mount();
    await act(async () => recitation.playAyah(2, 3));
    await settle();
    const [playing] = sounding();
    expect(playing.getAttribute("src")).toBe(file(2, 3));

    setVisibility("hidden");
    plays = [];
    await act(async () => playing.dispatchEvent(new Event("ended")));
    await settle();
    // The same element took the next verse; the standby one was never started.
    expect(plays).toEqual([file(2, 4)]);
    expect(sounding()).toEqual([playing]);
    expect(recitation.current).toEqual({ surah: 2, ayah: 4 });
  });

  it("switches to the verse loaded ahead while the app is in front", async () => {
    await mount();
    await act(async () => recitation.playAyah(2, 3));
    await settle();
    const [first] = sounding();
    await act(async () => first.dispatchEvent(new Event("ended")));
    await settle();
    const now = sounding();
    expect(now).toHaveLength(1);
    expect(now[0]).not.toBe(first);
    expect(now[0].getAttribute("src")).toBe(file(2, 4));
  });

  it("silences a start that isn't the recitation's (iOS releasing a held one)", async () => {
    await mount();
    await act(async () => recitation.playAyah(2, 3));
    await settle();
    const [playing] = sounding();
    const other = elements().find((element) => element !== playing) as HTMLAudioElement;
    await act(async () => {
      void other.play();
    });
    expect(sounding()).toEqual([playing]);
    expect(other.paused).toBe(true);
  });
});

describe("RecitationProvider — a verse heard on its own", () => {
  it("is no session (no player, no bar, not followed) and ends with its verse", async () => {
    await mount();
    await act(async () => recitation.playVerseOnce(2, 3));
    await settle();
    expect(recitation.current).toEqual({ surah: 2, ayah: 3 });
    expect(recitation.range?.once).toBe(true);
    expect(recitation.active).toBe(false);
    const [playing] = sounding();
    await act(async () => playing.dispatchEvent(new Event("ended")));
    await settle();
    expect(recitation.current).toBeNull();
    expect(sounding()).toEqual([]);
  });

  it("gives way to a recitation, which is a session", async () => {
    await mount();
    await act(async () => recitation.playVerseOnce(2, 3));
    await settle();
    await act(async () => recitation.playAyah(2, 5));
    await settle();
    expect(recitation.active).toBe(true);
    expect(sounding()).toHaveLength(1);
  });
});

describe("playOrResume — the play button", () => {
  const fake = (state: { isPlaying: boolean; current: { surah: number; ayah: number } | null }) => {
    const calls: string[] = [];
    return {
      calls,
      recitation: {
        ...state,
        toggle: () => calls.push("toggle"),
        playAyah: (surah: number, ayah: number) => calls.push(`play ${surah}:${ayah}`),
        startPending: () => calls.push("pending"),
      } as unknown as ReturnType<typeof useRecitation>,
    };
  };

  it("starts from the page in view when the reader moved away while paused", () => {
    const { calls, recitation } = fake({ isPlaying: false, current: { surah: 2, ayah: 57 } });
    playOrResume(recitation, { surah: 3, ayah: 1 });
    expect(calls).toEqual(["play 3:1"]);
  });

  it("resumes the paused verse when the reader is on it (or came back with «الآية المتلوّة»)", () => {
    const { calls, recitation } = fake({ isPlaying: false, current: { surah: 2, ayah: 57 } });
    playOrResume(recitation, null);
    expect(calls).toEqual(["toggle"]);
  });

  it("only pauses while playing, wherever the reader is", () => {
    const { calls, recitation } = fake({ isPlaying: true, current: { surah: 2, ayah: 57 } });
    playOrResume(recitation, { surah: 3, ayah: 1 });
    expect(calls).toEqual(["toggle"]);
  });
});

describe("RecitationProvider — a prepared surah recited from one recording", () => {
  const recording = (surah: number) => `/api/recitations/audio/alafasy/${surah}.mp3?v=1`;
  async function tick(audio: HTMLAudioElement, time: number) {
    audio.currentTime = time;
    await act(async () => audio.dispatchEvent(new Event("timeupdate")));
  }

  it("plays the surah's recording from the verse's start and follows the verses by their timings", async () => {
    await mount();
    await act(async () => recitation.playAyah(112, 2));
    await settle();
    const [audio] = sounding();
    expect(audio.getAttribute("src")).toBe(recording(112));
    await act(async () => audio.dispatchEvent(new Event("loadedmetadata")));
    expect(audio.currentTime).toBe(4); // verse 2 starts at 4 s
    await tick(audio, 6.5);
    expect(recitation.current).toEqual({ surah: 112, ayah: 3 });
    // A moment of silence keeps the tap's permission while the timings
    // arrive; then one file for the whole surah.
    expect(plays).toEqual(["/silence.wav", recording(112)]);
    expect(recitation.surahTiming).toMatchObject({ elapsed: 6.5, total: 10, exact: true });
  });

  it("seeks within the same recording for the next verse, and goes on to the next surah at its end", async () => {
    await mount();
    await act(async () => recitation.playAyah(112, 1));
    await settle();
    const [audio] = sounding();
    expect(audio.currentTime).toBe(0); // the first verse starts with the opening
    plays = [];
    await act(async () => recitation.next());
    await settle();
    expect(audio.currentTime).toBe(4);
    expect(plays).toEqual([recording(112)]); // the same file, played on
    await act(async () => audio.dispatchEvent(new Event("ended")));
    await settle();
    expect(recitation.current).toEqual({ surah: 113, ayah: 1 });
    expect(sounding()[0].getAttribute("src")).toBe(recording(113));
  });

  it("loops a repeated verse exactly at its end", async () => {
    await mount();
    await act(async () => recitation.playAyah(112, 2));
    await settle();
    const [audio] = sounding();
    await act(async () => recitation.setRepeatMode("verse"));
    await tick(audio, 6.1);
    expect(audio.currentTime).toBe(4);
    expect(recitation.current).toEqual({ surah: 112, ayah: 2 });
  });

  it("stops at the end of a chosen range", async () => {
    await mount();
    await act(async () => recitation.playRange({ start: { surah: 112, ayah: 1 }, end: { surah: 112, ayah: 2 } }));
    await settle();
    const [audio] = sounding();
    await tick(audio, 4.2);
    expect(recitation.current).toEqual({ surah: 112, ayah: 2 });
    await tick(audio, 6.0);
    expect(recitation.current).toBeNull();
    expect(recitation.pendingStart).toEqual({ surah: 112, ayah: 1 });
    expect(sounding()).toEqual([]);
  });

  it("seeks anywhere in the surah from its progress bar", async () => {
    await mount();
    await act(async () => recitation.playAyah(112, 1));
    await settle();
    const [audio] = sounding();
    await act(async () => recitation.seekSurah(0.75)); // 7.5 s of 10
    expect(audio.currentTime).toBe(7.5);
    expect(recitation.current).toEqual({ surah: 112, ayah: 3 });
  });
});
