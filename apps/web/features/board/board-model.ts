import type { NotebookItem, ThemeBoard, ThemeBoardEdge, ThemeBoardNode } from "@q-basair/shared";

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

const NODE_TYPES = new Set(["ayah", "note", "heading"]);

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
  return { v: 1, nodes: nodes.map((node) => ({ ...node, data: node.data ?? {} })), edges, viewport };
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
  const wanted = new Map(items.map((item) => [ayahNodeId(item), item]));
  const kept = board.nodes.filter((node) => node.type !== "ayah" || wanted.has(node.id));
  const present = new Set(kept.map((node) => node.id));
  const missing = items.filter((item) => !present.has(ayahNodeId(item)));

  const bottom = kept.length ? Math.max(...kept.map((node) => node.y + (node.h ?? ROW_H))) + GAP_Y : 0;
  const added: ThemeBoardNode[] = missing.map((item, index) => ({
    id: ayahNodeId(item),
    type: "ayah",
    ...gridSlot(index, bottom),
    data: { ayah_id: item.ayah_id, mushaf_id: item.mushaf_id },
  }));

  const nodes = [...kept, ...added];
  const ids = new Set(nodes.map((node) => node.id));
  const edges = board.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  return { ...board, nodes, edges };
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

let counter = 0;
export function newNodeId(prefix: "n" | "h" | "e"): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}
