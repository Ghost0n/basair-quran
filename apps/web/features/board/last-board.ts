import type { ThemeColor } from "@q-basair/shared";

/** The board last worked on — Home offers to resume it. */
export type LastBoard = {
  theme: number;
  board: string;
  name: string;
  themeName: string;
  color: ThemeColor;
  at?: number;
};

const KEY = "qb.lastBoard";

export function rememberLastBoard(board: LastBoard): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...board, at: Math.floor(Date.now() / 1000) }));
  } catch {
    /* private mode — Home just won't offer to resume */
  }
}

export function readLastBoard(): LastBoard | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as LastBoard | null;
    return value && Number.isInteger(value.theme) && typeof value.board === "string" ? value : null;
  } catch {
    return null;
  }
}

export function forgetLastBoard(themeId: number, boardId?: string): void {
  const last = readLastBoard();
  if (last && last.theme === themeId && (!boardId || last.board === boardId)) {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* nothing to do */
    }
  }
}

export function boardUrl(themeId: number, boardId: string): string {
  return `/?mode=board&theme=${themeId}&board=${encodeURIComponent(boardId)}`;
}
