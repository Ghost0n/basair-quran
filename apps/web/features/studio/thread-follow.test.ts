import { describe, expect, it } from "vitest";

import { awayFromLatest } from "./thread-follow";

describe("awayFromLatest (the jump-to-latest arrow)", () => {
  it("stays hidden at the end of the thread, and within a short scroll of it", () => {
    expect(awayFromLatest({ scrollTop: 1000, clientHeight: 600, scrollHeight: 1600 })).toBe(false);
    expect(awayFromLatest({ scrollTop: 900, clientHeight: 600, scrollHeight: 1600 })).toBe(false);
  });

  it("shows once the reader has gone up the history", () => {
    expect(awayFromLatest({ scrollTop: 400, clientHeight: 600, scrollHeight: 1600 })).toBe(true);
  });

  it("stays hidden when the thread fits on the screen", () => {
    expect(awayFromLatest({ scrollTop: 0, clientHeight: 600, scrollHeight: 500 })).toBe(false);
  });
});
