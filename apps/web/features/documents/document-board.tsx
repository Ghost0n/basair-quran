"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { NotebookItem, PostBoardSnapshot } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { API_BASE_URL } from "@/lib/config";
import { useStickyState } from "@/lib/use-sticky-state";
import { BoardView } from "@/features/board/board-view";
import { ayahNodeId, readBoards } from "@/features/board/board-model";
import { boardUrl } from "@/features/board/last-board";

import { t } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

/**
 * The theme board a research was built from, shown inside the editor with its
 * drawn relations (read-only here — «عدّل اللوحة» opens the board itself).
 * Built from the researcher's own theme + notebook, so it is always current.
 */
export function DocumentBoard({
  source,
  onOpenAyah,
}: {
  /** The board the research came from (`boardId` null = the theme's first board). */
  source: { themeId: number; boardId: string | null };
  onOpenAyah: (item: NotebookItem) => void;
}) {
  const { themeId, boardId } = source;
  const [openId, setOpenId] = useState<string | null>(boardId);
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<PostBoardSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useStickyState<boolean>("qb.doc.boardOpen", true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getTheme(themeId), api.getNotebook()])
      .then(([theme, notebook]) => {
        if (cancelled) return;
        const boards = readBoards(theme.board, theme.name);
        const entry = boardId ? boards.find((item) => item.id === boardId) : boards[0];
        const board = entry?.board;
        if (!entry || !board || board.nodes.length === 0) {
          setFailed(true);
          return;
        }
        const byNode = new Map(notebook.map((item) => [ayahNodeId(item), item]));
        const ayahs: PostBoardSnapshot["ayahs"] = {};
        for (const node of board.nodes) {
          const item = byNode.get(node.id);
          if (node.type === "ayah" && item && item.surah_id != null && item.ayah != null) {
            ayahs[node.id] = { surah_id: item.surah_id, surah: item.surah ?? "", ayah: item.ayah, text: item.text ?? "" };
          }
        }
        setOpenId(entry.id);
        setSnapshot({ theme: { name: entry.name, color: theme.color }, board, ayahs });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [themeId, boardId]);

  if (failed) return null;

  return (
    <section className={`qb-doc-board${open ? " open" : ""}`}>
      <div className="head">
        <button type="button" className="toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <Icon name={open ? "chevUp" : "chevDown"} size={15} />
          <span>{t("لوحة الموضوع")}</span>
          {snapshot ? <span className="name">{snapshot.theme.name}</span> : null}
        </button>
        <button type="button" className="edit" onClick={() => router.push(openId ? boardUrl(themeId, openId) : `/?mode=board&theme=${themeId}`)}>
          <Icon name="edit" size={14} /> {t("عدّل اللوحة")}
        </button>
      </div>
      {open ? (
        <div className="canvas qb-board">
          {snapshot ? <BoardView snapshot={snapshot} onOpenAyah={onOpenAyah} /> : <p className="state">{t("جارٍ تحميل اللوحة…")}</p>}
        </div>
      ) : null}
    </section>
  );
}
