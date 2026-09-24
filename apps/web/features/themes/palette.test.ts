import { describe, expect, it } from "vitest";

import { THEME_PALETTE, nextThemeColor } from "./palette";

describe("nextThemeColor", () => {
  it("picks the first unused colour", () => {
    expect(nextThemeColor([])).toBe("green");
    expect(nextThemeColor(["green", "rose"])).toBe("blue");
  });

  it("cycles once every colour is used", () => {
    const all = THEME_PALETTE.map((entry) => entry.key);
    expect(nextThemeColor(all)).toBe("green");
    expect(nextThemeColor([...all, "green"])).toBe("blue");
  });
});
