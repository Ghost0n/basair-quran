import { describe, expect, it } from "vitest";

import { blocks, OUTLINE_GAP, OUTLINE_PAD, OUTLINE_RADIUS, outlinePath, rowsFromRects, separate } from "./verse-outline";

const rect = (left: number, right: number, top: number, bottom: number) => ({ left, right, top, bottom });

describe("verse outline", () => {
  it("merges a line's fragments into one row, padded", () => {
    const rows = rowsFromRects([rect(100, 150, 0, 30), rect(160, 300, 2, 28)], 400);
    expect(rows).toEqual([{ x1: 100 - OUTLINE_PAD, x2: 300 + OUTLINE_PAD, top: 0, bottom: 30 }]);
  });

  it("joins adjacent lines at the middle of the space between them", () => {
    const rows = rowsFromRects([rect(0, 200, 0, 30), rect(0, 300, 40, 70)], 400);
    const [block] = blocks(rows);
    expect(block).toHaveLength(2);
    expect(block[0].bottom).toBe(35);
    expect(block[1].top).toBe(35);
  });

  it("draws one closed outline for a verse over several lines", () => {
    const [block] = blocks(rowsFromRects([rect(150, 400, 0, 30), rect(0, 400, 40, 70), rect(220, 400, 80, 110)], 400));
    const d = outlinePath(block);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.match(/M/g)).toHaveLength(1);
    // The outline's top and bottom sit GAP/2 inside the lines.
    const ys = [...d.matchAll(/Q[-\d.]+ ([-\d.]+)/g)].map((match) => Number(match[1]));
    expect(Math.min(...ys)).toBe(OUTLINE_GAP / 2);
    expect(Math.max(...ys)).toBe(110 - OUTLINE_GAP / 2);
  });

  it("keeps two verses on one line GAP apart", () => {
    const a = rowsFromRects([rect(200, 400, 0, 30)], 400);
    const b = rowsFromRects([rect(0, 198, 0, 30)], 400);
    separate(a, b);
    expect(a[0].x1 - b[0].x2).toBeCloseTo(OUTLINE_GAP);
  });

  it("splits lines that barely overlap into separate blocks (no thin bridge)", () => {
    const rows = rowsFromRects([rect(0, 60, 0, 30), rect(300, 400, 40, 70)], 400);
    expect(blocks(rows)).toHaveLength(2);
  });

  it("keeps a verse whose lines barely overlap as one block on the web (2:2 on page 2)", () => {
    const rows = rowsFromRects([rect(111, 294, 0, 30), rect(290, 349, 40, 70)], 460);
    expect(blocks(rows.map((row) => ({ ...row })))).toHaveLength(2);
    const [block, ...rest] = blocks(rows, { bridge: true });
    expect(rest).toHaveLength(0);
    const joint = Math.min(block[0].x2, block[1].x2) - Math.max(block[0].x1, block[1].x1);
    expect(joint).toBeGreaterThan(OUTLINE_RADIUS * 2);
    expect(outlinePath(block).match(/M/g)).toHaveLength(1);
  });

  it("never bridges lines that don't overlap", () => {
    const rows = rowsFromRects([rect(0, 60, 0, 30), rect(300, 400, 40, 70)], 400);
    expect(blocks(rows, { bridge: true })).toHaveLength(2);
  });
});
