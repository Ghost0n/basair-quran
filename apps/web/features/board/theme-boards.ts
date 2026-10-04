"use client";

import { useCallback, useEffect, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { ThemeBoardEntry, ThemeSummary } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";
import { useThemes } from "@/features/themes/themes-store";

import { boardSet, newBoardEntry, readBoards } from "./board-model";
import { forgetLastBoard } from "./last-board";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

export type BoardListing = ThemeBoardEntry & { theme: ThemeSummary; ayahs: number };

/**
 * Create a new, empty board in a theme and return its id. A theme can hold
 * several boards (or none): boards are made on purpose, never assumed.
 */
export async function createThemeBoard(theme: Pick<ThemeSummary, "id" | "name">, name?: string): Promise<string> {
  const detail = await api.getTheme(theme.id);
  const boards = readBoards(detail.board, detail.name);
  const entry = newBoardEntry(name?.trim() || (boards.length ? `${detail.name} ${boards.length + 1}` : detail.name));
  await api.saveThemeBoard(theme.id, boardSet([...boards, entry]));
  return entry.id;
}

/** Every board of every theme, newest first, with rename / delete. */
export function useThemeBoards() {
  const { themes, loaded } = useThemes();
  const [boards, setBoards] = useState<BoardListing[] | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    Promise.all(
      themes.map((theme) =>
        api
          .getTheme(theme.id)
          .then((detail) =>
            readBoards(detail.board, detail.name).map((entry) => ({
              ...entry,
              theme,
              ayahs: entry.board.nodes.filter((node) => node.type === "ayah").length,
            })),
          )
          .catch(() => [] as BoardListing[]),
      ),
    ).then((lists) => {
      if (!cancelled) setBoards(lists.flat().sort((a, b) => b.updated_at - a.updated_at));
    });
    return () => {
      cancelled = true;
    };
  }, [themes, loaded, version]);

  const mutate = useCallback(async (themeId: number, change: (entries: ThemeBoardEntry[]) => ThemeBoardEntry[]) => {
    const detail = await api.getTheme(themeId);
    await api.saveThemeBoard(themeId, boardSet(change(readBoards(detail.board, detail.name))));
    setVersion((value) => value + 1);
  }, []);

  const removeBoard = useCallback(
    async (themeId: number, boardId: string) => {
      await mutate(themeId, (entries) => entries.filter((entry) => entry.id !== boardId));
      forgetLastBoard(themeId, boardId);
    },
    [mutate],
  );

  const renameBoard = useCallback(
    (themeId: number, boardId: string, name: string) =>
      mutate(themeId, (entries) => entries.map((entry) => (entry.id === boardId ? { ...entry, name: name.trim() || entry.name } : entry))),
    [mutate],
  );

  return { boards, removeBoard, renameBoard, refresh: () => setVersion((value) => value + 1) };
}
