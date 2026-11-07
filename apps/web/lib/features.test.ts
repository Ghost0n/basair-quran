import { describe, expect, it } from "vitest";

import { TAFSSIR_ENABLED, allowedStudyMode } from "./features";

describe("build-time features", () => {
  it("leaves the explanatory reading out unless the build turns it on", () => {
    expect(process.env.NEXT_PUBLIC_QB_TAFSSIR).toBeUndefined();
    expect(TAFSSIR_ENABLED).toBe(false);
  });

  it("sends every study turn from the Quran alone when the reading is left out", () => {
    expect(allowedStudyMode("tafssir")).toBe("strict");
    expect(allowedStudyMode("strict")).toBe("strict");
  });
});
