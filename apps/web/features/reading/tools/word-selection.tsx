"use client";

import { createContext, useContext } from "react";

/**
 * Word selection for the «تحديد» tool. Words carry `data-wk="surah:ayah:pos"`
 * (plus `data-aid` = ayah id) in every renderer; a selection is the run of
 * words between an anchor and a focus word in reading (DOM) order, which
 * naturally spans lines, ayahs and — in a spread or scroll view — pages.
 */
export function wordKey(surah: number, ayah: number, position: number): string {
  return `${surah}:${ayah}:${position}`;
}

export type WordRef = { surah: number; ayah: number; position: number };

export function parseWordKey(key: string): WordRef | null {
  const [surah, ayah, position] = key.split(":").map(Number);
  return Number.isInteger(surah) && Number.isInteger(ayah) && Number.isInteger(position)
    ? { surah, ayah, position }
    : null;
}

/** The inclusive run of keys between `anchor` and `focus` in `ordered` (either direction). */
export function keysBetween(ordered: string[], anchor: string, focus: string): string[] {
  const from = ordered.indexOf(anchor);
  const to = ordered.indexOf(focus);
  if (from < 0 || to < 0) return focus ? [focus] : [];
  return ordered.slice(Math.min(from, to), Math.max(from, to) + 1);
}

export type WordSelection = {
  anchor: string;
  keys: string[];
  /** The selected words' Arabic text, in reading order. */
  text: string;
  /** First / last selected words. */
  start: WordRef;
  end: WordRef;
  /** Ayah id of the first selected word (for «نسخ»/«اسأل» context). */
  ayahId: number | null;
  /** Printed page of the first selected word, when known. */
  page: number | null;
};

/** Build the selection from the reader surface's word elements. */
export function readSelection(root: HTMLElement, anchor: string, focus: string): WordSelection | null {
  const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-wk]"));
  const ordered = elements.map((el) => el.dataset.wk ?? "");
  const keys = keysBetween(ordered, anchor, focus);
  if (keys.length === 0) return null;
  const wanted = new Set(keys);
  const picked = elements.filter((el) => wanted.has(el.dataset.wk ?? ""));
  const text = picked
    .map((el) => (el.querySelector(".qb-sr-only")?.textContent ?? el.textContent ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const start = parseWordKey(keys[0]);
  const end = parseWordKey(keys[keys.length - 1]);
  if (!start || !end) return null;
  const first = picked[0];
  const pageAttr = first?.closest<HTMLElement>("[data-page]")?.dataset.page;
  return {
    anchor,
    keys,
    text,
    start,
    end,
    ayahId: first?.dataset.aid ? Number(first.dataset.aid) : null,
    page: pageAttr ? Number(pageAttr) || null : null,
  };
}

const PickedWordsContext = createContext<(key: string) => boolean>(() => false);

export const PickedWordsProvider = PickedWordsContext.Provider;

export function usePickedWords(): (key: string) => boolean {
  return useContext(PickedWordsContext);
}
