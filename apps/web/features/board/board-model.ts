import type { NotebookItem, ThemeBoard, ThemeBoardEdge, ThemeBoardEntry, ThemeBoardNode, ThemeBoardSet } from "@q-basair/shared";

/**
 * The theme board (لوحة الموضوع) as data. The board is stored as the theme's
 * metadata (`PUT /api/themes/{id}/board`); ayah nodes are DERIVED from the
 * theme's saved ayahs — reconciled on open — while notes, headings, edges and
 * every position are the researcher's own.
 */

export const NODE_W = 280;
const GAP_X = 40;
const GAP_Y = 60;
const ROW_H = 200;
const COLUMNS = 3;

/** Relation labels offered when linking two nodes (free text is allowed too). */
export const RELATION_LABELS = ["يفسّر", "يؤكّد", "يقابل", "سبب ← نتيجة", "مثال", "يتكرّر في"];

export function ayahNodeId(item: Pick<NotebookItem, "mushaf_id" | "ayah_id">): string {
  return `a-${item.mushaf_id || 0}-${item.ayah_id}`;
}

export function emptyBoard(): ThemeBoard {
  return { v: 1, nodes: [], edges: [], viewport: null };
}

const NODE_TYPES = new Set(["ayah", "note", "heading", "shape"]);

/** Accept only a well-formed v1 board from storage; anything else starts empty. */
export function sanitizeBoard(raw: unknown): ThemeBoard {
  if (!raw || typeof raw !== "object" || (raw as ThemeBoard).v !== 1) return emptyBoard();
  const board = raw as ThemeBoard;
  const nodes = (Array.isArray(board.nodes) ? board.nodes : []).filter(
    (node): node is ThemeBoardNode =>
      !!node &&
      typeof node.id === "string" &&
      NODE_TYPES.has(node.type) &&
      Number.isFinite(node.x) &&
      Number.isFinite(node.y),
  );
  const ids = new Set(nodes.map((node) => node.id));
  const edges = (Array.isArray(board.edges) ? board.edges : []).filter(
    (edge): edge is ThemeBoardEdge =>
      !!edge && typeof edge.id === "string" && ids.has(edge.source) && ids.has(edge.target),
  );
  const viewport =
    board.viewport && [board.viewport.x, board.viewport.y, board.viewport.zoom].every(Number.isFinite)
      ? board.viewport
      : null;
  const hidden = Array.isArray(board.hidden) ? board.hidden.filter((id): id is string => typeof id === "string") : [];
  return { v: 1, nodes: nodes.map((node) => ({ ...node, data: node.data ?? {} })), edges, viewport, hidden };
}

/** Grid slot `index` below everything already placed (so new ayahs never overlap). */
export function gridSlot(index: number, top: number): { x: number; y: number } {
  return {
    x: (index % COLUMNS) * (NODE_W + GAP_X),
    y: top + Math.floor(index / COLUMNS) * (ROW_H + GAP_Y),
  };
}

/**
 * Make the board match the theme's ayahs: keep existing ayah nodes (and their
 * positions), add a node for each newly themed ayah on a grid below the current
 * content, and drop nodes for ayahs that left the theme along with their edges.
 */
export function reconcileBoard(board: ThemeBoard, items: NotebookItem[]): ThemeBoard {
  // Hidden ayahs stay in the theme but off the board. An ayah that left the
  // theme is forgotten from `hidden`, so re-adding it later shows it again.
  const inTheme = new Set(items.map(ayahNodeId));
  const hidden = (board.hidden ?? []).filter((id) => inTheme.has(id));
  const hiddenSet = new Set(hidden);
  const wanted = new Map(items.filter((item) => !hiddenSet.has(ayahNodeId(item))).map((item) => [ayahNodeId(item), item]));
  const kept = board.nodes.filter((node) => node.type !== "ayah" || wanted.has(node.id));
  const present = new Set(kept.map((node) => node.id));
  const missing = [...wanted.values()].filter((item) => !present.has(ayahNodeId(item)));

  const bottom = kept.length ? Math.max(...kept.map((node) => node.y + (node.h ?? ROW_H))) + GAP_Y : 0;
  const added: ThemeBoardNode[] = missing.map((item, index) => ({
    id: ayahNodeId(item),
    type: "ayah",
    ...gridSlot(index, bottom),
    data: { ayah_id: item.ayah_id, mushaf_id: item.mushaf_id },
  }));

  const nodes = [...kept, ...added];
  const ids = new Set(nodes.map((node) => node.id));
  // Relations of a hidden ayah are kept (parked) so they return with it.
  const known = (id: string) => ids.has(id) || hiddenSet.has(id);
  const edges = board.edges.filter((edge) => known(edge.source) && known(edge.target));
  return { ...board, nodes, edges, hidden };
}

/** Split edges into those drawable now and those parked on a hidden ayah. */
export function splitEdges<E extends { source: string; target: string }>(edges: E[], hidden: readonly string[]): { shown: E[]; parked: E[] } {
  const off = new Set(hidden);
  const shown: E[] = [];
  const parked: E[] = [];
  for (const edge of edges) (off.has(edge.source) || off.has(edge.target) ? parked : shown).push(edge);
  return { shown, parked };
}

/** Tidy: ayahs in reading order on a grid, then notes/headings beneath. */
export function arrangeBoard(board: ThemeBoard, order: (nodeId: string) => number): ThemeBoard {
  const ayahs = board.nodes.filter((node) => node.type === "ayah").sort((a, b) => order(a.id) - order(b.id));
  const others = board.nodes.filter((node) => node.type !== "ayah");
  const placed = ayahs.map((node, index) => ({ ...node, ...gridSlot(index, 0) }));
  const top = placed.length ? Math.ceil(placed.length / COLUMNS) * (ROW_H + GAP_Y) : 0;
  const rest = others.map((node, index) => ({ ...node, ...gridSlot(index, top) }));
  return { ...board, nodes: [...placed, ...rest] };
}

/**
 * A theme's boards. v2 stores a set of named boards; a legacy v1 board (one
 * per theme) reads as a set of one, keeping its id stable ("b-1") so research
 * provenance pointing at the theme still finds it. Nothing stored → no board.
 */
export const LEGACY_BOARD_ID = "b-1";

export function readBoards(raw: unknown, legacyName: string): ThemeBoardEntry[] {
  if (raw && typeof raw === "object" && (raw as ThemeBoardSet).v === 2) {
    const set = raw as ThemeBoardSet;
    return (Array.isArray(set.boards) ? set.boards : [])
      .filter((entry): entry is ThemeBoardEntry => !!entry && typeof entry.id === "string")
      .map((entry) => ({
        id: entry.id,
        name: typeof entry.name === "string" && entry.name.trim() ? entry.name : legacyName,
        created_at: Number(entry.created_at) || 0,
        updated_at: Number(entry.updated_at) || 0,
        board: sanitizeBoard(entry.board),
      }));
  }
  if (raw && typeof raw === "object" && (raw as ThemeBoard).v === 1) {
    return [{ id: LEGACY_BOARD_ID, name: legacyName, created_at: 0, updated_at: 0, board: sanitizeBoard(raw) }];
  }
  return [];
}

export function boardSet(boards: ThemeBoardEntry[]): ThemeBoardSet {
  return { v: 2, boards };
}

export function newBoardEntry(name: string): ThemeBoardEntry {
  const now = Math.floor(Date.now() / 1000);
  return { id: newNodeId("b"), name, created_at: now, updated_at: now, board: emptyBoard() };
}

/** Replace (or append) one board in the list, stamping its update time. */
export function putBoard(boards: ThemeBoardEntry[], entry: ThemeBoardEntry): ThemeBoardEntry[] {
  const stamped = { ...entry, updated_at: Math.floor(Date.now() / 1000) };
  return boards.some((item) => item.id === entry.id)
    ? boards.map((item) => (item.id === entry.id ? stamped : item))
    : [...boards, stamped];
}

/** «research from a board» provenance: `theme:board` (a bare theme id = its first board). */
export function boardSourceId(themeId: number, boardId: string): string {
  return `${themeId}:${boardId}`;
}

export function parseBoardSource(value: string | null | undefined): { themeId: number; boardId: string | null } | null {
  if (!value) return null;
  const [theme, board] = String(value).split(":");
  const themeId = Number(theme);
  return Number.isInteger(themeId) && themeId > 0 ? { themeId, boardId: board || null } : null;
}

let counter = 0;
export function newNodeId(prefix: "n" | "h" | "s" | "e" | "b"): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}
