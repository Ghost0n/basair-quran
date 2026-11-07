import { describe, expect, it } from "vitest";

import { readerBarInTopBar } from "./reader-bar-place";

describe("readerBarInTopBar", () => {
  it("puts the reader's tools in the top bar while reading, in the medium band too", () => {
    expect(readerBarInTopBar("medium", "reading", false)).toBe(true);
    expect(readerBarInTopBar("wide", "reading", true)).toBe(true);
  });

  it("leaves a medium page's top bar to the page, since the Mushaf is not in view", () => {
    expect(readerBarInTopBar("medium", "search", false)).toBe(false);
  });

  it("keeps the reader's tools in the wide top bar beside a page, unless the page is widened", () => {
    expect(readerBarInTopBar("wide", "search", false)).toBe(true);
    expect(readerBarInTopBar("wide", "search", true)).toBe(false);
  });

  it("never puts them in the top bar on a phone", () => {
    expect(readerBarInTopBar("phone", "reading", false)).toBe(false);
  });
});
