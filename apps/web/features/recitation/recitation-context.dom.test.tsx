// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@q-basair/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@q-basair/api-client")>()),
  createQBasairApiClient: () => ({
    getReciters: async () => [{ id: "alafasy", name: "مشاري", audio_base: "https://everyayah.com/data/Alafasy_128kbps" }],
    getSurahs: async () => [],
    getMushafs: async () => [],
    getReciterDurations: async () => ({ durations: [], complete: true }),
  }),
}));

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
