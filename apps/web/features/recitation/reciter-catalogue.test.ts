import type { ReciterItem } from "@q-basair/shared";
import { describe, expect, it } from "vitest";

import { foldArabic, isPlayable, partialSurahs, pickReciters, reciterName, reciterOtherName, riwayahsOf } from "./reciter-catalogue";

const reciter = (id: string, name: string, extra: Partial<ReciterItem> = {}): ReciterItem => ({
  id,
  name,
  name_english: id,
  riwayah: "hafs",
  style: "murattal",
  audio_base: "",
  surahs: Array.from({ length: 114 }, (_, index) => index + 1),
  ...extra,
});

const catalogue = [
  reciter("alafasy", "مشاري راشد العفاسي", { audio_base: "https://everyayah.com/data/Alafasy_128kbps", surahs: [] }),
  reciter("husary", "محمود خليل الحُصري", { audio_base: "https://everyayah.com/data/Husary_128kbps" }),
  reciter("zeta", "يحيى", {}),
  reciter("alpha", "إبراهيم الأخضر", {}),
  reciter("warsh-one", "قارئ ورش", { riwayah: "warsh", surahs: [1, 2, 3] }),
  reciter("empty", "لا شيء", { surahs: [] }),
];

describe("reciter catalogue — the pickers' list", () => {
  it("lists only reciters with something to play", () => {
    expect(isPlayable(catalogue[5])).toBe(false);
    expect(pickReciters(catalogue, {}).map((item) => item.id)).not.toContain("empty");
  });

  it("keeps the built-in reciters first, in their order, then the others by name", () => {
    expect(pickReciters(catalogue, {}).map((item) => item.id)).toEqual(["alafasy", "husary", "alpha", "warsh-one", "zeta"]);
  });

  it("puts the reader's narration first, and narrows to one when chosen", () => {
    expect(pickReciters(catalogue, { prefer: "warsh" })[0].id).toBe("warsh-one");
    expect(pickReciters(catalogue, { riwayah: "warsh" }).map((item) => item.id)).toEqual(["warsh-one"]);
    expect(riwayahsOf(catalogue)).toEqual(["hafs", "warsh"]);
  });

  it("finds names as typed: without diacritics, any alif, ة/ه, ى/ي, or in Latin", () => {
    expect(pickReciters(catalogue, { query: "الحصري" }).map((item) => item.id)).toEqual(["husary"]);
    expect(pickReciters(catalogue, { query: "ابراهيم" }).map((item) => item.id)).toEqual(["alpha"]);
    expect(pickReciters(catalogue, { query: "يحيي" }).map((item) => item.id)).toEqual(["zeta"]);
    expect(pickReciters(catalogue, { query: "ALAF" }).map((item) => item.id)).toEqual(["alafasy"]);
    expect(foldArabic("سُورَةُ  الفاتِحةِ")).toBe("سوره الفاتحه");
  });

  it("counts the surahs of a reciter that hasn't recited them all", () => {
    expect(partialSurahs(catalogue[4])).toBe(3);
    expect(partialSurahs(catalogue[2])).toBeNull();
    expect(partialSurahs(catalogue[0])).toBeNull(); // verse files cover every surah
  });
});

describe("a reciter's name in the interface language's script", () => {
  const item = { name: "مشاري راشد العفاسي", name_english: "Mishary Rashid Alafasy" };

  it("is in Arabic letters for the languages written in them", () => {
    for (const locale of ["ar", "fa", "ur"]) expect(reciterName(item, locale)).toBe("مشاري راشد العفاسي");
    expect(reciterOtherName(item, "ar")).toBe("Mishary Rashid Alafasy");
  });

  it("is in English for every other language", () => {
    for (const locale of ["en", "fr", "tr", "id", "zh"]) expect(reciterName(item, locale)).toBe("Mishary Rashid Alafasy");
    expect(reciterOtherName(item, "fr")).toBe("مشاري راشد العفاسي");
  });

  it("falls back to the name it has", () => {
    expect(reciterName({ name: "يحيى", name_english: "" }, "en")).toBe("يحيى");
    expect(reciterOtherName({ name: "يحيى", name_english: "" }, "en")).toBe("");
  });
});
