// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/app-mode/config", () => ({ APP_MODE: true, REMOTE_ORIGIN: "" }));

vi.mock("@/lib/app-mode/runtime", () => ({
  appRuntime: async () => ({ packs: { catalogue: async () => ({ packs: [] }), installed: async () => ({}) } }),
}));

// What is on the device: reciter → surah → bytes, and verses saved with a range.
let registry: Record<string, Record<string, number>> = {};
let partial: Record<string, Record<string, { ayahs: number[]; bytes: number }>> = {};
const removed: unknown[] = [];
vi.mock("@/lib/app-mode/audio", () => ({
  downloadedAudio: async () => JSON.parse(JSON.stringify(registry)),
  partialAudio: async () => JSON.parse(JSON.stringify(partial)),
  removeReciterAudio: async (reciter: string, surah?: number) => {
    removed.push(surah === undefined ? reciter : `${reciter}:${surah}`);
    if (surah === undefined) delete registry[reciter];
    else delete registry[reciter]?.[surah];
  },
}));

const started: { reciter: string; surahs: number[] }[] = [];
vi.mock("@/lib/app-mode/audio-jobs", () => ({
  startReciterDownload: async (reciter: { id: string }, surahs: { id: number }[]) => {
    started.push({ reciter: reciter.id, surahs: surahs.map((item) => item.id) });
  },
  stopReciterDownload: () => {},
  useAudioJob: () => null,
}));

import { DownloadsSettings } from "./downloads-settings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SURAHS = [
  { id: 1, name: "الفاتحة", ayah_count: 7 },
  { id: 2, name: "البقرة", ayah_count: 286 },
  { id: 3, name: "آل عمران", ayah_count: 200 },
];
const RECITERS = [
  { id: "alafasy", name: "مشاري العفاسي", name_english: "Alafasy", surahs: [1, 2, 3] },
  { id: "husary", name: "محمود خليل الحصري", name_english: "Husary", surahs: [1, 2, 3] },
];

let root: Root;
let host: HTMLElement;
async function settle() {
  for (let i = 0; i < 4; i += 1) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}
async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<DownloadsSettings />));
  await settle();
}
const reciterRows = () => Array.from(host.querySelectorAll(".qb-download-reciter"));
const button = (scope: Element, label: string) =>
  Array.from(scope.querySelectorAll("button")).find((item) => item.textContent === label) as HTMLButtonElement | undefined;
const click = async (element: Element | undefined) => {
  await act(async () => (element as HTMLElement).click());
  await settle();
};

beforeEach(() => {
  registry = {};
  partial = {};
  removed.length = 0;
  started.length = 0;
  vi.stubGlobal("fetch", async (url: string) => new Response(JSON.stringify(url.startsWith("/api/surahs") ? SURAHS : RECITERS)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("«التنزيلات» — recitations", () => {
  it("downloads a whole recitation in one step: the reciter, then «تنزيل»", async () => {
    await mount();
    const pick = host.querySelector(".qb-download-pick") as HTMLElement;
    expect(pick).not.toBeNull();
    expect(reciterRows()).toHaveLength(0);
    await click(button(pick, "تنزيل"));
    expect(started).toEqual([{ reciter: "alafasy", surahs: [1, 2, 3] }]);
  });

  it("lists every reciter on the device, deletes one after a confirming second tap", async () => {
    registry = { husary: { 1: 1024, 2: 2048 } };
    partial = { alafasy: { 3: { ayahs: [1, 2], bytes: 512 } } };
    await mount();
    expect(reciterRows().map((row) => row.querySelector(".qb-download-toggle > div")?.textContent)).toEqual(["مشاري العفاسي", "محمود خليل الحصري"]);
    const husary = reciterRows()[1];
    expect(husary.textContent).toContain("٢ من ٣ سورة");
    await click(button(husary, "حذف"));
    expect(removed).toEqual([]);
    await click(button(reciterRows()[1], "تأكيد الحذف"));
    expect(removed).toEqual(["husary"]);
    expect(reciterRows()).toHaveLength(1);
  });

  it("opens a reciter on its surahs: deletes one, adds another", async () => {
    registry = { husary: { 1: 1024, 2: 2048 } };
    await mount();
    await click(reciterRows()[0].querySelector(".qb-download-toggle") ?? undefined);
    const surahRows = () => Array.from(reciterRows()[0].querySelectorAll(".qb-download-row.is-surah"));
    expect(surahRows().map((row) => row.querySelector(".name > div")?.textContent)).toEqual(["١. الفاتحة", "٢. البقرة", "٣. آل عمران"]);
    await click(button(surahRows()[1], "حذف"));
    expect(removed).toEqual(["husary:2"]);
    await click(button(surahRows().at(-1) as Element, "تنزيل"));
    expect(started).toEqual([{ reciter: "husary", surahs: [3] }]);
  });
});
