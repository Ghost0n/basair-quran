import { afterEach, describe, expect, it, vi } from "vitest";

import { sheetStack } from "./sheet-stack";

describe("sheetStack", () => {
  const removers: (() => void)[] = [];
  afterEach(() => {
    while (removers.length) removers.pop()?.();
  });

  it("closes nothing when no sheet is open", () => {
    expect(sheetStack.closeTop()).toBe(false);
  });

  it("closes the most recent sheet first", () => {
    const first = vi.fn();
    const second = vi.fn();
    removers.push(sheetStack.push(first), sheetStack.push(second));
    expect(sheetStack.closeTop()).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("forgets a sheet once it is removed", () => {
    const close = vi.fn();
    const remove = sheetStack.push(close);
    remove();
    expect(sheetStack.closeTop()).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });
});

describe("sheetStack.isTop", () => {
  it("names the newest open sheet only, so Escape closes one sheet at a time", () => {
    const outer = () => undefined;
    const inner = () => undefined;
    const leaveOuter = sheetStack.push(outer);
    const leaveInner = sheetStack.push(inner);
    expect(sheetStack.isTop(inner)).toBe(true);
    expect(sheetStack.isTop(outer)).toBe(false);
    leaveInner();
    expect(sheetStack.isTop(outer)).toBe(true);
    leaveOuter();
    expect(sheetStack.isTop(outer)).toBe(false);
  });
});
