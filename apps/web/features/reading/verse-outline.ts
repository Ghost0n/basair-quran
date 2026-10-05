/**
 * The lit verse as one block: an outline traced around the lines it covers
 * (a staircase with rounded corners), instead of one box per line — so a
 * verse never overlaps itself, and two lit verses never touch: on a shared
 * line they meet halfway with GAP between them, and where one ends on the
 * line above the other's start, their outlines stand GAP apart too.
 *
 * Pure geometry (no DOM), coordinates in px relative to the layer.
 */

/** Space kept between two lit verses, horizontally and vertically. */
export const OUTLINE_GAP = 4;
/** Room around the words inside the outline. */
export const OUTLINE_PAD = 5;
/** Corner radius. */
export const OUTLINE_RADIUS = 11;

/** One line of a verse: its horizontal extent and the line's vertical band. */
export type OutlineRow = { x1: number; x2: number; top: number; bottom: number };

type Rect = { left: number; right: number; top: number; bottom: number };

/**
 * Group a verse's pieces (one rect per line fragment) into rows, one per line.
 * `band` gives a fragment's line band (the line element's box when known),
 * else the fragment's own top/bottom are used. Consecutive rows share their
 * boundary (the middle of the space between the lines).
 */
export function rowsFromRects(rects: Rect[], width: number, band?: (rect: Rect) => { top: number; bottom: number }): OutlineRow[] {
  const rows: OutlineRow[] = [];
  for (const rect of rects) {
    if (rect.right - rect.left < 1) continue;
    const line = band ? band(rect) : { top: rect.top, bottom: rect.bottom };
    const middle = (rect.top + rect.bottom) / 2;
    const row = rows.find((item) => middle >= item.top && middle <= item.bottom);
    if (row) {
      row.x1 = Math.min(row.x1, rect.left - OUTLINE_PAD);
      row.x2 = Math.max(row.x2, rect.right + OUTLINE_PAD);
      row.top = Math.min(row.top, line.top);
      row.bottom = Math.max(row.bottom, line.bottom);
    } else {
      rows.push({ x1: rect.left - OUTLINE_PAD, x2: rect.right + OUTLINE_PAD, top: line.top, bottom: line.bottom });
    }
  }
  rows.sort((a, b) => a.top - b.top);
  for (const row of rows) {
    row.x1 = Math.max(-4, row.x1);
    row.x2 = Math.min(width + 4, row.x2);
  }
  return rows;
}

/** Split rows into blocks that can be drawn as one outline (adjacent lines whose extents overlap). */
export function blocks(rows: OutlineRow[]): OutlineRow[][] {
  const out: OutlineRow[][] = [];
  for (const row of rows) {
    const block = out[out.length - 1];
    const above = block?.[block.length - 1];
    const height = above ? Math.min(above.bottom - above.top, row.bottom - row.top) : 0;
    const touching = above && row.top - above.bottom < height * 0.75;
    const overlap = above ? Math.min(above.x2, row.x2) - Math.max(above.x1, row.x1) : 0;
    if (block && touching && overlap > OUTLINE_RADIUS * 2) {
      const middle = (above.bottom + row.top) / 2;
      above.bottom = middle;
      row.top = middle;
      block.push(row);
    } else {
      out.push([row]);
    }
  }
  return out;
}

/** Two verses sharing a line meet halfway, GAP apart. Mutates both. */
export function separate(a: OutlineRow[], b: OutlineRow[]): void {
  for (const ra of a) {
    for (const rb of b) {
      const sameLine = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top) > 1;
      if (!sameLine || ra.x2 + OUTLINE_GAP <= rb.x1 || rb.x2 + OUTLINE_GAP <= ra.x1) continue;
      const [left, right] = ra.x1 + ra.x2 < rb.x1 + rb.x2 ? [ra, rb] : [rb, ra];
      const middle = (left.x2 + right.x1) / 2;
      left.x2 = middle - OUTLINE_GAP / 2;
      right.x1 = middle + OUTLINE_GAP / 2;
    }
  }
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.5;

/** SVG path of one block: the staircase around its rows, corners rounded. */
export function outlinePath(rows: OutlineRow[]): string {
  if (!rows.length) return "";
  const last = rows.length - 1;
  // The block's own top and bottom sit GAP/2 inside its lines, so a verse that
  // ends just above where another starts never touches it.
  const top = (k: number) => rows[k].top + (k === 0 ? OUTLINE_GAP / 2 : 0);
  const bottom = (k: number) => rows[k].bottom - (k === last ? OUTLINE_GAP / 2 : 0);
  const points: [number, number][] = [];
  points.push([rows[0].x1, top(0)], [rows[0].x2, top(0)]);
  rows.forEach((row, k) => {
    points.push([row.x2, bottom(k)]);
    if (k < last) points.push([rows[k + 1].x2, bottom(k)]);
  });
  for (let k = last; k >= 0; k--) {
    const row = rows[k];
    points.push([row.x1, bottom(k)], [row.x1, top(k)]);
    if (k > 0) points.push([rows[k - 1].x1, top(k)]);
  }
  // Drop repeated points, the closing copy of the first one, and collinear ones.
  const clean: [number, number][] = [];
  for (const point of points) {
    const previous = clean[clean.length - 1];
    if (previous && near(previous[0], point[0]) && near(previous[1], point[1])) continue;
    clean.push(point);
  }
  const first = clean[0];
  const end = clean[clean.length - 1];
  if (clean.length > 1 && near(first[0], end[0]) && near(first[1], end[1])) clean.pop();
  const polygon = clean.filter((point, k) => {
    const a = clean[(k - 1 + clean.length) % clean.length];
    const c = clean[(k + 1) % clean.length];
    return !((near(a[0], point[0]) && near(c[0], point[0])) || (near(a[1], point[1]) && near(c[1], point[1])));
  });
  const n = polygon.length;
  if (n < 3) return "";
  let d = "";
  for (let k = 0; k < n; k++) {
    const p = polygon[k];
    const a = polygon[(k - 1 + n) % n];
    const c = polygon[(k + 1) % n];
    const la = Math.hypot(p[0] - a[0], p[1] - a[1]);
    const lc = Math.hypot(c[0] - p[0], c[1] - p[1]);
    const r = Math.min(OUTLINE_RADIUS, la / 2, lc / 2);
    const s = [p[0] + ((a[0] - p[0]) * r) / la, p[1] + ((a[1] - p[1]) * r) / la];
    const e = [p[0] + ((c[0] - p[0]) * r) / lc, p[1] + ((c[1] - p[1]) * r) / lc];
    d += `${k ? "L" : "M"}${s[0].toFixed(1)} ${s[1].toFixed(1)}Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${e[0].toFixed(1)} ${e[1].toFixed(1)}`;
  }
  return `${d}Z`;
}
