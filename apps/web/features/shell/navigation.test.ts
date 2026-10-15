import { beforeEach, describe, expect, it } from "vitest";

import { canGoBackInApp, markReplace, previousScreen, recordScreen, resetBackStackForTests } from "./navigation";

describe("the in-app back stack", () => {
  beforeEach(() => resetBackStackForTests());

  it("starts with nowhere to go back to", () => {
    recordScreen("");
    expect(canGoBackInApp()).toBe(false);
  });

  it("follows forward navigation and the browser's back", () => {
    recordScreen("");
    recordScreen("mode=search");
    recordScreen("mode=reading");
    expect(previousScreen()).toBe("mode=search");
    // Back to search: the reader is popped.
    recordScreen("mode=search");
    expect(previousScreen()).toBe("");
    expect(canGoBackInApp()).toBe(true);
  });

  it("does not stack a screen that replaced another", () => {
    recordScreen("");
    recordScreen("mode=search");
    markReplace();
    recordScreen("mode=search&q=x");
    expect(previousScreen()).toBe("");
  });

  it("ignores a repeated report of the same screen", () => {
    recordScreen("");
    recordScreen("mode=search");
    recordScreen("mode=search");
    expect(previousScreen()).toBe("");
  });
});
