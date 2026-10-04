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
  /** Every word of one verse is selected (a verse number tap, or all its words). */
  wholeVerse: boolean;
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
    // The glyph readers' last word of an ayah carries its number: drop it.
    .map((el) => (el.querySelector(".qb-sr-only")?.textContent ?? el.textContent ?? "").replace(/\s*[0-9٠-٩۰-۹]+\s*$/, "").trim())
    .filter(Boolean)
    .join(" ");
  const start = parseWordKey(keys[0]);
  const end = parseWordKey(keys[keys.length - 1]);
  if (!start || !end) return null;
  const first = picked[0];
  const pageAttr = first?.closest<HTMLElement>("[data-page]")?.dataset.page;
  const versePrefix = `${start.surah}:${start.ayah}:`;
  const verseWords = new Set(ordered.filter((key) => key.startsWith(versePrefix)));
  const wholeVerse =
    start.surah === end.surah && start.ayah === end.ayah && verseWords.size > 0 && wanted.size === verseWords.size;
  return {
    anchor,
    keys,
    text,
    start,
    end,
    ayahId: first?.dataset.aid ? Number(first.dataset.aid) : null,
    page: pageAttr ? Number(pageAttr) || null : null,
    wholeVerse,
  };
}

/**
 * «تظليل» works on whole verses: the tapped verse ("focus") and the verse under
 * the pointer ("hover") render as one continuous block — never word by word.
 */
/** "recite": the verse being recited (media bar), lit the same continuous way. */
export type VerseFocus = "focus" | "hover" | "recite" | null;

const VerseFocusContext = createContext<(ayahId: number) => VerseFocus>(() => null);

export const VerseFocusProvider = VerseFocusContext.Provider;

export function useVerseFocus(): (ayahId: number) => VerseFocus {
  return useContext(VerseFocusContext);
}

/** Class suffix for a verse wrapper in the given focus state. */
export function verseFocusClass(state: VerseFocus): string {
  if (state === "focus") return " qb-verse-focus";
  if (state === "hover") return " qb-verse-focus is-hover";
  return state === "recite" ? " qb-verse-focus is-recite" : "";
}

const PickedWordsContext = createContext<(key: string) => boolean>(() => false);

export const PickedWordsProvider = PickedWordsContext.Provider;

export function usePickedWords(): (key: string) => boolean {
  return useContext(PickedWordsContext);
}
