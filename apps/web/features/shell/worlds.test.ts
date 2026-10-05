import { describe, expect, it } from "vitest";

import { activeTabId, stepWorld, worldOfMode, WORLD_ORDER, WORLDS } from "./worlds";

describe("worlds", () => {
  it("puts every page in its world; Home and Settings keep the current one", () => {
    expect(worldOfMode("reading")).toBe("reading");
    expect(worldOfMode("saved")).toBe("reading");
    expect(worldOfMode("index")).toBe("reading");
    expect(worldOfMode("search")).toBe("research");
    expect(worldOfMode("board")).toBe("research");
    expect(worldOfMode("post")).toBe("community");
    expect(worldOfMode("home")).toBeNull();
    expect(worldOfMode("settings")).toBeNull();
  });

  it("lights the right tab, sub-pages included", () => {
    expect(activeTabId("home", null)).toBe("home");
    expect(activeTabId("document", null)).toBe("notebook");
    expect(activeTabId("community", "mine")).toBe("mine");
    expect(activeTabId("community", "saved")).toBe("csaved");
    expect(activeTabId("community", null)).toBe("feed");
    expect(activeTabId("post", null)).toBe("feed");
    expect(activeTabId("studio", null)).toBe("study");
  });

  it("gives each world three pages and wraps when stepping", () => {
    for (const id of WORLD_ORDER) expect(WORLDS[id].tabs).toHaveLength(3);
    expect(stepWorld("community", 1)).toBe("reading");
    expect(stepWorld("reading", -1)).toBe("community");
  });
});
