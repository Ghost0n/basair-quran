import { beforeEach, describe, expect, it, vi } from "vitest";

import { canGoBackInApp, goTo, markReplace, noteReaderOpening, previousScreen, readerBackLeadsHome, recordScreen, resetBackStackForTests } from "./navigation";

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

describe("goTo", () => {
  it("moves between screens through history, in the browser and in the app alike", () => {
    const calls: string[] = [];
    const history = {
      pushState: (_s: unknown, _t: string, url: string) => calls.push(`push ${url}`),
      replaceState: (_s: unknown, _t: string, url: string) => calls.push(`replace ${url}`),
    };
    vi.stubGlobal("window", { history });
    vi.stubGlobal("document", { documentElement: { classList: { contains: () => false } } });
    goTo("/?mode=search");
    goTo("/?mode=search&q=x", true);
    vi.unstubAllGlobals();
    expect(calls).toEqual(["push /?mode=search", "replace /?mode=search&q=x"]);
  });
});
