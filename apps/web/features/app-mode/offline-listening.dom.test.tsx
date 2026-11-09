// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReciterItem } from "@q-basair/shared";

vi.mock("@/lib/app-mode/config", () => ({ APP_MODE: true, REMOTE_ORIGIN: "" }));

const onDevice = new Map<string, { done: number; total: number }>();
vi.mock("@/lib/app-mode/audio-ranges", () => ({
  FULL_QURAN: { start: { surah: 1, ayah: 1 }, end: { surah: 114, ayah: 6 } },
  rangeOnDevice: async (_reciter: unknown, range: { start: { surah: number } }) =>
    onDevice.get(String(range.start.surah)) ?? { done: 0, total: 10 },
}));

const started: unknown[] = [];
let job: unknown = null;
vi.mock("@/lib/app-mode/audio-jobs", () => ({
  startRangeDownload: (reciter: unknown, range: unknown) => started.push([reciter, range]),
  stopReciterDownload: () => started.push("stop"),
  useAudioJob: () => job,
}));

import { OfflineListening } from "./offline-listening";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const reciter: ReciterItem = {
  id: "husary",
  name: "محمود خليل الحُصري",
  name_english: "Husary",
  riwayah: "hafs",
  style: "murattal",
  audio_base: "https://everyayah.test/Husary",
  surahs: [],
};
const surah = { start: { surah: 112, ayah: 1 }, end: { surah: 112, ayah: 4 } };
const juz = { start: { surah: 78, ayah: 1 }, end: { surah: 114, ayah: 6 } };

let root: Root;
let host: HTMLElement;
async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <OfflineListening
        reciter={reciter}
        choices={[
          { key: "surah", label: "سورة الإخلاص", range: surah },
          { key: "juz", label: "الجزء 30", range: juz },
        ]}
      />,
    ),
  );
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}
const rows = () => Array.from(host.querySelectorAll(".qb-download-row"));

beforeEach(() => {
  onDevice.clear();
  started.length = 0;
  job = null;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("«للاستماع دون اتصال» — offline listening in the recitation sheet", () => {
  it("offers the sheet's ranges and the whole Quran, each with what is already on the device", async () => {
    onDevice.set("112", { done: 4, total: 4 });
    onDevice.set("78", { done: 5, total: 10 });
    await mount();
    expect(rows().map((row) => row.querySelector(".name > div")?.textContent)).toEqual(["سورة الإخلاص", "الجزء 30", "المصحف كاملاً"]);
    // The surah is on the device: nothing to download.
    expect(rows()[0].textContent).toContain("على الجهاز");
    expect(rows()[0].querySelector("button")).toBeNull();
    // Half the juz: resume.
    expect(rows()[1].textContent).toContain("٥٠٪ على الجهاز");
    expect(rows()[1].querySelector("button")?.textContent).toBe("استئناف");
  });

  it("downloads the chosen range for the reciter being listened to", async () => {
    await mount();
    await act(async () => (rows()[2].querySelector("button") as HTMLButtonElement).click());
    expect(started).toEqual([[{ id: "husary", audio_base: "https://everyayah.test/Husary", surahs: [] }, { start: { surah: 1, ayah: 1 }, end: { surah: 114, ayah: 6 } }]]);
  });

  it("shows the running download on its row, with a stop, and holds the others", async () => {
    job = { reciterId: "husary", status: "running", done: 3, total: 10, surah: 80, range: juz };
    await mount();
    expect(rows()[1].querySelector("[role=status]")?.getAttribute("aria-label")).toBe("٣٠%");
    await act(async () => (rows()[1].querySelector("button") as HTMLButtonElement).click());
    expect(started).toEqual(["stop"]);
    expect((rows()[0].querySelector("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("says when the reciter has nothing for a range", async () => {
    onDevice.set("112", { done: 0, total: 0 });
    await mount();
    expect(rows()[0].textContent).toContain("غير متاحة لهذا القارئ");
    expect((rows()[0].querySelector("button") as HTMLButtonElement).disabled).toBe(true);
  });
});
