"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { useSavedAyat, type SavableAyah, type SavedAyat } from "@/features/reading/use-saved-ayat";

import { ThemeSheet } from "./theme-sheet";

type OpenOptions = {
  /** Runs when the sheet closes (e.g. the reader clears its verse selection). */
  onClose?: () => void;
};

type SaveAyahValue = {
  /** The app's saved-ayah store (which ayāt are saved, with which themes). */
  saved: SavedAyat;
  /** Save an ayah the one way the app saves: the «حفظ وتظليل» theme sheet. */
  openSave: (ayah: SavableAyah, options?: OpenOptions) => void;
};

const SaveAyahContext = createContext<SaveAyahValue | null>(null);

/**
 * One way to save an ayah, everywhere: every surface that saves a verse (the
 * reader, search results, …) calls `openSave`, which opens the same theme sheet
 * as the reader — themes are picked there and the ayah is saved on «تمّ» (closing
 * the sheet saves nothing). Mounted once in the shell, so there is a single store
 * and a single sheet.
 */
export function SaveAyahProvider({ children }: { children: ReactNode }) {
  const saved = useSavedAyat();
  const [target, setTarget] = useState<SavableAyah | null>(null);
  const onCloseRef = useRef<(() => void) | undefined>(undefined);

  const openSave = useCallback((ayah: SavableAyah, options?: OpenOptions) => {
    // Opening another verse replaces the sheet (and its close callback): the
    // caller has already moved its own state to the new verse.
    onCloseRef.current = options?.onClose;
    setTarget(ayah);
  }, []);

  const close = useCallback(() => {
    const done = onCloseRef.current;
    onCloseRef.current = undefined;
    setTarget(null);
    done?.();
  }, []);

  const value = useMemo(() => ({ saved, openSave }), [saved, openSave]);

  return (
    <SaveAyahContext.Provider value={value}>
      {children}
      {target ? <ThemeSheet key={target.ayah_id} ayah={target} saved={saved} onClose={close} /> : null}
    </SaveAyahContext.Provider>
  );
}

export function useSaveAyah(): SaveAyahValue {
  const value = useContext(SaveAyahContext);
  if (!value) throw new Error("useSaveAyah must be used inside <SaveAyahProvider> (mounted by the shell)");
  return value;
}
