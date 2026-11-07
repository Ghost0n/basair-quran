import { describe, expect, it } from "vitest";

import { nextReaderLayout, resolveReaderMode, spreadFits } from "./reader-modes";

describe("reader modes", () => {
  it("reads every layout as pages except verse by verse", () => {
    expect(resolveReaderMode("auto")).toBe("pages");
    expect(resolveReaderMode("single")).toBe("pages");
    expect(resolveReaderMode("spread")).toBe("pages");
    // The retired continuous scroll mode opens as pages.
    expect(resolveReaderMode("scroll")).toBe("pages");
    expect(resolveReaderMode("ayah")).toBe("ayah");
    expect(resolveReaderMode(undefined)).toBe("pages");
  });

  it("toggles pages ↔ verse by verse", () => {
    expect(nextReaderLayout("single")).toBe("ayah");
    expect(nextReaderLayout("auto")).toBe("ayah");
    expect(nextReaderLayout("scroll")).toBe("ayah");
    expect(nextReaderLayout("ayah")).toBe("single");
  });
});

describe("spreadFits", () => {
  it("allows a spread only when both pages keep (almost) single-page size", () => {
    expect(spreadFits(1220, 630)).toBe(true); // laptop 1366×768
    expect(spreadFits(1740, 900)).toBe(true); // desktop 1920×1080
    expect(spreadFits(672, 1050)).toBe(false); // tablet portrait
    expect(spreadFits(1000, 900)).toBe(false); // would shrink each page too much
    expect(spreadFits(0, 600)).toBe(false);
  });
});
