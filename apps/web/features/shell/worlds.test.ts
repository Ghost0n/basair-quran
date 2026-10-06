import { describe, expect, it } from "vitest";

import { PHONE_TABS, RAIL_GROUPS, worldOfMode } from "./worlds";

describe("worlds", () => {
  it("puts every page in its world; Home and Settings keep the current one", () => {
    expect(worldOfMode("reading")).toBe("reading");
    expect(worldOfMode("saved")).toBe("reading");
    expect(worldOfMode("index")).toBe("reading");
    expect(worldOfMode("search")).toBe("research");
    expect(worldOfMode("heatmap")).toBe("research");
    expect(worldOfMode("board")).toBe("research");
    expect(worldOfMode("community")).toBe("community");
    expect(worldOfMode("post")).toBe("community");
    expect(worldOfMode("home")).toBeNull();
    expect(worldOfMode("settings")).toBeNull();
  });

  it("gives the phone five fixed tabs, each page lighting exactly one", () => {
    expect(PHONE_TABS.map((tab) => tab.id)).toEqual(["home", "reader", "search", "study", "notebook"]);
    const owner = (mode: Parameters<typeof worldOfMode>[0]) => PHONE_TABS.filter((tab) => tab.owns.includes(mode)).map((tab) => tab.id);
    expect(owner("settings")).toEqual(["home"]);
    expect(owner("index")).toEqual(["reader"]);
    expect(owner("saved")).toEqual(["reader"]);
    expect(owner("heatmap")).toEqual(["search"]);
    expect(owner("document")).toEqual(["notebook"]);
    expect(owner("community")).toEqual([]);
  });

  it("lists every destination on the desktop rail, grouped by world", () => {
    expect(RAIL_GROUPS.map((group) => group.map((item) => item.id))).toEqual([
      ["reader", "index", "saved"],
      ["search", "study", "notebook"],
      ["community"],
    ]);
    for (const group of RAIL_GROUPS) {
      expect(new Set(group.map((item) => item.world)).size).toBe(1);
    }
  });

  it("keeps labels live (translated at read time, never copied)", () => {
    for (const tab of PHONE_TABS) expect(Object.getOwnPropertyDescriptor(tab, "label")?.get).toBeTypeOf("function");
  });
});
