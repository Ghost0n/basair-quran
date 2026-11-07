import { describe, expect, test } from "vitest";

import { cmpKey, pyRound3, sequenceRatio, sortBy, split, strip } from "../src/py";

// Expected values are what CPython 3.11 prints for the same inputs.
describe("Python semantics", () => {
  test("difflib.SequenceMatcher.ratio, including the autojunk heuristic for long inputs", () => {
    expect(sequenceRatio("رحمة", "رحمه")).toBe(0.75);
    expect(sequenceRatio("الكتاب", "كتاب")).toBe(0.8);
    expect(sequenceRatio("abcd", "bcda")).toBe(0.75);
    expect(sequenceRatio("", "")).toBe(1.0);
    expect(sequenceRatio("xyz", "abc")).toBe(0.0);
    expect(sequenceRatio("السموات", "السماوات")).toBe(0.9333333333333333);
    expect(sequenceRatio(`${"a".repeat(250)}b`, `${"a".repeat(240)}bc`)).toBe(0.9776876267748479);
  });

  test("round(x, 3) rounds exact ties to even, like Python", () => {
    expect([0.0625, 0.1875, 0.9375, 0.3125, 0.8125, 0.123456, 0.9995].map(pyRound3)).toEqual([0.062, 0.188, 0.938, 0.312, 0.812, 0.123, 1.0]);
  });

  test("str.split() / str.strip() whitespace", () => {
    expect(split("  a　b\x1cc  d ")).toEqual(["a", "b", "c", "d"]);
    expect(split("a﻿b")).toEqual(["a﻿b"]); // not whitespace in Python
    expect(strip("  x \n")).toBe("x");
  });

  test("tuple ordering and stable sorts", () => {
    expect(cmpKey([1, "b"], [1, "a"])).toBe(1);
    expect(cmpKey([-0.9, 0], [-0.8, 5])).toBe(-1);
    expect(sortBy(["bb", "a", "ab", "b"], (s) => [s.length])).toEqual(["a", "b", "bb", "ab"]);
  });
});
