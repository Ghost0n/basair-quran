import { describe, expect, it } from "vitest";

import { keysBetween, parseWordKey, wordKey } from "./word-selection";

describe("word selection helpers", () => {
  const ordered = ["2:255:1", "2:255:2", "2:255:3", "2:256:1", "2:256:2"];

  it("selects an inclusive run in either direction", () => {
    expect(keysBetween(ordered, "2:255:2", "2:256:1")).toEqual(["2:255:2", "2:255:3", "2:256:1"]);
    expect(keysBetween(ordered, "2:256:1", "2:255:2")).toEqual(["2:255:2", "2:255:3", "2:256:1"]);
    expect(keysBetween(ordered, "2:255:3", "2:255:3")).toEqual(["2:255:3"]);
  });

  it("falls back to the focus word when the anchor scrolled away", () => {
    expect(keysBetween(ordered, "1:1:1", "2:256:2")).toEqual(["2:256:2"]);
  });

  it("round-trips word keys", () => {
    expect(parseWordKey(wordKey(3, 7, 12))).toEqual({ surah: 3, ayah: 7, position: 12 });
    expect(parseWordKey("x")).toBeNull();
  });
});
