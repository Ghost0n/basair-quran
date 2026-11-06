import { describe, expect, it } from "vitest";

import { followsPointer, releaseTurn } from "./use-reader-gestures";

describe("followsPointer", () => {
  it("follows a finger or a pen", () => {
    expect(followsPointer({ pointerType: "touch", isPrimary: true, button: 0 }, false)).toBe(true);
    expect(followsPointer({ pointerType: "pen", isPrimary: true, button: 0 }, false)).toBe(true);
  });

  it("leaves the mouse to the arrows on a wide reader", () => {
    expect(followsPointer({ pointerType: "mouse", isPrimary: true, button: 0 }, false)).toBe(false);
  });

  it("lets the main mouse button drag the page on a phone layout", () => {
    expect(followsPointer({ pointerType: "mouse", isPrimary: true, button: 0 }, true)).toBe(true);
    expect(followsPointer({ pointerType: "mouse", isPrimary: true, button: 2 }, true)).toBe(false);
  });

  it("ignores a second finger", () => {
    expect(followsPointer({ pointerType: "touch", isPrimary: false, button: 0 }, true)).toBe(false);
  });
});

describe("releaseTurn", () => {
  it("turns forward when the page is dragged right past a quarter of the screen (RTL book)", () => {
    expect(releaseTurn(120, 2000, 400)).toBe("next");
  });

  it("turns back when dragged left on a quick flick", () => {
    expect(releaseTurn(-60, 200, 400)).toBe("prev");
  });

  it("springs back on a short slow drag", () => {
    expect(releaseTurn(60, 2000, 400)).toBeNull();
  });
});
