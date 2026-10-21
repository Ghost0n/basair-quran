import { describe, expect, it } from "vitest";

import { getRoomWide, resetRoomFor, setRoomWide } from "./room";

describe("room width (panel beside the Mushaf)", () => {
  it("starts with the Mushaf shown", () => {
    resetRoomFor("search");
    expect(getRoomWide()).toBe(false);
  });

  it("widens the panel and back", () => {
    resetRoomFor("search");
    setRoomWide(true);
    expect(getRoomWide()).toBe(true);
    setRoomWide(false);
    expect(getRoomWide()).toBe(false);
  });

  it("resets when the page changes, not when the same page re-renders", () => {
    resetRoomFor("studio");
    setRoomWide(true);
    resetRoomFor("studio");
    expect(getRoomWide()).toBe(true);
    resetRoomFor("notebook");
    expect(getRoomWide()).toBe(false);
  });
});
