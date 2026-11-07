import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));

import { haptic } from "@/lib/haptics";

import { endDrag, followsPointer, mouseMoved, releaseTurn } from "./use-reader-gestures";

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

describe("endDrag", () => {
  it("answers a page the drag turned with a light tap", () => {
    vi.mocked(haptic).mockClear();
    endDrag("next", () => true);
    expect(haptic).toHaveBeenCalledWith("light");
  });

  it("stays silent when the turn is refused (first or last page) or the page springs back", () => {
    vi.mocked(haptic).mockClear();
    const commit = vi.fn(() => false);
    endDrag("prev", commit);
    endDrag(null, commit);
    expect(commit).toHaveBeenNthCalledWith(1, "prev");
    expect(commit).toHaveBeenNthCalledWith(2, null);
    expect(haptic).not.toHaveBeenCalled();
  });
});

describe("mouseMoved", () => {
  it("takes a mouse release that travelled for the end of a drag, not a click", () => {
    expect(mouseMoved("mouse", 40, 2)).toBe(true);
    expect(mouseMoved("mouse", 2, 30)).toBe(true);
  });

  it("leaves a still click and every finger alone", () => {
    expect(mouseMoved("mouse", 3, 2)).toBe(false);
    expect(mouseMoved("touch", 40, 2)).toBe(false);
  });
});
