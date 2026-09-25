/**
 * Python semantics the engine needs to reproduce the server's answers exactly:
 * whitespace (`str.split()` / `str.strip()`), code-point string order, tuple
 * sorting, `round()` (half-to-even on exact ties) and `difflib.SequenceMatcher`.
 */

/** Characters for which Python's `str.isspace()` is true. */
const PY_SPACE = "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const SPACE_RUN = new RegExp(`[${PY_SPACE}]+`, "g");
const SPACE_CHAR = new RegExp(`^[${PY_SPACE}]$`);
const EDGES = new RegExp(`^[${PY_SPACE}]+|[${PY_SPACE}]+$`, "g");

export const PY_SPACE_CLASS = PY_SPACE;

export function isSpace(char: string): boolean {
  return SPACE_CHAR.test(char);
}

/** `str.split()` with no separator. */
export function split(text: string): string[] {
  return text.split(SPACE_RUN).filter((part) => part !== "");
}

/** `str.strip()` with no argument. */
export function strip(text: string): string {
  return text.replace(EDGES, "");
}

/** Code points of a string (Python iterates and measures strings this way). */
export function chars(text: string): string[] {
  return Array.from(text);
}

export function len(text: string): number {
  let count = 0;
  for (const _ of text) count += 1;
  return count;
}

/** Python / SQLite (BINARY) string order: by code point. */
export function cmpStr(a: string, b: string): number {
  if (a === b) return 0;
  const left = chars(a);
  const right = chars(b);
  const size = Math.min(left.length, right.length);
  for (let index = 0; index < size; index += 1) {
    const x = left[index].codePointAt(0)!;
    const y = right[index].codePointAt(0)!;
    if (x !== y) return x < y ? -1 : 1;
  }
  return left.length - right.length < 0 ? -1 : left.length === right.length ? 0 : 1;
}

export type Key = number | string | null | Key[];

/** Python tuple comparison (numbers numerically, strings by code point). */
export function cmpKey(a: Key, b: Key): number {
  if (Array.isArray(a) && Array.isArray(b)) {
    const size = Math.min(a.length, b.length);
    for (let index = 0; index < size; index += 1) {
      const result = cmpKey(a[index], b[index]);
      if (result !== 0) return result;
    }
    return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
  }
  if (typeof a === "string" && typeof b === "string") return cmpStr(a, b);
  if (typeof a === "number" && typeof b === "number") return a === b ? 0 : a < b ? -1 : 1;
  throw new TypeError(`cannot compare ${typeof a} with ${typeof b}`);
}

/** Stable sort by a Python-style key (Python's sort is stable too). */
export function sortBy<T>(items: T[], key: (item: T) => Key): T[] {
  const keyed = items.map((item, index) => ({ item, key: key(item), index }));
  keyed.sort((x, y) => cmpKey(x.key, y.key) || x.index - y.index);
  return keyed.map((entry) => entry.item);
}

/**
 * `round(x, 3)`. Both Python and `toFixed` round the exact binary value, so
 * they only disagree on exact ties (x·1000 = k + ½), where Python rounds half
 * to even. A double is such a tie only when x·16 is an odd integer.
 */
export function pyRound3(x: number): number {
  const sixteenths = x * 16;
  if (Number.isInteger(sixteenths) && Math.abs(sixteenths) % 2 === 1) {
    const scaled = x * 1000; // exact: x = m/16, so x·1000 = 62.5·m
    const floor = Math.floor(scaled);
    const even = floor % 2 === 0 ? floor : floor + 1;
    return even / 1000;
  }
  return Number(x.toFixed(3));
}

/** Python's left-to-right float `sum()` (3.11 — no compensated summation). */
export function sum(values: number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/**
 * `difflib.SequenceMatcher(None, a, b).ratio()`, ported line for line
 * (including the "popular element" autojunk heuristic for b ≥ 200 items).
 */
export function sequenceRatio(aText: string, bText: string): number {
  const a = chars(aText);
  const b = chars(bText);
  const b2j = new Map<string, number[]>();
  b.forEach((element, index) => {
    const indices = b2j.get(element);
    if (indices) indices.push(index);
    else b2j.set(element, [index]);
  });
  if (b.length >= 200) {
    const ntest = Math.floor(b.length / 100) + 1;
    for (const [element, indices] of [...b2j]) if (indices.length > ntest) b2j.delete(element);
  }

  const findLongestMatch = (alo: number, ahi: number, blo: number, bhi: number): [number, number, number] => {
    let besti = alo;
    let bestj = blo;
    let bestsize = 0;
    let j2len = new Map<number, number>();
    for (let i = alo; i < ahi; i += 1) {
      const newj2len = new Map<number, number>();
      for (const j of b2j.get(a[i]) ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) ?? 0) + 1;
        newj2len.set(j, k);
        if (k > bestsize) {
          besti = i - k + 1;
          bestj = j - k + 1;
          bestsize = k;
        }
      }
      j2len = newj2len;
    }
    // No junk (isjunk is None), so only the non-junk extensions apply.
    while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) {
      besti -= 1;
      bestj -= 1;
      bestsize += 1;
    }
    while (besti + bestsize < ahi && bestj + bestsize < bhi && a[besti + bestsize] === b[bestj + bestsize]) {
      bestsize += 1;
    }
    return [besti, bestj, bestsize];
  };

  let matches = 0;
  const queue: [number, number, number, number][] = [[0, a.length, 0, b.length]];
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop()!;
    const [i, j, k] = findLongestMatch(alo, ahi, blo, bhi);
    if (k) {
      matches += k;
      if (alo < i && blo < j) queue.push([alo, i, blo, j]);
      if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
    }
  }
  const length = a.length + b.length;
  return length ? (2.0 * matches) / length : 1.0;
}

/** An insertion-ordered LRU map, like the server's OrderedDict caches. */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly limit: number | null = null) {}

  has(key: K): boolean {
    return this.map.has(key);
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): V {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.limit !== null) {
      while (this.map.size > this.limit) this.map.delete(this.map.keys().next().value as K);
    }
    return value;
  }

  clear(): void {
    this.map.clear();
  }
}
