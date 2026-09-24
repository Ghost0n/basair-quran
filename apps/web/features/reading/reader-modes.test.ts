import { describe, expect, it } from "vitest";

import { nextReaderLayout, resolveReaderMode, spreadFits } from "./reader-modes";

describe("reader modes", () => {
  it("resolves auto per device and keeps explicit choices", () => {
    expect(resolveReaderMode("auto", true)).toBe("scroll");
    expect(resolveReaderMode("auto", false)).toBe("pages");
    expect(resolveReaderMode("single", true)).toBe("pages");
    expect(resolveReaderMode("spread", false)).toBe("pages");
    expect(resolveReaderMode("ayah", false)).toBe("ayah");
    expect(resolveReaderMode(undefined, false)).toBe("pages");
  });

  it("cycles pages → scroll → ayah → pages", () => {
    expect(nextReaderLayout("single", false)).toBe("scroll");
    expect(nextReaderLayout("scroll", false)).toBe("ayah");
    expect(nextReaderLayout("ayah", false)).toBe("single");
    // auto on a phone shows scroll, so the next mode is ayah.
    expect(nextReaderLayout("auto", true)).toBe("ayah");
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
