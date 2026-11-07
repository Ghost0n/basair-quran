import { describe, expect, it } from "vitest";

import { chipCentringDelta } from "./settings-index";

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
