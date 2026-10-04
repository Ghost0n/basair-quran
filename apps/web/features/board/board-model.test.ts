import { describe, expect, it } from "vitest";

import type { NotebookItem, ThemeBoard } from "@q-basair/shared";

import {
  LEGACY_BOARD_ID,
  arrangeBoard,
  ayahNodeId,
  boardSet,
  emptyBoard,
  newBoardEntry,
  parseBoardSource,
  putBoard,
  readBoards,
  reconcileBoard,
  sanitizeBoard,
  splitEdges,
} from "./board-model";

function item(id: number, ayah_id: number): NotebookItem {
  return { id, ayah_id, mushaf_id: 2, theme_ids: [1], created_at: id };
}

describe("reconcileBoard", () => {
  it("adds a node per themed ayah on an empty board", () => {
    const board = reconcileBoard(emptyBoard(), [item(1, 10), item(2, 20)]);
    expect(board.nodes.map((node) => node.id)).toEqual(["a-2-10", "a-2-20"]);
    expect(board.nodes[0]).toMatchObject({ type: "ayah", x: 0, y: 0, data: { ayah_id: 10, mushaf_id: 2 } });
    expect(board.nodes[1].x).toBeGreaterThan(0);
  });

  it("keeps positions, notes and edges; drops ayahs that left the theme", () => {
    const start: ThemeBoard = {
      v: 1,
      nodes: [
        { id: "a-2-10", type: "ayah", x: 500, y: 40, data: { ayah_id: 10 } },
        { id: "a-2-30", type: "ayah", x: 0, y: 0, data: { ayah_id: 30 } },
        { id: "n-1", type: "note", x: 100, y: 100, data: { text: "ملاحظة" } },
      ],
      edges: [
        { id: "e-1", source: "a-2-10", target: "n-1", label: "يفسّر" },
        { id: "e-2", source: "a-2-30", target: "n-1" },
      ],
    };
    const board = reconcileBoard(start, [item(1, 10), item(2, 40)]);
    expect(board.nodes.find((node) => node.id === "a-2-10")).toMatchObject({ x: 500, y: 40 });
    expect(board.nodes.some((node) => node.id === "a-2-30")).toBe(false);
    expect(board.nodes.some((node) => node.id === "n-1")).toBe(true);
    expect(board.edges.map((edge) => edge.id)).toEqual(["e-1"]);
    // The new ayah lands below existing content.
    const added = board.nodes.find((node) => node.id === ayahNodeId(item(2, 40)))!;
    expect(added.y).toBeGreaterThan(100);
  });
});

describe("hidden ayahs", () => {
  const start: ThemeBoard = {
    v: 1,
    nodes: [
      { id: "a-2-10", type: "ayah", x: 0, y: 0, data: { ayah_id: 10 } },
      { id: "a-2-20", type: "ayah", x: 320, y: 0, data: { ayah_id: 20 } },
    ],
    edges: [{ id: "e-1", source: "a-2-10", target: "a-2-20", label: "يفسّر" }],
    hidden: ["a-2-20"],
  };

  it("keeps a hidden ayah off the board but parks its relations", () => {
    const board = reconcileBoard(start, [item(1, 10), item(2, 20)]);
    expect(board.nodes.map((node) => node.id)).toEqual(["a-2-10"]);
    expect(board.hidden).toEqual(["a-2-20"]);
    expect(board.edges.map((edge) => edge.id)).toEqual(["e-1"]);
    expect(splitEdges(board.edges, board.hidden ?? [])).toEqual({ shown: [], parked: board.edges });
  });

  it("forgets an ayah that left the theme, so re-adding it shows it again", () => {
    const left = reconcileBoard(start, [item(1, 10)]);
    expect(left.hidden).toEqual([]);
    const back = reconcileBoard(left, [item(1, 10), item(2, 20)]);
    expect(back.nodes.some((node) => node.id === "a-2-20")).toBe(true);
  });
});

describe("theme boards (several per theme)", () => {
  it("reads nothing as no board, a legacy board as a set of one, a set as is", () => {
    expect(readBoards(null, "الصبر")).toEqual([]);
    const legacy = readBoards({ v: 1, nodes: [{ id: "n-1", type: "note", x: 0, y: 0, data: {} }], edges: [] }, "الصبر");
    expect(legacy.map((entry) => [entry.id, entry.name, entry.board.nodes.length])).toEqual([[LEGACY_BOARD_ID, "الصبر", 1]]);
    const set = readBoards(
      { v: 2, boards: [{ id: "b-x", name: "", created_at: 1, updated_at: 2, board: { v: 1, nodes: [], edges: [] } }] },
      "الصبر",
    );
    expect(set.map((entry) => [entry.id, entry.name])).toEqual([["b-x", "الصبر"]]);
  });

  it("adds or replaces one board and stamps it", () => {
    const a = newBoardEntry("أ");
    const b = { ...newBoardEntry("ب"), updated_at: 0 };
    const list = putBoard([a], b);
    expect(list.map((entry) => entry.id)).toEqual([a.id, b.id]);
    expect(list[1].updated_at).toBeGreaterThan(0);
    expect(putBoard(list, { ...a, name: "أأ" }).map((entry) => entry.name)).toEqual(["أأ", "ب"]);
    expect(boardSet(list).v).toBe(2);
  });

  it("parses research provenance: theme, or theme:board", () => {
    expect(parseBoardSource("12")).toEqual({ themeId: 12, boardId: null });
    expect(parseBoardSource("12:b-x")).toEqual({ themeId: 12, boardId: "b-x" });
    expect(parseBoardSource("abc")).toBeNull();
    expect(parseBoardSource(null)).toBeNull();
  });
});

describe("sanitizeBoard", () => {
  it("rejects foreign shapes and dangling edges", () => {
    expect(sanitizeBoard(null)).toEqual(emptyBoard());
    expect(sanitizeBoard({ v: 2, nodes: [] })).toEqual(emptyBoard());
    const board = sanitizeBoard({
      v: 1,
      nodes: [
        { id: "n-1", type: "note", x: 1, y: 2 },
        { id: "bad", type: "iframe", x: 0, y: 0 },
        { id: "n-2", type: "note", x: "1", y: 2 },
      ],
      edges: [
        { id: "e", source: "n-1", target: "bad" },
      ],
      viewport: { x: 0, y: 0, zoom: "big" },
    });
    expect(board.nodes.map((node) => node.id)).toEqual(["n-1"]);
    expect(board.nodes[0].data).toEqual({});
    expect(board.edges).toEqual([]);
    expect(board.viewport).toBeNull();
  });
});

describe("arrangeBoard", () => {
  it("orders ayahs by reading order and puts notes beneath", () => {
    const board: ThemeBoard = {
      v: 1,
      nodes: [
        { id: "a-2-20", type: "ayah", x: 900, y: 900, data: {} },
        { id: "n-1", type: "note", x: 0, y: 0, data: {} },
        { id: "a-2-10", type: "ayah", x: 400, y: 400, data: {} },
      ],
      edges: [],
    };
    const arranged = arrangeBoard(board, (id) => Number(id.split("-")[2]));
    expect(arranged.nodes.map((node) => [node.id, node.x, node.y])).toEqual([
      ["a-2-10", 0, 0],
      ["a-2-20", 320, 0],
      ["n-1", 0, 260],
    ]);
  });
});
