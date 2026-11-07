import { describe, expect, it } from "vitest";

import { kwicWindow } from "./quran-ui";

const TEXT = "w1 w2 w3 w4 w5 w6 w7 w8 w9 w10 w11 w12 w13 w14 w15";

describe("kwicWindow", () => {
  it("centres a window on the hit and flags elided sides", () => {
    const result = kwicWindow(TEXT, [8], 2);
    expect(result.words.map((w) => w.word)).toEqual(["w6", "w7", "w8", "w9", "w10"]);
    expect(result.words.find((w) => w.hit)?.position).toBe(8);
    expect(result.before).toBe(true);
    expect(result.after).toBe(true);
  });

  it("clamps at the verse edges", () => {
    const start = kwicWindow(TEXT, [1], 3);
    expect(start.words[0].word).toBe("w1");
    expect(start.before).toBe(false);
    const end = kwicWindow(TEXT, [15], 3);
    expect(end.words.at(-1)?.word).toBe("w15");
    expect(end.after).toBe(false);
  });

  it("keeps nearby hits together, centres on the first when far apart", () => {
    expect(kwicWindow(TEXT, [5, 7], 2).words.map((w) => w.position)).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(kwicWindow(TEXT, [2, 14], 2).words.map((w) => w.position)).toEqual([1, 2, 3, 4]);
  });

  it("shows the verse opening when nothing is highlighted", () => {
    const result = kwicWindow("a b c", [], 4);
    expect(result.words.map((w) => w.word)).toEqual(["a", "b", "c"]);
    expect(result.before || result.after).toBe(false);
  });
});
