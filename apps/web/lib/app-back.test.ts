import { describe, expect, it, vi } from "vitest";

import { handleBack } from "./app-back";

function deps(over: Partial<Parameters<typeof handleBack>[0]> = {}) {
  return {
    closeTopSheet: vi.fn(() => false),
    canGoBack: vi.fn(() => false),
    goBack: vi.fn(),
    exit: vi.fn(),
    ...over,
  };
}

describe("handleBack (Android's back button)", () => {
  it("closes an open sheet first, and goes nowhere", () => {
    const d = deps({ closeTopSheet: vi.fn(() => true), canGoBack: vi.fn(() => true) });
    expect(handleBack(d)).toBe("sheet");
    expect(d.goBack).not.toHaveBeenCalled();
    expect(d.exit).not.toHaveBeenCalled();
  });

  it("goes back in history when no sheet is open", () => {
    const d = deps({ canGoBack: vi.fn(() => true) });
    expect(handleBack(d)).toBe("back");
    expect(d.goBack).toHaveBeenCalledTimes(1);
    expect(d.exit).not.toHaveBeenCalled();
  });

  it("leaves the app from its first screen", () => {
    const d = deps();
    expect(handleBack(d)).toBe("exit");
    expect(d.exit).toHaveBeenCalledTimes(1);
    expect(d.goBack).not.toHaveBeenCalled();
  });
});
