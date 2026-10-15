import { beforeEach, describe, expect, it } from "vitest";

import { canGoBackInApp, markReplace, noteReaderOpening, previousScreen, readerBackLeadsHome, recordScreen, resetBackStackForTests } from "./navigation";

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

describe("where the reader's back arrow leads", () => {
  beforeEach(() => resetBackStackForTests());

  it("goes Home when the reader was opened from the tab bar, whatever the page", () => {
    recordScreen("");
    recordScreen("mode=notebook");
    noteReaderOpening(true);
    recordScreen("mode=reading");
    expect(readerBackLeadsHome()).toBe(true);
  });

  it("goes back to the page that opened it otherwise", () => {
    recordScreen("");
    recordScreen("mode=search&q=x");
    noteReaderOpening(false);
    recordScreen("mode=reading");
    expect(readerBackLeadsHome()).toBe(false);
    expect(previousScreen()).toBe("mode=search&q=x");
  });

  it("shows Home when Home is the screen before it", () => {
    recordScreen("");
    noteReaderOpening(false);
    recordScreen("mode=reading");
    expect(readerBackLeadsHome()).toBe(true);
  });
});
