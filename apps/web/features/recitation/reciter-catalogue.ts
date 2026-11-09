import type { ReciterItem } from "@q-basair/shared";

import { t } from "@/lib/i18n";

/**
 * The reciter list, as both pickers show it (the desktop dropdown and the
 * phone's sheet): 100+ reciters from the prepared recordings
 * (docs/recitation-audio.md) beside the built-in ones.
 */

/** The narrations, in the order the chips show them. */
export const RIWAYAH_ORDER = ["hafs", "shuba", "warsh", "qaloun", "douri", "sousi", "bazzi", "qunbul"] as const;

/** A narration's name in the interface language. */
export function riwayahLabel(key: string | undefined): string {
  switch (key) {
    case undefined:
    case "":
    case "hafs":
      return t("حفص");
    case "shuba":
      return t("شعبة");
    case "warsh":
      return t("ورش");
    case "qaloun":
      return t("قالون");
    case "douri":
      return t("الدوري");
    case "sousi":
      return t("السوسي");
    case "bazzi":
      return t("البزي");
    case "qunbul":
      return t("قنبل");
    default:
      return key;
  }
}

/** A recitation style's name (nothing for the usual murattal). */
export function styleLabel(style: string | undefined): string | null {
  if (style === "mujawwad") return t("مجوّد");
  if (style === "muallim") return t("معلّم");
  return null;
}

/** Something to play: verse files, or at least one prepared surah. */
export function isPlayable(reciter: ReciterItem): boolean {
  return Boolean(reciter.audio_base || reciter.surahs?.length);
}

/** How many surahs a reciter has, when not the whole Quran (verse files cover it all). */
export function partialSurahs(reciter: ReciterItem): number | null {
  if (reciter.audio_base) return null;
  const count = reciter.surahs?.length ?? 0;
  return count > 0 && count < 114 ? count : null;
}

/** Arabic as typed: no diacritics or tatweel, one alif, ة as ه, ى as ي. */
export function foldArabic(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[ً-ٰٟۖ-ۭـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The narrations present, in chip order. */
export function riwayahsOf(reciters: readonly ReciterItem[]): string[] {
  const present = new Set(reciters.map((item) => item.riwayah || "hafs"));
  const known = RIWAYAH_ORDER.filter((key) => present.has(key));
  const others = [...present].filter((key) => !(RIWAYAH_ORDER as readonly string[]).includes(key)).sort();
  return [...known, ...others];
}

/**
 * The reciters to list: those with something to play, matching the search
 * (Arabic or Latin name) and the chosen narration ("all": every one), the
 * reader's narration first, then the built-in reciters in their order, then
 * the others by name.
 */
export function pickReciters(
  reciters: readonly ReciterItem[],
  options: { query?: string; riwayah?: string; prefer?: string | null },
): ReciterItem[] {
  const query = foldArabic(options.query ?? "");
  const order = new Map(reciters.map((item, index) => [item.id, index]));
  return reciters
    .filter(isPlayable)
    .filter((item) => !options.riwayah || options.riwayah === "all" || (item.riwayah || "hafs") === options.riwayah)
    .filter((item) => !query || foldArabic(item.name).includes(query) || item.name_english.toLowerCase().includes(query))
    .sort((a, b) => {
      const preferred = Number((b.riwayah || "hafs") === options.prefer) - Number((a.riwayah || "hafs") === options.prefer);
      if (preferred) return preferred;
      const builtIn = Number(Boolean(b.audio_base)) - Number(Boolean(a.audio_base));
      if (builtIn) return builtIn;
      if (a.audio_base) return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
      return a.name.localeCompare(b.name, "ar");
    });
}
