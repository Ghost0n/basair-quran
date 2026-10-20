import { beforeEach, describe, expect, it } from "vitest";

import { isFollowPaused, requestShowRecited, resetFollowForTests, setFollowPaused, showRecitedPending, takeShowRecited } from "./follow";

describe("following the recitation", () => {
  beforeEach(() => resetFollowForTests());

  it("follows by default, pauses for a place opened on purpose", () => {
    expect(isFollowPaused()).toBe(false);
    setFollowPaused(true);
    expect(isFollowPaused()).toBe(true);
  });

  it("hands a «show the recited verse» request over once", () => {
    expect(takeShowRecited()).toBe(false);
    requestShowRecited();
    expect(showRecitedPending()).toBe(true);
    expect(takeShowRecited()).toBe(true);
    expect(takeShowRecited()).toBe(false);
  });
});
