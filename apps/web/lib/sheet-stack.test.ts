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
