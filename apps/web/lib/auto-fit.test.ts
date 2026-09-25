import { describe, expect, it } from "vitest";

import { fitElement, isOverflowing } from "./auto-fit";

/** A stand-in element whose content width depends on its current fit level. */
function fakeElement(max: number, contentWidthAtLevel: number[], box = 300, watched: { scrollWidth: number; clientWidth: number }[] = []) {
  const dataset: Record<string, string> = { autofit: String(max) };
  return {
    dataset,
    clientWidth: box,
    get scrollWidth() {
      return contentWidthAtLevel[Number(dataset.fit ?? 0)] ?? contentWidthAtLevel.at(-1)!;
    },
    getBoundingClientRect: () => ({ left: 0, right: box }),
    querySelector: () => null,
    querySelectorAll: () => watched.map((item) => ({ ...item, getClientRects: () => [1] })),
  } as unknown as HTMLElement;
}

describe("auto-fit", () => {
  it("stays at level 0 when the content fits", () => {
    const element = fakeElement(3, [280, 250, 200]);
    expect(fitElement(element)).toBe(0);
    expect(element.dataset.fit).toBe("0");
  });

  it("steps up only as far as needed", () => {
    const element = fakeElement(3, [420, 360, 290, 250]);
    expect(fitElement(element)).toBe(2);
    expect(element.dataset.fit).toBe("2");
  });

  it("stops at the maximum level even if content still overflows", () => {
    const element = fakeElement(2, [600, 500, 400]);
    expect(fitElement(element)).toBe(2);
  });

  it("returns to a lower level when room comes back (it always re-measures from 0)", () => {
    const widths = [420, 360, 290];
    const element = fakeElement(2, widths);
    expect(fitElement(element)).toBe(2);
    widths[0] = 280; // e.g. the language changed to a shorter one
    expect(fitElement(element)).toBe(0);
  });

  it("treats a clipped watched descendant as overflow", () => {
    expect(isOverflowing(fakeElement(1, [200], 300, [{ scrollWidth: 90, clientWidth: 60 }]))).toBe(true);
    expect(isOverflowing(fakeElement(1, [200], 300, [{ scrollWidth: 60, clientWidth: 60 }]))).toBe(false);
  });
});
