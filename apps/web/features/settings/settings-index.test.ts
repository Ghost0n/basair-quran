import { describe, expect, it } from "vitest";

import { chipCentringDelta, chipScrollTarget } from "./settings-index";

describe("chipCentringDelta", () => {
  const row = { left: 0, width: 390 };

  it("brings a chip that is off to one side into the middle of the row", () => {
    expect(chipCentringDelta(row, { left: 400, width: 120 })).toBe(265);
    expect(chipCentringDelta(row, { left: -300, width: 100 })).toBe(-445);
  });

  it("leaves a chip already in the middle where it is", () => {
    expect(chipCentringDelta(row, { left: 145, width: 100 })).toBe(0);
  });
});

describe("chipScrollTarget", () => {
  it("stays inside the row's range, left to right", () => {
    expect(chipScrollTarget(40, -200, 300, false)).toBe(0);
    expect(chipScrollTarget(250, 200, 300, false)).toBe(300);
    expect(chipScrollTarget(100, 50, 300, false)).toBe(150);
  });

  it("stays inside the row's range, right to left (negative scrollLeft)", () => {
    expect(chipScrollTarget(-40, 200, 300, true)).toBe(0);
    expect(chipScrollTarget(-250, -200, 300, true)).toBe(-300);
    expect(chipScrollTarget(-100, -50, 300, true)).toBe(-150);
  });
});
